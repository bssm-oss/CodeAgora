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
import type {
  GitHubCommitStatusPayload,
  GitHubCommitStatusState,
  GitHubCommitStatusVerdict,
  GitHubReview,
  PostResult,
} from './types.js';
import { findPriorReviews, dismissPriorReviews } from './dedup.js';
import { redactSecrets } from '@codeagora/shared/utils/redaction.js';

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
 * Check if a 422 error is specifically the "GitHub Actions is not permitted
 * to approve pull requests" limitation (GITHUB_TOKEN cannot submit APPROVE
 * reviews — this is a platform restriction, not a code problem).
 */
function isApprovalPermissionError(err: unknown): boolean {
  if (!is422Error(err)) return false;
  const message = err instanceof Error ? err.message : String(err);
  return /not permitted to approve/i.test(message);
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
 * Post review with side-effect-safe retry for 422 errors.
 *
 * GitHub does not provide a dry-run endpoint for review comment positions. A
 * "probe" createReview call that succeeds creates real PR review side effects.
 * Therefore, when GitHub returns a 422 for invalid inline positions, retry once
 * with no inline comments and surface the dropped count in the review body.
 */
async function postReviewWithRetry(
  kit: Octokit,
  config: GitHubConfig,
  prNumber: number,
  review: GitHubReview,
  inlineComments: Array<{ path: string; position: number; body: string }>,
): Promise<{ id: number; html_url: string }> {
  const safeReview = redactGitHubReview(review);
  const safeInlineComments = inlineComments.map((comment) => ({
    ...comment,
    body: redactSecrets(comment.body),
  }));
  // Effective review may be downgraded below (APPROVE → COMMENT) if the token
  // lacks approval permission. `effectiveEvent` is the event used for all
  // downstream posts once that downgrade decision is made.
  let effectiveEvent: GitHubReview['event'] = review.event;

  try {
    const response = await createReviewWithRateLimit(kit, {
      owner: config.owner,
      repo: config.repo,
      pull_number: prNumber,
      commit_id: safeReview.commit_id,
      event: effectiveEvent,
      body: safeReview.body,
      comments: safeInlineComments,
    });
    return response.data;
  } catch (err: unknown) {
    if (!is422Error(err)) throw err;

    // GITHUB_TOKEN from Actions cannot submit APPROVE reviews (platform
    // restriction). Downgrade to COMMENT so the summary + inline findings
    // still land on the PR. Verdict still conveyed via the body.
    if (isApprovalPermissionError(err) && effectiveEvent === 'APPROVE') {
      console.warn('[GitHub] GITHUB_TOKEN cannot approve PRs; downgrading APPROVE → COMMENT to preserve review body + inline comments.');
      effectiveEvent = 'COMMENT';
      try {
        const response = await createReviewWithRateLimit(kit, {
          owner: config.owner,
          repo: config.repo,
          pull_number: prNumber,
          commit_id: safeReview.commit_id,
          event: effectiveEvent,
          body: safeReview.body,
          comments: safeInlineComments,
        });
        return response.data;
      } catch (retryErr: unknown) {
        if (!is422Error(retryErr)) throw retryErr;
        // Still 422 → must be position errors; fall through to bisection.
      }
    }

    // 422: at least one comment has a bad position. Retrying subsets would create
    // duplicate real reviews/comments for successful probes, so fall back to a
    // summary-only review and make the dropped inline count explicit.
    const totalCount = safeInlineComments.length;
    if (totalCount === 0) {
      const response = await createReviewWithRateLimit(kit, {
        owner: config.owner,
        repo: config.repo,
        pull_number: prNumber,
        commit_id: safeReview.commit_id,
        event: effectiveEvent,
        body: safeReview.body,
        comments: [],
      });
      return response.data;
    }

    console.warn(`[GitHub] 422 error with ${totalCount} inline comment(s). Retrying once without inline comments to avoid duplicate probe side effects.`);
    const response = await createReviewWithRateLimit(kit, {
      owner: config.owner,
      repo: config.repo,
      pull_number: prNumber,
      commit_id: safeReview.commit_id,
      event: effectiveEvent,
      body: appendDroppedInlineCommentNotice(safeReview.body, totalCount),
      comments: [],
    });
    return response.data;
  }
}

function appendDroppedInlineCommentNotice(body: string, droppedCount: number): string {
  return `${body}\n\n---\n\n` +
    `CodeAgora could not place ${droppedCount} inline review comment${droppedCount === 1 ? '' : 's'} ` +
    'because GitHub rejected one or more diff positions. The summary above is still posted; rerun after rebasing if inline placement is required.';
}

function redactGitHubReview(review: GitHubReview): GitHubReview {
  return {
    ...review,
    body: redactSecrets(review.body),
    comments: review.comments.map((comment) => ({
      ...comment,
      body: redactSecrets(comment.body),
    })),
  };
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
  const safeReview = redactGitHubReview(review);

  // Step 1: Dismiss prior reviews
  const priorIds = await findPriorReviews(config, prNumber, kit);
  if (priorIds.length > 0) {
    await dismissPriorReviews(config, prNumber, priorIds, kit);
  }

  // Step 2: Sort by severity (highest first) and truncate to limit
  const sortedComments = [...safeReview.comments].sort(
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
  const data = await postReviewWithRetry(kit, config, prNumber, safeReview, inlineComments);

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

  return {
    reviewId: data.id,
    reviewUrl: data.html_url,
    verdict: safeReview.verdict,
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
 * Build the GitHub Commit Status API payload for a CodeAgora review result.
 *
 * GitHub commit statuses do not have a neutral state. Neutral/manual/degraded
 * outcomes are reported as pending so they stay visible without falsely passing
 * or failing the reviewed PR commit.
 */
export function buildCommitStatusPayload(options: {
  config: GitHubConfig,
  sha: string,
  verdict: GitHubCommitStatusVerdict,
  reviewUrl?: string,
  context?: string,
}): GitHubCommitStatusPayload {
  const stateMap: Record<GitHubCommitStatusVerdict, GitHubCommitStatusState> = {
    ACCEPT: 'success',
    REJECT: 'failure',
    NEEDS_HUMAN: 'pending',
    NEUTRAL: 'pending',
    DEGRADED: 'pending',
    SKIPPED: 'pending',
  };

  const descriptionMap: Record<GitHubCommitStatusVerdict, string> = {
    ACCEPT: 'All issues resolved \u2014 ready to merge',
    REJECT: 'Blocking issues found',
    NEEDS_HUMAN: 'Human review required for unresolved issues',
    NEUTRAL: 'No blocking verdict; human review may proceed',
    DEGRADED: 'CodeAgora review degraded; inspect workflow outputs',
    SKIPPED: 'CodeAgora review skipped; inspect workflow outputs',
  };

  return {
    owner: options.config.owner,
    repo: options.config.repo,
    sha: options.sha,
    state: stateMap[options.verdict] ?? 'pending',
    context: options.context ?? 'CodeAgora / review',
    description: descriptionMap[options.verdict] ?? 'Review complete',
    target_url: options.reviewUrl,
  };
}

/**
 * Set a commit status check reflecting the review verdict.
 */
export async function setCommitStatus(
  config: GitHubConfig,
  sha: string,
  verdict: GitHubCommitStatusVerdict,
  reviewUrl: string,
  octokit?: Octokit,
): Promise<void> {
  const kit = octokit ?? createOctokit(config);

  const payload = buildCommitStatusPayload({
    config,
    sha,
    verdict,
    reviewUrl,
  });

  await kit.repos.createCommitStatus({ ...payload });
}
