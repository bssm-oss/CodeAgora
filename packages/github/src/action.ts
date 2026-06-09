#!/usr/bin/env node
/**
 * CodeAgora GitHub Action Entrypoint
 *
 * Standalone CLI for GitHub Actions runner.
 * Reads action inputs from environment, runs the review pipeline,
 * posts results to the PR, and sets commit status.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import { appendFileSync } from 'fs';
import { runPipeline } from '@codeagora/core/pipeline/orchestrator.js';
import { buildDiffPositionIndex } from './diff-parser.js';
import { mapToGitHubReview } from './mapper.js';
import { postReview, setCommitStatus, handleNeedsHuman } from './poster.js';
import { createAppOctokit } from './client.js';
import { fetchPrMetadata } from './pr-diff.js';
import { buildSarifReport, serializeSarif } from './sarif.js';
import { loadConfigFile } from '@codeagora/core/config/loader.js';
import {
  determineActionPolicy,
  getActionGuidance,
  isStaleHead,
  parseActionInputs,
  validateActionDiffPath,
  validateActionOutputPath,
} from './action-policy.js';
import type { ActionDegradedReason } from '@codeagora/shared/contracts/stable.js';

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const inputs = parseActionInputs(process.argv);
  const [owner, repo] = inputs.repo.split('/');

  if (!owner || !repo) {
    console.error('Error: --repo must be in <owner>/<repo> format');
    process.exit(1);
  }

  setActionOutput('head-sha', inputs.sha);
  if (inputs.baseSha) setActionOutput('base-sha', inputs.baseSha);

  const safeDiffPath = await validateActionDiffPath(inputs.diff);

  const actionPolicy = determineActionPolicy(inputs);
  if (actionPolicy.degraded) {
    if (actionPolicy.degradedReason) {
      setActionDegraded(actionPolicy.degradedReason);
      logActionDiagnostic(
        actionPolicy.shouldRunReview ? 'Running in degraded mode' : 'Review skipped',
        actionPolicy.degradedReason,
        undefined,
      );
    }
  } else {
    setActionOutput('degraded', 'false');
  }

  if (!actionPolicy.shouldRunReview) {
    if (actionPolicy.degradedReason) {
      writeActionSummary('skipped', actionPolicy.degradedReason);
    }
    setActionOutput('verdict', actionPolicy.verdictOverride ?? 'SKIPPED');
    return;
  }

  // Check diff line count
  if (inputs.maxDiffLines > 0) {
    const diffContent = await fs.readFile(safeDiffPath, 'utf-8');
    const lineCount = diffContent.split('\n').length;
    if (lineCount > inputs.maxDiffLines) {
      logActionDiagnostic(
        'Diff too large',
        'diff-too-large',
        `Diff has ${lineCount} lines (limit: ${inputs.maxDiffLines}).`,
      );
      setActionDegraded('diff-too-large');
      setActionOutput('verdict', 'SKIPPED');
      writeActionSummary('skipped', 'diff-too-large', `Diff has ${lineCount} lines (limit: ${inputs.maxDiffLines}).`);
      return;
    }
  }

  // Load config early — used for pipeline and mapper options.
  // Use the normalized input value (CLI > env > default) rather than reading
  // directly from process.env. Any failure to load the config is handled
  // by loadConfigFile and surfaced via degraded outputs.
  const configPath = inputs.configPath;
  const config = await loadConfigFile(configPath, { rootDir: process.cwd() }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    logActionDiagnostic('Config load degraded', 'config-load-failed', message);
    setActionDegraded('config-load-failed');
    writeActionSummary('degraded', 'config-load-failed', message);
    return null;
  });

  // Run pipeline (#259: pass repoPath for surrounding code context)
  console.log('::group::Running CodeAgora review pipeline');
  const result = await runPipeline({
    diffPath: safeDiffPath,
    repoPath: process.cwd(),
    configPath: config ? configPath : undefined,
  });
  console.log('::endgroup::');

  if (result.status === 'error') {
    console.error(`::error::Pipeline failed: ${result.error}`);
    process.exit(2);
  }

  if (!result.summary) {
    console.log('No issues found.');
    setActionOutput('verdict', 'ACCEPT');
    setActionOutput('session-id', result.sessionId);
    return;
  }

  // Read diff for position index
  const diffContent = await fs.readFile(safeDiffPath, 'utf-8');
  const positionIndex = buildDiffPositionIndex(diffContent);

  // Use full evidence docs, discussions, and reviewer map from pipeline result
  const evidenceDocs = result.evidenceDocs ?? [];
  const discussions = result.discussions ?? [];
  const reviewerMap = result.reviewerMap ? new Map(Object.entries(result.reviewerMap)) : undefined;
  const reviewerOpinions = result.reviewerOpinions
    ? new Map(Object.entries(result.reviewerOpinions))
    : undefined;

  // Build review payload
  const ghConfig = { token: inputs.token, owner, repo };
  const ghIntegration = config?.github;
  const review = mapToGitHubReview({
    summary: result.summary,
    evidenceDocs,
    discussions,
    positionIndex,
    headSha: inputs.sha,
    sessionId: result.sessionId,
    sessionDate: result.date,
    reviewerMap,
    reviewerOpinions,
    devilsAdvocateId: result.devilsAdvocateId,
    supporterModelMap: result.supporterModelMap
      ? new Map(Object.entries(result.supporterModelMap))
      : undefined,
    reviewRun: result.reviewRun,
    reviewQueues: result.reviewQueues,
    options: {
      postSuggestions: ghIntegration?.postSuggestions,
      collapseDiscussions: ghIntegration?.collapseDiscussions,
    },
    minConfidence: ghIntegration?.minConfidence,
  });

  const appKit = await createAppOctokit(owner, repo);
  if (appKit) console.log('Using GitHub App authentication (CodeAgora Bot)');

  let reviewUrl = '';
  let postedVerdict = result.summary.decision;

  if (actionPolicy.shouldPostResults) {
    console.log('::group::Posting review to GitHub');
    const currentPr = await fetchPrMetadata(ghConfig, inputs.pr, appKit ?? undefined);
    if (isStaleHead(inputs.sha, currentPr.headSha)) {
      logActionDiagnostic(
        'Stale head SHA',
        'stale-head-sha',
        `PR head changed from ${inputs.sha} to ${currentPr.headSha}; skipping stale posting.`,
      );
      setActionDegraded('stale-head-sha');
      setActionOutput('verdict', 'SKIPPED');
      writeActionSummary(
        'skipped',
        'stale-head-sha',
        `PR head changed from ${inputs.sha} to ${currentPr.headSha}; skipping stale posting.`,
      );
      console.log('::endgroup::');
      return;
    }

    try {
      const postResult = await postReview(ghConfig, inputs.pr, review, appKit ?? undefined);
      await setCommitStatus(ghConfig, inputs.sha, postResult.verdict, postResult.reviewUrl, appKit ?? undefined);
      reviewUrl = postResult.reviewUrl;
      postedVerdict = postResult.verdict;

      // Handle NEEDS_HUMAN: request reviewers and add label
      if (postResult.verdict === 'NEEDS_HUMAN') {
        await handleNeedsHuman(ghConfig, inputs.pr, {
          humanReviewers: ghIntegration?.humanReviewers,
          humanTeams: ghIntegration?.humanTeams,
          needsHumanLabel: ghIntegration?.needsHumanLabel,
        }, appKit ?? undefined);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActionDiagnostic('GitHub posting degraded', 'github-post-failed', message);
      setActionDegraded('github-post-failed');
      writeActionSummary('degraded', 'github-post-failed', message);
    }
    console.log('::endgroup::');
  } else {
    logActionDiagnostic(
      'GitHub posting skipped',
      actionPolicy.degradedReason ?? 'posting-disabled',
      undefined,
    );
    writeActionSummary('degraded', actionPolicy.degradedReason ?? 'posting-disabled');
  }

  // Generate SARIF output — validate path to prevent traversal attacks
  const rawSarifPath = config?.github?.sarifOutputPath ?? '/tmp/codeagora-results.sarif';
  try {
    const safeSarifPath = await validateActionOutputPath(rawSarifPath, process.cwd());
    const sarifReport = buildSarifReport(evidenceDocs, result.sessionId, result.date);
    await fs.writeFile(safeSarifPath, serializeSarif(sarifReport));
    console.log(`SARIF report written to ${safeSarifPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logActionDiagnostic('SARIF output skipped', 'sarif-write-failed', message);
    setActionDegraded('sarif-write-failed');
    writeActionSummary('degraded', 'sarif-write-failed', message);
  }

  // Set outputs
  setActionOutput('verdict', result.summary.decision);
  if (reviewUrl) setActionOutput('review-url', reviewUrl);
  setActionOutput('session-id', result.sessionId);

  if (reviewUrl) console.log(`Review posted: ${reviewUrl}`);
  console.log(`Verdict: ${result.summary.decision}`);

  // Exit with failure if REJECT and failOnReject is enabled
  if (postedVerdict === 'REJECT' && inputs.failOnReject) {
    process.exit(1);
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Set a GitHub Actions output variable.
 * Writes to $GITHUB_OUTPUT file if available, falls back to ::set-output.
 */
function setActionOutput(name: string, value: string): void {
  const outputFile = process.env['GITHUB_OUTPUT'];
  if (outputFile) {
    if (value.includes('\n')) {
      // Use heredoc delimiter for multiline values
      const delimiter = `EOF_${crypto.randomBytes(16).toString('hex')}`;
      appendFileSync(outputFile, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
    } else {
      appendFileSync(outputFile, `${name}=${value}\n`);
    }
  } else {
    // Fallback for older runners
    console.log(`::set-output name=${name}::${value}`);
  }
}

function setActionDegraded(reason: ActionDegradedReason): void {
  setActionOutput('degraded', 'true');
  setActionOutput('degraded-reason', reason);
}

function logActionDiagnostic(
  title: string,
  reason: ActionDegradedReason,
  detail?: string,
): void {
  const guidance = getActionGuidance(reason);
  console.log(`::group::CodeAgora ${title}`);
  console.log(`Reason: ${reason}`);
  console.log(`Why: ${guidance.why}`);
  if (detail) {
    console.log(`Detail: ${detail}`);
  }
  console.log('Next steps:');
  for (const step of guidance.nextSteps) {
    console.log(`- ${step}`);
  }
  console.log('::endgroup::');
}

function writeActionSummary(
  status: 'degraded' | 'skipped',
  reason: ActionDegradedReason,
  detail?: string,
): void {
  const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
  if (!summaryFile) return;

  const guidance = getActionGuidance(reason);
  const lines = [
    `### CodeAgora review ${status}`,
    '',
    `- Reason: \`${reason}\``,
    `- Why: ${guidance.why}`,
    ...(detail ? [`- Detail: ${detail}`] : []),
    '- Next steps:',
    ...guidance.nextSteps.map((step) => `  - ${step}`),
    '',
  ];

  appendFileSync(summaryFile, `${lines.join('\n')}\n`);
}

main().catch((err) => {
  console.error(`::error::${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
