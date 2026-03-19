/**
 * GitHub PR Diff Fetcher
 * Fetches PR metadata and unified diff from the GitHub API.
 */

import { Octokit } from '@octokit/rest';
import type { GitHubConfig, PullRequestInfo } from './client.js';
import { createOctokit } from './client.js';

/**
 * Fetch a pull request's metadata and unified diff.
 *
 * Uses the `diff` media type to retrieve the raw unified diff as a string.
 * Returns a PullRequestInfo containing title, branches, and diff text.
 * Accepts an optional Octokit instance for connection reuse.
 */
export async function fetchPrDiff(
  config: GitHubConfig,
  prNumber: number,
  octokit?: Octokit
): Promise<PullRequestInfo> {
  const kit = octokit ?? createOctokit(config);

  // Fetch PR metadata (JSON)
  const { data: pr } = await kit.pulls.get({
    owner: config.owner,
    repo: config.repo,
    pull_number: prNumber,
  });

  // Fetch raw diff using the diff media type
  const diffResponse = await kit.pulls.get({
    owner: config.owner,
    repo: config.repo,
    pull_number: prNumber,
    mediaType: { format: 'diff' },
  });

  // When format is 'diff', the response data is the raw diff string
  const diff = diffResponse.data as unknown as string;

  const diffContent = typeof diff === 'string' ? diff : '';

  const MAX_DIFF_SIZE = 500000; // 500KB
  if (diffContent.length >= MAX_DIFF_SIZE) {
    console.warn('[GitHub] Diff may be truncated (>500KB). Some files may be missing from review.');
  }

  return {
    number: pr.number,
    title: pr.title,
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    diff: diffContent,
  };
}
