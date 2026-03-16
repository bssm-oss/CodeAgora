#!/usr/bin/env node
/**
 * CodeAgora GitHub Action Entrypoint
 *
 * Standalone CLI for GitHub Actions runner.
 * Reads action inputs from environment, runs the review pipeline,
 * posts results to the PR, and sets commit status.
 */

import fs from 'fs/promises';
import { appendFileSync } from 'fs';
import { runPipeline } from './pipeline/orchestrator.js';
import { buildDiffPositionIndex } from './github/diff-parser.js';
import { mapToGitHubReview } from './github/mapper.js';
import { postReview, setCommitStatus, handleNeedsHuman } from './github/poster.js';
import { loadConfig } from './config/loader.js';

// ============================================================================
// Input Parsing
// ============================================================================

interface ActionInputs {
  diff: string;
  pr: number;
  sha: string;
  repo: string; // "owner/repo"
  token: string;
  failOnReject: boolean;
  maxDiffLines: number;
}

function parseArgs(argv: string[]): ActionInputs {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--') && i + 1 < argv.length) {
      args[arg.slice(2)] = argv[i + 1];
      i++;
    }
  }

  const diff = args['diff'];
  const pr = parseInt(args['pr'] ?? '', 10);
  const sha = args['sha'] ?? '';
  const repo = args['repo'] ?? '';
  const token = process.env['GITHUB_TOKEN'] ?? '';
  const failOnReject = args['fail-on-reject'] !== 'false';
  const maxDiffLines = parseInt(args['max-diff-lines'] ?? '5000', 10);

  if (!diff) throw new Error('--diff is required');
  if (isNaN(pr)) throw new Error('--pr must be a valid number');
  if (!sha) throw new Error('--sha is required');
  if (!repo || !repo.includes('/')) throw new Error('--repo must be in owner/repo format');
  if (!token) throw new Error('GITHUB_TOKEN environment variable is required');

  return { diff, pr, sha, repo, token, failOnReject, maxDiffLines };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const inputs = parseArgs(process.argv);
  const [owner, repo] = inputs.repo.split('/');

  // Check diff line count
  if (inputs.maxDiffLines > 0) {
    const diffContent = await fs.readFile(inputs.diff, 'utf-8');
    const lineCount = diffContent.split('\n').length;
    if (lineCount > inputs.maxDiffLines) {
      console.log(`::warning::Diff has ${lineCount} lines (limit: ${inputs.maxDiffLines}). Skipping review.`);
      setActionOutput('verdict', 'SKIPPED');
      return;
    }
  }

  // Run pipeline
  console.log('::group::Running CodeAgora review pipeline');
  const result = await runPipeline({ diffPath: inputs.diff });
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
  const diffContent = await fs.readFile(inputs.diff, 'utf-8');
  const positionIndex = buildDiffPositionIndex(diffContent);

  // Use full evidence docs, discussions, and reviewer map from pipeline result
  const evidenceDocs = result.evidenceDocs ?? [];
  const discussions = result.discussions ?? [];
  const reviewerMap = result.reviewerMap ? new Map(Object.entries(result.reviewerMap)) : undefined;

  // Build and post review
  const ghConfig = { token: inputs.token, owner, repo };
  console.log('::group::Posting review to GitHub');

  const review = mapToGitHubReview({
    summary: result.summary,
    evidenceDocs,
    discussions,
    positionIndex,
    headSha: inputs.sha,
    sessionId: result.sessionId,
    sessionDate: result.date,
    reviewerMap,
  });

  const postResult = await postReview(ghConfig, inputs.pr, review);
  await setCommitStatus(ghConfig, inputs.sha, postResult.verdict, postResult.reviewUrl);

  // Handle NEEDS_HUMAN: request reviewers and add label
  if (postResult.verdict === 'NEEDS_HUMAN') {
    const config = await loadConfig().catch(() => null);
    const ghIntegration = config?.github;
    await handleNeedsHuman(ghConfig, inputs.pr, {
      humanReviewers: ghIntegration?.humanReviewers,
      humanTeams: ghIntegration?.humanTeams,
      needsHumanLabel: ghIntegration?.needsHumanLabel,
    });
  }

  console.log('::endgroup::');

  // Set outputs
  setActionOutput('verdict', result.summary.decision);
  setActionOutput('review-url', postResult.reviewUrl);
  setActionOutput('session-id', result.sessionId);

  console.log(`Review posted: ${postResult.reviewUrl}`);
  console.log(`Verdict: ${result.summary.decision}`);

  // Exit with failure if REJECT and failOnReject is enabled
  if (result.summary.decision === 'REJECT' && inputs.failOnReject) {
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
      const delimiter = `EOF_${Date.now()}`;
      appendFileSync(outputFile, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
    } else {
      appendFileSync(outputFile, `${name}=${value}\n`);
    }
  } else {
    // Fallback for older runners
    console.log(`::set-output name=${name}::${value}`);
  }
}

main().catch((err) => {
  console.error(`::error::${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
