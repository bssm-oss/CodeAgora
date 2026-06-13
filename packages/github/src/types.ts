/**
 * GitHub Integration Type Definitions
 * Types for PR review comments, SARIF output, and GitHub API shapes.
 */

export interface GitHubReviewComment {
  path: string;
  position?: number; // diff hunk position; omit for file-level comments
  side: 'RIGHT';
  body: string;
}

export interface GitHubReview {
  commit_id: string;
  event: 'REQUEST_CHANGES' | 'COMMENT' | 'APPROVE';
  body: string; // summary comment; contains <!-- codeagora-v3 -->
  comments: GitHubReviewComment[];
}

export interface DiffPositionIndex {
  /** key: "path:newLine" → value: hunk position */
  [key: string]: number;
}

export interface PostResult {
  reviewId: number;
  reviewUrl: string;
  verdict: 'ACCEPT' | 'REJECT' | 'NEEDS_HUMAN';
}

export type GitHubCommitStatusState = 'success' | 'failure' | 'pending';
export type GitHubCheckRunConclusion = 'success' | 'failure' | 'neutral';

export type GitHubCommitStatusVerdict =
  | PostResult['verdict']
  | 'NEUTRAL'
  | 'DEGRADED'
  | 'SKIPPED';

export interface GitHubCommitStatusPayload {
  owner: string;
  repo: string;
  sha: string;
  state: GitHubCommitStatusState;
  context: string;
  description: string;
  target_url?: string;
}
