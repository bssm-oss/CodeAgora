/**
 * MCP Post-Pipeline Actions
 * Formatting and GitHub posting helpers.
 */

import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';

// ============================================================================
// Output Formatting
// ============================================================================

export type OutputFormat = 'text' | 'json' | 'md' | 'github' | 'html' | 'junit' | 'sarif';

/**
 * Format a PipelineResult using the CLI formatter.
 * Lazy-imports the CLI formatter to avoid pulling in the full CLI package at startup.
 */
export async function formatReviewResult(
  result: PipelineResult,
  format: OutputFormat = 'text',
): Promise<string> {
  const { formatOutput } = await import('@codeagora/cli/formatters/review-output.js');
  return formatOutput(result, format);
}

// ============================================================================
// GitHub PR Posting
// ============================================================================

/**
 * Post review comments to a GitHub PR.
 * Parses owner/repo/number from the PR URL.
 */
export async function postToGitHub(
  result: PipelineResult,
  prUrl: string,
): Promise<{ reviewUrl?: string }> {
  if (result.status !== 'success' || !result.summary) {
    throw new Error('Cannot post review: pipeline did not succeed');
  }

  const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) {
    throw new Error(`Invalid GitHub PR URL: ${prUrl}`);
  }
  const [, owner, repo, numberStr] = match;
  const prNumber = parseInt(numberStr!, 10);

  const { execFile: execFileCb } = await import('child_process');
  const { promisify } = await import('util');
  const execFile = promisify(execFileCb);

  // Fetch PR diff and head SHA
  const { stdout: diff } = await execFile('gh', ['pr', 'view', prUrl, '--json', 'headRefOid', '-q', '.headRefOid']);
  const headSha = diff.trim();

  const token = process.env['GITHUB_TOKEN'] ?? '';
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required for posting reviews');
  }

  const ghConfig = {
    token,
    owner: owner!,
    repo: repo!,
  };

  const { mapToGitHubReview } = await import('@codeagora/github/mapper.js');
  const { buildDiffPositionIndex } = await import('@codeagora/github/diff-parser.js');
  const { postReview, setCommitStatus } = await import('@codeagora/github/poster.js');

  // Fetch the actual diff for position mapping
  const { stdout: prDiff } = await execFile('gh', ['pr', 'diff', prUrl]);
  const positionIndex = buildDiffPositionIndex(prDiff);

  const reviewerMap = result.reviewerMap
    ? new Map(Object.entries(result.reviewerMap))
    : undefined;
  const reviewerOpinions = result.reviewerOpinions
    ? new Map(Object.entries(result.reviewerOpinions))
    : undefined;
  const supporterModelMap = result.supporterModelMap
    ? new Map(Object.entries(result.supporterModelMap))
    : undefined;

  const review = mapToGitHubReview({
    summary: result.summary,
    evidenceDocs: result.evidenceDocs ?? [],
    discussions: result.discussions ?? [],
    positionIndex,
    headSha,
    sessionId: result.sessionId,
    sessionDate: result.date,
    reviewerMap,
    reviewerOpinions,
    devilsAdvocateId: result.devilsAdvocateId,
    supporterModelMap,
  });

  const postResult = await postReview(ghConfig, prNumber, review);
  await setCommitStatus(ghConfig, headSha, postResult.verdict, postResult.reviewUrl);

  return { reviewUrl: postResult.reviewUrl };
}
