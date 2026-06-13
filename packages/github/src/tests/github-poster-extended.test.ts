/**
 * GitHub Review Poster Extended Tests
 * Tests handleNeedsHuman() and setCommitStatus() from poster.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCommitStatusPayload, handleNeedsHuman, setCommitStatus } from '../poster.js';
import type { GitHubConfig } from '../client.js';
import type { GitHubCommitStatusVerdict, PostResult } from '../types.js';

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

function makeOctokit() {
  return {
    paginate: vi.fn().mockResolvedValue([]),
    pulls: {
      listReviews: vi.fn(),
      dismissReview: vi.fn().mockResolvedValue({}),
      createReview: vi.fn().mockResolvedValue({ data: { id: 1, html_url: 'https://github.com/pr/1' } }),
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
}

// ============================================================================
// handleNeedsHuman
// ============================================================================

describe('handleNeedsHuman()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls addLabels with the default "needs-human-review" label', async () => {
    const octokit = makeOctokit();
    await handleNeedsHuman(makeConfig(), 42, {}, octokit as never);

    expect(octokit.issues.addLabels).toHaveBeenCalledOnce();
    const call = octokit.issues.addLabels.mock.calls[0][0];
    expect(call.issue_number).toBe(42);
    expect(call.labels).toContain('needs-human-review');
  });

  it('uses the custom label from needsHumanLabel option', async () => {
    const octokit = makeOctokit();
    await handleNeedsHuman(
      makeConfig(),
      7,
      { needsHumanLabel: 'requires-security-review' },
      octokit as never,
    );

    const call = octokit.issues.addLabels.mock.calls[0][0];
    expect(call.labels).toContain('requires-security-review');
  });

  it('requests human reviewers when humanReviewers is provided', async () => {
    const octokit = makeOctokit();
    await handleNeedsHuman(
      makeConfig(),
      5,
      { humanReviewers: ['alice', 'bob'] },
      octokit as never,
    );

    expect(octokit.pulls.requestReviewers).toHaveBeenCalledOnce();
    const call = octokit.pulls.requestReviewers.mock.calls[0][0];
    expect(call.reviewers).toEqual(['alice', 'bob']);
  });

  it('requests team reviewers when humanTeams is provided', async () => {
    const octokit = makeOctokit();
    await handleNeedsHuman(
      makeConfig(),
      5,
      { humanTeams: ['security-team'] },
      octokit as never,
    );

    expect(octokit.pulls.requestReviewers).toHaveBeenCalledOnce();
    const call = octokit.pulls.requestReviewers.mock.calls[0][0];
    expect(call.team_reviewers).toEqual(['security-team']);
  });

  it('does NOT call requestReviewers when no reviewers or teams provided', async () => {
    const octokit = makeOctokit();
    await handleNeedsHuman(makeConfig(), 1, {}, octokit as never);

    expect(octokit.pulls.requestReviewers).not.toHaveBeenCalled();
  });

  it('does not throw when addLabels fails (non-fatal)', async () => {
    const octokit = makeOctokit();
    octokit.issues.addLabels.mockRejectedValue(new Error('Forbidden'));

    await expect(
      handleNeedsHuman(makeConfig(), 1, {}, octokit as never),
    ).resolves.toBeUndefined();
  });

  it('does not throw when requestReviewers fails (non-fatal)', async () => {
    const octokit = makeOctokit();
    octokit.pulls.requestReviewers.mockRejectedValue(new Error('Unprocessable'));

    await expect(
      handleNeedsHuman(
        makeConfig(),
        1,
        { humanReviewers: ['carol'] },
        octokit as never,
      ),
    ).resolves.toBeUndefined();
  });

  it('uses the correct owner/repo from config', async () => {
    const octokit = makeOctokit();
    const config: GitHubConfig = { token: 't', owner: 'my-org', repo: 'my-repo' };
    await handleNeedsHuman(config, 3, {}, octokit as never);

    const call = octokit.issues.addLabels.mock.calls[0][0];
    expect(call.owner).toBe('my-org');
    expect(call.repo).toBe('my-repo');
  });
});

// ============================================================================
// setCommitStatus
// ============================================================================

describe('setCommitStatus()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['ACCEPT', 'success', 'ready to merge'],
    ['REJECT', 'failure', 'Blocking issues'],
    ['NEEDS_HUMAN', 'pending', 'Human review required'],
    ['NEUTRAL', 'pending', 'No blocking verdict'],
    ['DEGRADED', 'pending', 'review degraded'],
    ['SKIPPED', 'pending', 'review skipped'],
  ] as const)('maps %s to commit status %s', (verdict, state, description) => {
    const payload = buildCommitStatusPayload({
      config: makeConfig(),
      sha: 'abc123',
      verdict,
      reviewUrl: 'https://github.com/pr/review',
    });

    expect(payload.state).toBe(state);
    expect(payload.description).toContain(description);
  });

  it('posts the mapped GitHub commit status to the reviewed PR commit SHA', async () => {
    const octokit = makeOctokit();
    await setCommitStatus(
      makeConfig(),
      'reviewed-head-sha',
      'DEGRADED' as GitHubCommitStatusVerdict,
      'https://github.com/pr/review',
      octokit as never,
    );

    expect(octokit.repos.createCommitStatus).toHaveBeenCalledOnce();
    const call = octokit.repos.createCommitStatus.mock.calls[0][0];
    expect(call.owner).toBe('test-owner');
    expect(call.repo).toBe('test-repo');
    expect(call.sha).toBe('reviewed-head-sha');
    expect(call.state).toBe('pending');
    expect(call.target_url).toBe('https://github.com/pr/review');
  });

  it('uses context "CodeAgora / review"', async () => {
    const octokit = makeOctokit();
    await setCommitStatus(
      makeConfig(),
      'sha1',
      'ACCEPT' as PostResult['verdict'],
      'https://github.com/pr/1',
      octokit as never,
    );

    const call = octokit.repos.createCommitStatus.mock.calls[0][0];
    expect(call.context).toBe('CodeAgora / review');
  });

  it('passes the sha to the API', async () => {
    const octokit = makeOctokit();
    await setCommitStatus(
      makeConfig(),
      'deadbeef',
      'ACCEPT' as PostResult['verdict'],
      'https://github.com/pr/1',
      octokit as never,
    );

    const call = octokit.repos.createCommitStatus.mock.calls[0][0];
    expect(call.sha).toBe('deadbeef');
  });

  it('passes the reviewUrl as target_url', async () => {
    const octokit = makeOctokit();
    const url = 'https://github.com/owner/repo/pull/42#pullrequestreview-999';
    await setCommitStatus(
      makeConfig(),
      'abc',
      'ACCEPT' as PostResult['verdict'],
      url,
      octokit as never,
    );

    const call = octokit.repos.createCommitStatus.mock.calls[0][0];
    expect(call.target_url).toBe(url);
  });

  it('sets description for ACCEPT — "ready to merge"', async () => {
    const octokit = makeOctokit();
    await setCommitStatus(
      makeConfig(),
      'sha',
      'ACCEPT' as PostResult['verdict'],
      'url',
      octokit as never,
    );

    const call = octokit.repos.createCommitStatus.mock.calls[0][0];
    expect(call.description).toContain('ready to merge');
  });

  it('sets description for REJECT — "Blocking issues found"', async () => {
    const octokit = makeOctokit();
    await setCommitStatus(
      makeConfig(),
      'sha',
      'REJECT' as PostResult['verdict'],
      'url',
      octokit as never,
    );

    const call = octokit.repos.createCommitStatus.mock.calls[0][0];
    expect(call.description).toContain('Blocking issues');
  });

  it('sets description for NEEDS_HUMAN — "Human review required"', async () => {
    const octokit = makeOctokit();
    await setCommitStatus(
      makeConfig(),
      'sha',
      'NEEDS_HUMAN' as PostResult['verdict'],
      'url',
      octokit as never,
    );

    const call = octokit.repos.createCommitStatus.mock.calls[0][0];
    expect(call.description).toContain('Human review required');
  });

  it('uses the correct owner/repo from config', async () => {
    const octokit = makeOctokit();
    const config: GitHubConfig = { token: 't', owner: 'my-org', repo: 'my-project' };
    await setCommitStatus(config, 'sha', 'ACCEPT' as PostResult['verdict'], 'url', octokit as never);

    const call = octokit.repos.createCommitStatus.mock.calls[0][0];
    expect(call.owner).toBe('my-org');
    expect(call.repo).toBe('my-project');
  });
});
