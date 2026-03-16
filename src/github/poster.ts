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

  // Step 2: Truncate comments if over the limit
  const comments = review.comments.slice(0, MAX_COMMENTS_PER_REVIEW);

  // Filter out file-level comments (no position) into separate array
  const inlineComments = comments
    .filter((c) => c.position !== undefined)
    .map((c) => ({
      path: c.path,
      position: c.position!,
      body: c.body,
    }));

  // Step 3: Post the review (retry without inline comments on position errors)
  let data;
  try {
    const response = await kit.pulls.createReview({
      owner: config.owner,
      repo: config.repo,
      pull_number: prNumber,
      commit_id: review.commit_id,
      event: review.event,
      body: review.body,
      comments: inlineComments,
    });
    data = response.data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('position') || message.includes('422') || message.includes('Unprocessable')) {
      // Fallback: post review without inline comments
      const response = await kit.pulls.createReview({
        owner: config.owner,
        repo: config.repo,
        pull_number: prNumber,
        commit_id: review.commit_id,
        event: review.event,
        body: review.body,
        comments: [],
      });
      data = response.data;
    } else {
      throw err;
    }
  }

  // Step 4: Post file-level comments as individual issue comments
  const fileLevelComments = comments.filter((c) => c.position === undefined);
  for (const comment of fileLevelComments) {
    await kit.issues.createComment({
      owner: config.owner,
      repo: config.repo,
      issue_number: prNumber,
      body: comment.body,
    }).catch(() => {
      // Non-fatal: file-level comments are supplementary
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
