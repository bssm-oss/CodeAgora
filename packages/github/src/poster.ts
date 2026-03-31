/**
 * GitHub Review Poster
 * Orchestrates the full review posting flow:
 * 1. Dismiss prior reviews (dedup)
 * 2. Post inline review comments via pulls.createReview
 * 3. Set commit status
 */

import { Octokit } from '@octokit/rest';
import type { GitHubConfig } from './client.js';
import { createOctokit } from './client.js';
import type { GitHubReview, PostResult } from './types.js';
import { findPriorReviews, dismissPriorReviews } from './dedup.js';

/** Maximum inline comments per review (GitHub's practical limit). */
const MAX_COMMENTS_PER_REVIEW = 50;

/** Maximum retries for 429 rate-limit errors. */
const MAX_RATE_LIMIT_RETRIES = 3;

/** Default backoff delay in ms when Retry-After header is absent. */
const DEFAULT_BACKOFF_MS = 5_000;

/**
 * Severity priority for comment sorting (lower index = higher priority).
 * Ensures critical findings survive truncation to MAX_COMMENTS_PER_REVIEW.
 */
const SEVERITY_PRIORITY: Record<string, number> = {
  HARSHLY_CRITICAL: 0,
  CRITICAL: 1,
  WARNING: 2,
  SUGGESTION: 3,
};

/**
 * Extract severity from a comment body by matching the badge pattern.
 * Falls back to lowest priority if unrecognized.
 */
function extractSeverityPriority(body: string): number {
  if (body.includes('**HARSHLY CRITICAL**')) return SEVERITY_PRIORITY['HARSHLY_CRITICAL']!;
  if (body.includes('**CRITICAL**')) return SEVERITY_PRIORITY['CRITICAL']!;
  if (body.includes('**WARNING**')) return SEVERITY_PRIORITY['WARNING']!;
  if (body.includes('**SUGGESTION**')) return SEVERITY_PRIORITY['SUGGESTION']!;
  return 4; // unknown severity — lowest priority
}

/**
 * Check if an error is a 422 position/validation error.
 */
function is422Error(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number }).status;
  return status === 422 || message.includes('position') || message.includes('Unprocessable');
}

/**
 * Check if an error is a 429 rate-limit error.
 */
function is429Error(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  return status === 429;
}

/**
 * Extract the delay from a 429 response's Retry-After header (in ms).
 * Falls back to DEFAULT_BACKOFF_MS if header is missing.
 */
function getRetryAfterMs(err: unknown): number {
  const headers = (err as { response?: { headers?: Record<string, string> } }).response?.headers;
  const retryAfter = headers?.['retry-after'];
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds) && seconds > 0) return seconds * 1000;
  }
  return DEFAULT_BACKOFF_MS;
}

/**
 * Sleep for the specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempt to create a review via the GitHub API.
 * Handles 429 rate-limit errors with exponential backoff (up to MAX_RATE_LIMIT_RETRIES).
 */
async function createReviewWithRateLimit(
  kit: Octokit,
  params: Parameters<Octokit['pulls']['createReview']>[0],
): Promise<Awaited<ReturnType<Octokit['pulls']['createReview']>>> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    try {
      return await kit.pulls.createReview(params);
    } catch (err: unknown) {
      if (is429Error(err) && attempt < MAX_RATE_LIMIT_RETRIES) {
        const delayMs = getRetryAfterMs(err) * (attempt + 1); // linear backoff multiplier
        console.warn(`[GitHub] Rate limited (429). Retry ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES} after ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  // Unreachable, but TypeScript needs it
  throw new Error('[GitHub] Exhausted rate-limit retries');
}

/**
 * Post review with bisection retry for 422 errors.
 *
 * When GitHub returns 422 (invalid position), instead of dropping ALL inline
 * comments, we bisect: split the comments in half, retry each half independently.
 * This preserves the maximum number of valid comments.
 */
async function postReviewWithRetry(
  kit: Octokit,
  config: GitHubConfig,
  prNumber: number,
  review: GitHubReview,
  inlineComments: Array<{ path: string; position: number; body: string }>,
): Promise<{ id: number; html_url: string }> {
  try {
    const response = await createReviewWithRateLimit(kit, {
      owner: config.owner,
      repo: config.repo,
      pull_number: prNumber,
      commit_id: review.commit_id,
      event: review.event,
      body: review.body,
      comments: inlineComments,
    });
    return response.data;
  } catch (err: unknown) {
    if (!is422Error(err)) throw err;

    // 422: at least one comment has a bad position — bisect to find valid ones
    const totalCount = inlineComments.length;
    if (totalCount === 0) {
      // No comments to bisect — post without inline comments
      const response = await createReviewWithRateLimit(kit, {
        owner: config.owner,
        repo: config.repo,
        pull_number: prNumber,
        commit_id: review.commit_id,
        event: review.event,
        body: review.body,
        comments: [],
      });
      return response.data;
    }

    console.warn(`[GitHub] 422 error with ${totalCount} inline comment(s). Attempting bisection retry to preserve valid comments.`);

    // Bisect: try each half independently, collect survivors
    const survivors = await bisectComments(kit, config, prNumber, review, inlineComments);
    const droppedCount = totalCount - survivors.length;

    if (droppedCount > 0) {
      console.warn(`[GitHub] Bisection complete: ${survivors.length}/${totalCount} comments preserved, ${droppedCount} dropped due to invalid positions.`);
    }

    // Post final review with surviving comments
    const response = await createReviewWithRateLimit(kit, {
      owner: config.owner,
      repo: config.repo,
      pull_number: prNumber,
      commit_id: review.commit_id,
      event: review.event,
      body: review.body,
      comments: survivors,
    });
    return response.data;
  }
}

/**
 * Recursively bisect comments to find valid ones when GitHub returns 422.
 * Returns the subset of comments that can be posted successfully.
 */
async function bisectComments(
  kit: Octokit,
  config: GitHubConfig,
  prNumber: number,
  review: GitHubReview,
  batch: Array<{ path: string; position: number; body: string }>,
): Promise<Array<{ path: string; position: number; body: string }>> {
  if (batch.length === 0) return [];

  // Base case: single comment — test it individually
  if (batch.length === 1) {
    try {
      await createReviewWithRateLimit(kit, {
        owner: config.owner,
        repo: config.repo,
        pull_number: prNumber,
        commit_id: review.commit_id,
        event: 'COMMENT', // Use COMMENT for probe to avoid side effects
        body: '',
        comments: batch,
      });
      return batch;
    } catch {
      return []; // This single comment is invalid
    }
  }

  // Try the whole batch first
  try {
    await createReviewWithRateLimit(kit, {
      owner: config.owner,
      repo: config.repo,
      pull_number: prNumber,
      commit_id: review.commit_id,
      event: 'COMMENT',
      body: '',
      comments: batch,
    });
    return batch; // Entire batch is valid
  } catch (err: unknown) {
    if (!is422Error(err)) throw err; // Non-422 errors propagate

    // Split and recurse
    const mid = Math.floor(batch.length / 2);
    const [left, right] = await Promise.all([
      bisectComments(kit, config, prNumber, review, batch.slice(0, mid)),
      bisectComments(kit, config, prNumber, review, batch.slice(mid)),
    ]);
    return [...left, ...right];
  }
}

/**
 * Post a complete code review to a GitHub PR.
 *
 * Flow:
 * 1. Dismiss any prior CodeAgora reviews (dedup)
 * 2. Post the new review with inline comments
 * 3. Return the review URL and verdict
 */
export async function postReview(
  config: GitHubConfig,
  prNumber: number,
  review: GitHubReview,
  octokit?: Octokit,
): Promise<PostResult> {
  const kit = octokit ?? createOctokit(config);

  // Step 1: Dismiss prior reviews
  const priorIds = await findPriorReviews(config, prNumber, kit);
  if (priorIds.length > 0) {
    await dismissPriorReviews(config, prNumber, priorIds, kit);
  }

  // Step 2: Sort by severity (highest first) and truncate to limit
  const sortedComments = [...review.comments].sort(
    (a, b) => extractSeverityPriority(a.body) - extractSeverityPriority(b.body),
  );
  if (sortedComments.length > MAX_COMMENTS_PER_REVIEW) {
    console.warn(`[GitHub] Truncating ${sortedComments.length} comments to ${MAX_COMMENTS_PER_REVIEW} (MAX_INLINE_COMMENTS limit). Comments sorted by severity — highest priority retained.`);
  }
  const comments = sortedComments.slice(0, MAX_COMMENTS_PER_REVIEW);

  // Filter out file-level comments (no position) into separate array
  const inlineComments = comments
    .filter((c) => c.position !== undefined)
    .map((c) => ({
      path: c.path,
      position: c.position!,
      body: c.body,
    }));

  // Step 3: Post the review with retry logic for 422 (bisection) and 429 (rate limit)
  const data = await postReviewWithRetry(kit, config, prNumber, review, inlineComments);

  // Step 4: Post file-level comments as individual issue comments
  const fileLevelComments = comments.filter((c) => c.position === undefined);
  for (const comment of fileLevelComments) {
    await kit.issues.createComment({
      owner: config.owner,
      repo: config.repo,
      issue_number: prNumber,
      body: comment.body,
    }).catch((err) => {
      console.warn(`[GitHub] Failed to post file-level comment: ${err instanceof Error ? err.message : err}`);
    });
  }

  // Determine verdict from event and body content
  let verdict: PostResult['verdict'];
  if (review.event === 'REQUEST_CHANGES') {
    verdict = 'REJECT';
  } else if (review.body.includes('NEEDS HUMAN REVIEW')) {
    verdict = 'NEEDS_HUMAN';
  } else {
    verdict = 'ACCEPT';
  }

  return {
    reviewId: data.id,
    reviewUrl: data.html_url,
    verdict,
  };
}

/**
 * Handle NEEDS_HUMAN verdict: request human reviewers and add label.
 * Failures are non-fatal — the bot may lack permission.
 */
export async function handleNeedsHuman(
  config: GitHubConfig,
  prNumber: number,
  options: {
    humanReviewers?: string[];
    humanTeams?: string[];
    needsHumanLabel?: string;
  },
  octokit?: Octokit,
): Promise<void> {
  const kit = octokit ?? createOctokit(config);

  // Request human reviewers
  const reviewers = options.humanReviewers ?? [];
  const teams = options.humanTeams ?? [];
  if (reviewers.length > 0 || teams.length > 0) {
    await kit.pulls.requestReviewers({
      owner: config.owner,
      repo: config.repo,
      pull_number: prNumber,
      reviewers,
      team_reviewers: teams,
    }).catch(() => { /* non-fatal: reviewers may not be collaborators */ });
  }

  // Add label
  const label = options.needsHumanLabel ?? 'needs-human-review';
  await kit.issues.addLabels({
    owner: config.owner,
    repo: config.repo,
    issue_number: prNumber,
    labels: [label],
  }).catch(() => { /* non-fatal */ });
}

/**
 * Set a commit status check reflecting the review verdict.
 */
export async function setCommitStatus(
  config: GitHubConfig,
  sha: string,
  verdict: PostResult['verdict'],
  reviewUrl: string,
  octokit?: Octokit,
): Promise<void> {
  const kit = octokit ?? createOctokit(config);

  const stateMap: Record<string, 'success' | 'failure' | 'pending'> = {
    ACCEPT: 'success',
    REJECT: 'failure',
    NEEDS_HUMAN: 'pending',
  };

  const descriptionMap: Record<string, string> = {
    ACCEPT: 'All issues resolved \u2014 ready to merge',
    REJECT: 'Blocking issues found',
    NEEDS_HUMAN: 'Human review required for unresolved issues',
  };

  await kit.repos.createCommitStatus({
    owner: config.owner,
    repo: config.repo,
    sha,
    state: stateMap[verdict] ?? 'pending',
    context: 'CodeAgora / review',
    description: descriptionMap[verdict] ?? 'Review complete',
    target_url: reviewUrl,
  });
}
