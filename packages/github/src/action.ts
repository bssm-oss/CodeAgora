#!/usr/bin/env node
/**
 * CodeAgora GitHub Action Entrypoint
 *
 * Standalone CLI for GitHub Actions runner.
 * Reads action inputs from environment, runs the review pipeline,
 * posts results to the PR, and emits the configured GitHub reporter.
 */

import fs from 'fs/promises';
import { runPipeline } from '@codeagora/core/pipeline/orchestrator.js';
import { buildDiffPositionIndex } from './diff-parser.js';
import { mapToGitHubReview } from './mapper.js';
import { postReview, setCommitStatus, handleNeedsHuman } from './poster.js';
import { createAppOctokit } from './client.js';
import { fetchPrMetadata } from './pr-diff.js';
import { buildSarifReport, serializeSarif } from './sarif.js';
import { resolveReviewedPrCommitSha } from './action-event.js';
import { loadConfigFile } from '@codeagora/core/config/loader.js';
import {
  determineActionPolicy,
  evaluatePrivilegedGitHubOperation,
  isStaleHead,
  parseActionInputs,
  validateActionDiffPath,
  validateActionOutputPath,
  type PrivilegedGitHubOperation,
} from './action-policy.js';
import {
  logActionDiagnostic,
  reportActionCheckRun,
  setActionDegraded,
  setActionOutput,
  writeActionSummary,
  writeDocumentedActionOutputs,
} from './action-reporting.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';

const DEFAULT_SARIF_OUTPUT_PATH = '/tmp/codeagora-results.sarif';

async function writeSarifOutput(
  evidenceDocs: EvidenceDocument[],
  sessionId: string,
  sessionDate: string,
  rawSarifPath?: string,
): Promise<string> {
  try {
    const safeSarifPath = await validateActionOutputPath(rawSarifPath ?? DEFAULT_SARIF_OUTPUT_PATH, process.cwd());
    const sarifReport = buildSarifReport(evidenceDocs, sessionId, sessionDate);
    await fs.writeFile(safeSarifPath, serializeSarif(sarifReport));
    console.log(`SARIF report written to ${safeSarifPath}`);
    return safeSarifPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logActionDiagnostic('SARIF output skipped', 'sarif-write-failed', message);
    setActionDegraded('sarif-write-failed');
    writeActionSummary('degraded', 'sarif-write-failed', message);
    return '';
  }
}

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

  const reviewedHeadSha = resolveReviewedPrCommitSha();
  const ghConfig = { token: inputs.token, owner, repo };
  const privilegedGitHubContext = {
    token: inputs.token,
    baseRepo: inputs.baseRepo,
    headRepo: inputs.headRepo,
    repository: inputs.repo,
    eventName: process.env['GITHUB_EVENT_NAME'],
    ref: process.env['GITHUB_REF'],
  };
  let githubWritesAllowed = inputs.postResults && Boolean(inputs.token);
  let suppressedWriteReason: Parameters<typeof setActionDegraded>[0] | undefined;

  const markActionDegraded = (reason: Parameters<typeof setActionDegraded>[0]): void => {
    githubWritesAllowed = false;
    suppressedWriteReason = reason;
    setActionDegraded(reason);
  };

  const ensurePrivilegedGitHubOperation = (operation: PrivilegedGitHubOperation): boolean => {
    const decision = evaluatePrivilegedGitHubOperation(operation, privilegedGitHubContext);
    if (decision.allowed) return true;

    const reason = decision.degradedReason ?? 'untrusted-github-context';
    logActionDiagnostic('GitHub write blocked', reason, decision.message);
    markActionDegraded(reason);
    writeActionSummary('degraded', reason, decision.message);
    return false;
  };

  const writeGitHubReport = async (
    verdict: 'ACCEPT' | 'REJECT' | 'NEEDS_HUMAN' | 'NEUTRAL' | 'DEGRADED' | 'SKIPPED',
    summary: string,
    reviewUrl?: string,
    octokit?: unknown,
    executionOutcome?: 'completed' | 'skipped' | 'blocked',
    degradedReason?: Parameters<typeof setActionDegraded>[0],
  ): Promise<void> => {
    if (!githubWritesAllowed) return;
    if (!ensurePrivilegedGitHubOperation(inputs.reporterMode === 'commit-status' ? 'commit-status' : 'check-run')) {
      return;
    }

    try {
      if (inputs.reporterMode === 'commit-status') {
        const statusOctokit = octokit as Parameters<typeof setCommitStatus>[4];
        const statusVerdict = executionOutcome === 'blocked' ? 'DEGRADED' : executionOutcome === 'skipped' ? 'SKIPPED' : verdict;
        await setCommitStatus(ghConfig, reviewedHeadSha, statusVerdict, reviewUrl ?? '', statusOctokit);
        console.log(`Commit status reported: ${statusVerdict}`);
        return;
      }

      const result = await reportActionCheckRun({
        config: ghConfig,
        sha: reviewedHeadSha,
        verdict,
        executionOutcome,
        degradedReason,
        checkRunName: inputs.checkRunName,
        reviewUrl,
        summary,
        octokit,
      });
      console.log(`Check run ${result.operation}: ${result.htmlUrl ?? inputs.checkRunName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const label = inputs.reporterMode === 'commit-status' ? 'Commit-status reporting degraded' : 'Check-run reporting degraded';
      logActionDiagnostic(label, 'github-post-failed', message);
      markActionDegraded('github-post-failed');
      writeActionSummary('degraded', 'github-post-failed', message);
    }
  };

  writeDocumentedActionOutputs({
    headSha: reviewedHeadSha,
    baseSha: inputs.baseSha,
  });

  const safeDiffPath = await validateActionDiffPath(inputs.diff);

  const actionPolicy = determineActionPolicy(inputs);
  githubWritesAllowed = actionPolicy.shouldPostResults && !actionPolicy.degraded && Boolean(inputs.token);
  if (actionPolicy.degraded) {
    if (actionPolicy.degradedReason) {
      markActionDegraded(actionPolicy.degradedReason);
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
    if (actionPolicy.shouldPostResults) {
      await writeGitHubReport(
        'SKIPPED',
        `CodeAgora review skipped: ${actionPolicy.degradedReason ?? 'policy-disabled'}.`,
        undefined,
        undefined,
        'skipped',
        actionPolicy.degradedReason,
      );
    }
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
      markActionDegraded('diff-too-large');
      setActionOutput('verdict', 'SKIPPED');
      writeActionSummary('skipped', 'diff-too-large', `Diff has ${lineCount} lines (limit: ${inputs.maxDiffLines}).`);
      await writeGitHubReport(
        'SKIPPED',
        `CodeAgora review skipped because the diff has ${lineCount} lines (limit: ${inputs.maxDiffLines}).`,
        undefined,
        undefined,
        'skipped',
        'diff-too-large',
      );
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
    markActionDegraded('config-load-failed');
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
    if (githubWritesAllowed) {
      console.log('::group::Reporting ACCEPT check run');
      const appKit = await createAppOctokit(owner, repo);
      if (appKit) console.log('Using GitHub App authentication (CodeAgora Bot)');

      const currentPr = await fetchPrMetadata(ghConfig, inputs.pr, appKit ?? undefined);
      if (isStaleHead(reviewedHeadSha, currentPr.headSha)) {
        logActionDiagnostic(
          'Stale head SHA',
          'stale-head-sha',
          `PR head changed from ${reviewedHeadSha} to ${currentPr.headSha}; skipping stale reporting.`,
        );
        markActionDegraded('stale-head-sha');
        setActionOutput('verdict', 'SKIPPED');
        writeActionSummary(
          'skipped',
          'stale-head-sha',
          `PR head changed from ${reviewedHeadSha} to ${currentPr.headSha}; skipping stale reporting.`,
        );
        console.log('::endgroup::');
        return;
      }

      await writeGitHubReport('ACCEPT', 'CodeAgora completed successfully with no issues found.', undefined, appKit ?? undefined);
      console.log('::endgroup::');
    }

    const sarifFile = await writeSarifOutput(
      result.evidenceDocs ?? [],
      result.sessionId,
      result.date,
      config?.github?.sarifOutputPath,
    );

    writeDocumentedActionOutputs({
      verdict: 'ACCEPT',
      reviewUrl: '',
      sessionId: result.sessionId,
      sarifFile,
    });
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
  const ghIntegration = config?.github;
  const review = mapToGitHubReview({
    summary: result.summary,
    evidenceDocs,
    discussions,
    positionIndex,
    headSha: reviewedHeadSha,
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

  let reviewUrl = '';
  let postedVerdict = result.summary.decision;

  if (githubWritesAllowed) {
    console.log('::group::Posting review to GitHub');
    if (!ensurePrivilegedGitHubOperation('review-comment')) {
      console.log('::endgroup::');
    } else {
      const appKit = await createAppOctokit(owner, repo);
      if (appKit) console.log('Using GitHub App authentication (CodeAgora Bot)');

      const currentPr = await fetchPrMetadata(ghConfig, inputs.pr, appKit ?? undefined);
      if (isStaleHead(reviewedHeadSha, currentPr.headSha)) {
        logActionDiagnostic(
          'Stale head SHA',
          'stale-head-sha',
          `PR head changed from ${reviewedHeadSha} to ${currentPr.headSha}; skipping stale posting.`,
        );
        markActionDegraded('stale-head-sha');
        setActionOutput('verdict', 'SKIPPED');
        writeActionSummary(
          'skipped',
          'stale-head-sha',
          `PR head changed from ${reviewedHeadSha} to ${currentPr.headSha}; skipping stale posting.`,
        );
        console.log('::endgroup::');
        return;
      }

      try {
        const postResult = await postReview(ghConfig, inputs.pr, review, appKit ?? undefined);
        await writeGitHubReport(
          postResult.verdict,
          `CodeAgora completed with verdict ${postResult.verdict}.`,
          postResult.reviewUrl,
          appKit ?? undefined,
        );
        reviewUrl = postResult.reviewUrl;
        postedVerdict = postResult.verdict;

        // Handle NEEDS_HUMAN: request reviewers and add label
        if (postResult.verdict === 'NEEDS_HUMAN') {
          if (
            ensurePrivilegedGitHubOperation('reviewer-mutation') &&
            ensurePrivilegedGitHubOperation('label-mutation')
          ) {
            await handleNeedsHuman(ghConfig, inputs.pr, {
              humanReviewers: ghIntegration?.humanReviewers,
              humanTeams: ghIntegration?.humanTeams,
              needsHumanLabel: ghIntegration?.needsHumanLabel,
            }, appKit ?? undefined);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logActionDiagnostic('GitHub posting degraded', 'github-post-failed', message);
        markActionDegraded('github-post-failed');
        writeActionSummary('degraded', 'github-post-failed', message);
      }
      console.log('::endgroup::');
    }
  } else {
    const reason = suppressedWriteReason ?? actionPolicy.degradedReason ?? 'posting-disabled';
    logActionDiagnostic(
      'GitHub posting skipped',
      reason,
      undefined,
    );
    writeActionSummary('degraded', reason);
  }

  // Generate SARIF output — validate path to prevent traversal attacks.
  const sarifFile = await writeSarifOutput(
    evidenceDocs,
    result.sessionId,
    result.date,
    config?.github?.sarifOutputPath,
  );

  // Set outputs
  writeDocumentedActionOutputs({
    verdict: result.summary.decision,
    reviewUrl,
    sessionId: result.sessionId,
    sarifFile,
  });

  if (reviewUrl) console.log(`Review posted: ${reviewUrl}`);
  console.log(`Verdict: ${result.summary.decision}`);

  // Exit with failure if REJECT and failOnReject is enabled
  if (postedVerdict === 'REJECT' && inputs.failOnReject) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`::error::${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
