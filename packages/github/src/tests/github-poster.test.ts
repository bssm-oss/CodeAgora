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

  it('falls back to summary-only review on 422 position error without duplicate probe reviews', async () => {
    const positionError = Object.assign(new Error('Unprocessable Entity'), { status: 422 });
    const octokit = makeOctokit();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // First call with inline comments → 422.
    // Second call posts the summary only. There are no successful probe reviews,
    // because successful probes would create duplicate review side effects.
    octokit.pulls.createReview
      .mockRejectedValueOnce(positionError)  // initial attempt
      .mockResolvedValue({                   // final review with empty survivors
        data: {
          id: 777,
          html_url: 'https://github.com/test-owner/test-repo/pull/1#pullrequestreview-777',
        },
      });

    const review = makeReview({
      comments: [
        { path: 'src/foo.ts', position: 1, side: 'RIGHT', body: 'issue 1' },
        { path: 'src/bar.ts', position: 2, side: 'RIGHT', body: 'issue 2' },
      ],
    });

    const result = await postReview(makeConfig(), 1, review, octokit as never);
    expect(result.reviewId).toBe(777);
    expect(octokit.pulls.createReview).toHaveBeenCalledTimes(2);
    const lastCall = octokit.pulls.createReview.mock.calls[octokit.pulls.createReview.mock.calls.length - 1][0];
    expect(lastCall.comments).toEqual([]);
    expect(lastCall.body).toContain('could not place 2 inline review comments');
    expect(warnSpy.mock.calls.flat().join(' ')).toContain('GitHub rejected inline comment positions (422)');
    expect(warnSpy.mock.calls.flat().join(' ')).toContain('Rebase or refresh the diff');
    warnSpy.mockRestore();
  });

  it('throws for non-position API errors', async () => {
    const authError = Object.assign(new Error('Bad credentials'), { status: 401 });
    const octokit = makeOctokit({ createReviewError: authError });

    await expect(
      postReview(makeConfig(), 1, makeReview(), octokit as never),
    ).rejects.toThrow('Bad credentials');
  });

  // -------------------------------------------------------------------------
  // "GitHub Actions is not permitted to approve pull requests" — downgrade
  // APPROVE → COMMENT so the review body + inline comments still land.
  // -------------------------------------------------------------------------

  it('downgrades APPROVE → COMMENT when token lacks approval permission', async () => {
    const approvalError = Object.assign(
      new Error('Unprocessable Entity: "GitHub Actions is not permitted to approve pull requests."'),
      { status: 422 },
    );
    const octokit = makeOctokit();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // First call (event=APPROVE) → 422 permission error
    // Second call (event=COMMENT downgrade) → success
    octokit.pulls.createReview
      .mockRejectedValueOnce(approvalError)
      .mockResolvedValue({
        data: {
          id: 888,
          html_url: 'https://github.com/test-owner/test-repo/pull/1#pullrequestreview-888',
        },
      });

    const review = makeReview({ event: 'APPROVE', body: 'Looks good.' });
    const result = await postReview(makeConfig(), 1, review, octokit as never);

    expect(result.reviewId).toBe(888);
    // Verdict is still ACCEPT — the body marker determines verdict, not the event
    expect(result.verdict).toBe('ACCEPT');
    // Two calls total: first APPROVE (failed), second COMMENT (succeeded)
    expect(octokit.pulls.createReview).toHaveBeenCalledTimes(2);
    const firstCall = octokit.pulls.createReview.mock.calls[0][0];
    const secondCall = octokit.pulls.createReview.mock.calls[1][0];
    expect(firstCall.event).toBe('APPROVE');
    expect(secondCall.event).toBe('COMMENT');
    // Body + comments preserved
    expect(secondCall.body).toBe('Looks good.');
    expect(warnSpy.mock.calls.flat().join(' ')).toContain('Approval permission blocked by GitHub Actions token');
    warnSpy.mockRestore();
  });

  it('does NOT downgrade for unrelated 422 errors on APPROVE', async () => {
    // A 422 without the "not permitted to approve" message should NOT
    // trigger the APPROVE→COMMENT downgrade; it should retry summary-only.
    const positionError = Object.assign(
      new Error('Unprocessable Entity: invalid position'),
      { status: 422 },
    );
    const octokit = makeOctokit();

    // First call → 422 (position), final with empty comments → success.
    octokit.pulls.createReview
      .mockRejectedValueOnce(positionError)
      .mockResolvedValue({
        data: { id: 555, html_url: 'https://github.com/test-owner/test-repo/pull/1#pullrequestreview-555' },
      });

    const review = makeReview({
      event: 'APPROVE',
      body: 'Looks good.',
      comments: [{ path: 'src/foo.ts', position: 1, side: 'RIGHT', body: 'issue' }],
    });

    const result = await postReview(makeConfig(), 1, review, octokit as never);
    expect(result.reviewId).toBe(555);
    // Final post should retain APPROVE event (downgrade only kicks in for
    // the specific permission error, not arbitrary 422s).
    const finalCall = octokit.pulls.createReview.mock.calls[octokit.pulls.createReview.mock.calls.length - 1][0];
    expect(finalCall.event).toBe('APPROVE');
    expect(finalCall.comments).toEqual([]);
    expect(finalCall.body).toContain('could not place 1 inline review comment');
  });
});
