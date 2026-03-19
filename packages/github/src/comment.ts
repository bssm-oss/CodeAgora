/**
 * GitHub PR Comment Utilities
 * Functions for posting, finding, and updating PR comments via the GitHub API.
 */

import { Octokit } from '@octokit/rest';
import type { GitHubConfig } from './client.js';
import { createOctokit } from './client.js';

/**
 * Post a new comment on a pull request.
 * Returns the created comment's id and html_url.
 * Accepts an optional Octokit instance for connection reuse.
 */
export async function postPrComment(
  config: GitHubConfig,
  prNumber: number,
  body: string,
  octokit?: Octokit
): Promise<{ id: number; url: string }> {
  const kit = octokit ?? createOctokit(config);

  const { data } = await kit.issues.createComment({
    owner: config.owner,
    repo: config.repo,
    issue_number: prNumber,
    body,
  });

  return { id: data.id, url: data.html_url };
}

/**
 * Find an existing comment on a pull request whose body contains the given marker string.
 * Returns the comment id if found, or null if no matching comment exists.
 * Accepts an optional Octokit instance for connection reuse.
 */
export async function findExistingComment(
  config: GitHubConfig,
  prNumber: number,
  marker: string,
  octokit?: Octokit
): Promise<{ id: number } | null> {
  const kit = octokit ?? createOctokit(config);

  // Paginate through all comments to find a match
  const comments = await kit.paginate(kit.issues.listComments, {
    owner: config.owner,
    repo: config.repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const found = comments.find((c) => c.body?.includes(marker));
  return found ? { id: found.id } : null;
}

/**
 * Update an existing PR comment by id.
 * Accepts an optional Octokit instance for connection reuse.
 */
export async function updatePrComment(
  config: GitHubConfig,
  commentId: number,
  body: string,
  octokit?: Octokit
): Promise<void> {
  const kit = octokit ?? createOctokit(config);

  await kit.issues.updateComment({
    owner: config.owner,
    repo: config.repo,
    comment_id: commentId,
    body,
  });
}
