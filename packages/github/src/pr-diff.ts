/**
 * GitHub PR Diff Fetcher
 * Fetches PR metadata and unified diff from the GitHub API.
 */

import { Octokit } from '@octokit/rest';
import type { GitHubConfig, PullRequestInfo } from './client.js';
import { createOctokit } from './client.js';

function repoFullName(repo: unknown): string | undefined {
  if (!repo || typeof repo !== 'object') return undefined;
  const value = (repo as Record<string, unknown>)['full_name'];
  return typeof value === 'string' ? value : undefined;
}

export async function fetchPrMetadata(
  config: GitHubConfig,
  prNumber: number,
  octokit?: Octokit,
): Promise<Omit<PullRequestInfo, 'diff' | 'truncated'>> {
  const kit = octokit ?? createOctokit(config);
  const { data: pr } = await kit.pulls.get({
    owner: config.owner,
    repo: config.repo,
    pull_number: prNumber,
  });

  const baseRepoFullName = repoFullName(pr.base.repo);
  const headRepoFullName = repoFullName(pr.head.repo);

  return {
    number: pr.number,
    title: pr.title,
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    baseRepoFullName,
    headRepoFullName,
    isFork: baseRepoFullName !== undefined && headRepoFullName !== undefined
      ? baseRepoFullName !== headRepoFullName
      : undefined,
  };
}

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
  const metadata = await fetchPrMetadata(config, prNumber, kit);

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

  const MAX_DIFF_SIZE = 300_000; // ~300KB — GitHub truncates around this threshold (#288)
  const truncated = diffContent.length >= MAX_DIFF_SIZE;
  if (truncated) {
    console.warn('[GitHub] Diff may be truncated (>=300KB). Some files may be missing from review.');
  }

  return {
    ...metadata,
    diff: diffContent,
    truncated,
  };
}
