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
import { determineActionPolicy, formatActionWarning, isStaleHead, parseActionInputs, validateActionDiffPath, validateActionOutputPath } from './action-policy.js';
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
    if (actionPolicy.degradedReason) setActionDegraded(actionPolicy.degradedReason);
  } else {
    setActionOutput('degraded', 'false');
  }

  if (!actionPolicy.shouldRunReview) {
    console.log(formatActionWarning(
      actionPolicy.degradedReason ?? 'degraded',
      getActionNextStep(actionPolicy.degradedReason ?? 'degraded'),
      getActionContext(actionPolicy.degradedReason ?? 'degraded', inputs),
    ));
    setActionOutput('verdict', actionPolicy.verdictOverride ?? 'SKIPPED');
    return;
  }

  // Check diff line count
  if (inputs.maxDiffLines > 0) {
    const diffContent = await fs.readFile(safeDiffPath, 'utf-8');
    const lineCount = diffContent.split('\n').length;
    if (lineCount > inputs.maxDiffLines) {
      console.log(formatActionWarning(
        'diff-too-large',
        `Reduce the PR size or raise max-diff-lines if your reviewer/model can handle it.`,
        `Diff lines=${lineCount}, limit=${inputs.maxDiffLines}`,
      ));
      setActionDegraded('diff-too-large');
      setActionOutput('verdict', 'SKIPPED');
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
    console.log(formatActionWarning(
      'config-load-failed',
      `Fix the config path or file contents, then rerun the Action.`,
      `configPath=${configPath}; ${redactActionMessage(message)}`,
    ));
    setActionDegraded('config-load-failed');
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
      console.log(formatActionWarning(
        'stale-head-sha',
        'Rerun the workflow on the current PR HEAD SHA so comments and status target the latest commit.',
        `expected=${inputs.sha}; current=${currentPr.headSha}`,
      ));
      setActionDegraded('stale-head-sha');
      setActionOutput('verdict', 'SKIPPED');
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
      console.log(formatActionWarning(
        'github-post-failed',
        'Verify the token permissions and rerun; review computation completed but GitHub posting failed.',
        redactActionMessage(message),
      ));
      setActionDegraded('github-post-failed');
    }
    console.log('::endgroup::');
  } else {
    console.log(formatActionWarning(
      actionPolicy.degradedReason ?? 'posting-disabled',
      getActionNextStep(actionPolicy.degradedReason ?? 'posting-disabled'),
      getActionContext(actionPolicy.degradedReason ?? 'posting-disabled', inputs),
    ));
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
    console.error(formatActionWarning(
      'sarif-write-failed',
      'Fix the SARIF path or permissions, then rerun if code scanning export is required.',
      redactActionMessage(message),
    ));
    setActionDegraded('sarif-write-failed');
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

function getActionContext(reason: string, inputs: { repo: string; pr: number; postResults: boolean }): string {
  switch (reason) {
    case 'missing-github-token':
      return 'GITHUB_TOKEN was not provided to the Action.';
    case 'missing-provider-secrets':
      return 'No provider secret was available for the configured reviewers/supporters.';
    case 'fork-missing-provider-secrets':
      return `Fork PR ${inputs.repo}#${inputs.pr} cannot read repository secrets.`;
    case 'posting-disabled':
      return 'post-results=false disabled GitHub posting by configuration.';
    default:
      return `repo=${inputs.repo}; pr=${inputs.pr}`;
  }
}

function getActionNextStep(reason: string): string {
  switch (reason) {
    case 'missing-github-token':
      return 'Pass github-token (usually ${{ secrets.GITHUB_TOKEN }}) or disable posting explicitly.';
    case 'missing-provider-secrets':
      return 'Add the required provider secret(s) or switch the config to GitHub Models.';
    case 'fork-missing-provider-secrets':
      return 'Run on a same-repository PR, use GitHub Models, or gate fork PRs before CodeAgora.';
    case 'posting-disabled':
      return 'Set post-results=true if you want PR comments and status checks.';
    case 'diff-too-large':
      return 'Lower the diff size, raise max-diff-lines, or split the PR.';
    case 'config-load-failed':
      return 'Fix .ca/config.json or the configured config-path and rerun.';
    case 'stale-head-sha':
      return 'Rerun the workflow on the updated commit SHA.';
    case 'github-post-failed':
      return 'Check token scopes, branch protections, and permission warnings in the logs.';
    case 'sarif-write-failed':
      return 'Use a writable SARIF path or disable/export elsewhere in the workflow.';
    default:
      return 'Review the warning context and rerun after fixing the reported issue.';
  }
}

function redactActionMessage(message: string): string {
  return message.replace(/gh[pousr]_[A-Za-z0-9_]+/g, '[redacted-token]');
}

main().catch((err) => {
  console.error(`::error::${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
