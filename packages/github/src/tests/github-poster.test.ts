/**
 * GitHub Review Poster Tests (#189c)
 * Tests postReview() with a mocked Octokit instance.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postReview } from '../poster.js';
import type { GitHubConfig } from '../client.js';
import type { GitHubReview } from '../types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeConfig(): GitHubConfig {
  return {
    token: 'ghp_test',
    owner: 'test-owner',
    repo: 'test-repo',
  };
}

function makeReview(overrides: Partial<GitHubReview> = {}): GitHubReview {
  return {
    commit_id: 'abc123',
    event: 'REQUEST_CHANGES',
    body: 'CodeAgora found issues.',
    comments: [],
    ...overrides,
  };
}

/** Build a minimal Octokit mock. */
function makeOctokit(options: {
  createReviewData?: object;
  createReviewError?: Error;
  priorReviewIds?: number[];
} = {}) {
  const { createReviewData, createReviewError, priorReviewIds = [] } = options;

  const priorReviews = priorReviewIds.map((id) => ({
    id,
    user: { login: 'github-actions[bot]' },
    body: '<!-- codeagora-v3 -->',
    state: 'CHANGES_REQUESTED',
  }));

  const mock = {
    // kit.paginate(kit.pulls.listReviews, ...) — returns array directly
    paginate: vi.fn().mockResolvedValue(priorReviews),
    pulls: {
      listReviews: vi.fn(),
      dismissReview: vi.fn().mockResolvedValue({}),
      createReview: createReviewError
        ? vi.fn().mockRejectedValue(createReviewError)
        : vi.fn().mockResolvedValue({
            data: {
              id: 999,
              html_url: 'https://github.com/test-owner/test-repo/pull/1#pullrequestreview-999',
              ...createReviewData,
            },
          }),
      requestReviewers: vi.fn().mockResolvedValue({}),
    },
    issues: {
      createComment: vi.fn().mockResolvedValue({}),
      addLabels: vi.fn().mockResolvedValue({}),
    },
    repos: {
      createCommitStatus: vi.fn().mockResolvedValue({}),
    },
  };
  return mock;
}

// ============================================================================
// Tests
// ============================================================================

describe('postReview()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createReview with the correct parameters', async () => {
    const octokit = makeOctokit();
    const config = makeConfig();
    const review = makeReview();

    await postReview(config, 42, review, octokit as never);

    expect(octokit.pulls.createReview).toHaveBeenCalledOnce();
    const call = octokit.pulls.createReview.mock.calls[0][0];
    expect(call.owner).toBe('test-owner');
    expect(call.repo).toBe('test-repo');
    expect(call.pull_number).toBe(42);
    expect(call.commit_id).toBe('abc123');
    expect(call.event).toBe('REQUEST_CHANGES');
  });

  it('returns reviewId, reviewUrl, and verdict REJECT for REQUEST_CHANGES', async () => {
    const octokit = makeOctokit();
    const result = await postReview(makeConfig(), 1, makeReview(), octokit as never);

    expect(result.reviewId).toBe(999);
    expect(result.reviewUrl).toContain('pullrequestreview-999');
    expect(result.verdict).toBe('REJECT');
  });

  it('returns verdict ACCEPT for APPROVE event', async () => {
    const octokit = makeOctokit();
    const review = makeReview({ event: 'APPROVE', body: 'Looks good.' });

    const result = await postReview(makeConfig(), 1, review, octokit as never);
    expect(result.verdict).toBe('ACCEPT');
  });

  it('returns verdict NEEDS_HUMAN when body contains "NEEDS HUMAN REVIEW"', async () => {
    const octokit = makeOctokit();
    const review = makeReview({ event: 'COMMENT', body: 'NEEDS HUMAN REVIEW — escalated.' });

    const result = await postReview(makeConfig(), 1, review, octokit as never);
    expect(result.verdict).toBe('NEEDS_HUMAN');
  });

  it('dismisses prior CodeAgora reviews before posting', async () => {
    const octokit = makeOctokit({ priorReviewIds: [101, 102] });

    await postReview(makeConfig(), 5, makeReview(), octokit as never);

    expect(octokit.pulls.dismissReview).toHaveBeenCalledTimes(2);
  });

  it('truncates inline comments to MAX_COMMENTS_PER_REVIEW (50)', async () => {
    const octokit = makeOctokit();
    const comments = Array.from({ length: 60 }, (_, i) => ({
      path: `file${i}.ts`,
      position: i + 1,
      side: 'RIGHT' as const,
      body: `Issue ${i}`,
    }));
    const review = makeReview({ comments });

    await postReview(makeConfig(), 1, review, octokit as never);

    const callArgs = octokit.pulls.createReview.mock.calls[0][0];
    expect(callArgs.comments.length).toBeLessThanOrEqual(50);
  });

  it('falls back via bisection on 422 position error, preserving valid comments', async () => {
    const positionError = Object.assign(new Error('Unprocessable Entity'), { status: 422 });
    const octokit = makeOctokit();

    // First call (all comments) → 422
    // Bisection probe (single comment) → 422 (comment is bad)
    // Final review (no surviving comments) → success
    octokit.pulls.createReview
      .mockRejectedValueOnce(positionError)  // initial attempt
      .mockRejectedValueOnce(positionError)  // bisection probe of single comment
      .mockResolvedValue({                   // final review with empty survivors
        data: {
          id: 777,
          html_url: 'https://github.com/test-owner/test-repo/pull/1#pullrequestreview-777',
        },
      });

    const review = makeReview({
      comments: [{ path: 'src/foo.ts', position: 1, side: 'RIGHT', body: 'issue' }],
    });

    const result = await postReview(makeConfig(), 1, review, octokit as never);
    expect(result.reviewId).toBe(777);
    // Final call should have empty comments (the single bad comment was dropped)
    const lastCall = octokit.pulls.createReview.mock.calls[octokit.pulls.createReview.mock.calls.length - 1][0];
    expect(lastCall.comments).toEqual([]);
  });

  it('throws for non-position API errors', async () => {
    const authError = Object.assign(new Error('Bad credentials'), { status: 401 });
    const octokit = makeOctokit({ createReviewError: authError });

    await expect(
      postReview(makeConfig(), 1, makeReview(), octokit as never),
    ).rejects.toThrow('Bad credentials');
  });
});
