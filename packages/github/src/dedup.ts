/**
 * GitHub Review Deduplication
 * Find and dismiss prior CodeAgora reviews to avoid duplicates on re-runs.
 */

import { Octokit } from '@octokit/rest';
import type { GitHubConfig } from './client.js';
import { createOctokit } from './client.js';

const MARKER = '<!-- codeagora-v3 -->';

/**
 * Find all prior CodeAgora reviews on a PR (identified by the HTML marker).
 * Returns the review IDs that should be dismissed.
 *
 * Filters by bot login (when provided) to avoid attempting to dismiss
 * reviews authored by other users (which would result in 403 errors).
 * Also skips already-dismissed reviews to avoid redundant API calls.
 */
export async function findPriorReviews(
  config: GitHubConfig,
  prNumber: number,
  octokit?: Octokit,
  botLogin?: string,
): Promise<number[]> {
  const kit = octokit ?? createOctokit(config);

  const reviews = await kit.paginate(kit.pulls.listReviews, {
    owner: config.owner,
    repo: config.repo,
    pull_number: prNumber,
    per_page: 100,
  });

  return reviews
    .filter((r) => {
      if (!r.body?.includes(MARKER)) return false;
      // Skip already-dismissed reviews — no point re-dismissing
      if (r.state === 'DISMISSED') return false;
      // If botLogin is provided, only match reviews authored by this bot
      if (botLogin && r.user?.login !== botLogin) return false;
      return true;
    })
    .map((r) => r.id);
}

/**
 * Dismiss prior CodeAgora reviews so they appear as "Outdated".
 * Failures are non-fatal — the bot may not have permission to dismiss
 * reviews it didn't author, or the review may already be dismissed.
 */
export async function dismissPriorReviews(
  config: GitHubConfig,
  prNumber: number,
  reviewIds: number[],
  octokit?: Octokit,
): Promise<{ dismissed: number; failed: number }> {
  const kit = octokit ?? createOctokit(config);
  let dismissed = 0;
  let failed = 0;

  for (const reviewId of reviewIds) {
    try {
      await kit.pulls.dismissReview({
        owner: config.owner,
        repo: config.repo,
        pull_number: prNumber,
        review_id: reviewId,
        message: 'Superseded by new CodeAgora run',
      });
      dismissed++;
    } catch {
      // Non-fatal: review may already be dismissed or bot lacks permission
      failed++;
    }
  }

  return { dismissed, failed };
}
