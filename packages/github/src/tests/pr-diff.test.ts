/**
 * PR Diff Fetcher Tests
 * Tests fetchPrDiff() with a mocked Octokit instance.
 */

import { describe, it, expect, vi } from 'vitest';
import { fetchPrDiff } from '../pr-diff.js';
import type { GitHubConfig } from '../client.js';

// ============================================================================
// Helpers
// ============================================================================

function makeConfig(): GitHubConfig {
  return { token: 'ghp_test', owner: 'test-owner', repo: 'test-repo' };
}

function makeOctokit(options: {
  prData?: Partial<{
    number: number;
    title: string;
    base: { ref: string; sha?: string; repo?: { full_name: string } };
    head: { ref: string; sha?: string; repo?: { full_name: string } };
  }>;
  diffData?: unknown;
  getError?: Error;
}) {
  const {
    prData = {},
    diffData = '--- a/foo.ts\n+++ b/foo.ts\n@@ -1,1 +1,1 @@\n+changed',
    getError,
  } = options;

  const pr = {
    number: prData.number ?? 42,
    title: prData.title ?? 'Test PR',
    base: prData.base ?? { ref: 'main', sha: 'base123', repo: { full_name: 'test-owner/test-repo' } },
    head: prData.head ?? { ref: 'feature-branch', sha: 'head456', repo: { full_name: 'test-owner/test-repo' } },
  };

  let callCount = 0;
  const getMock = getError
    ? vi.fn().mockRejectedValue(getError)
    : vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: JSON metadata
          return Promise.resolve({ data: pr });
        }
        // Second call: raw diff
        return Promise.resolve({ data: diffData });
      });

  return { pulls: { get: getMock } };
}

// ============================================================================
// fetchPrDiff
// ============================================================================

describe('fetchPrDiff', () => {
  it('returns PR number, title, baseBranch, headBranch, and diff', async () => {
    const octokit = makeOctokit({
      prData: {
        number: 7,
        title: 'My Feature',
        base: { ref: 'main', sha: 'base1', repo: { full_name: 'test-owner/test-repo' } },
        head: { ref: 'feat/x', sha: 'head1', repo: { full_name: 'fork-owner/test-repo' } },
      },
      diffData: '--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n+new',
    });

    const result = await fetchPrDiff(makeConfig(), 7, octokit as never);

    expect(result.number).toBe(7);
    expect(result.title).toBe('My Feature');
    expect(result.baseBranch).toBe('main');
    expect(result.headBranch).toBe('feat/x');
    expect(result.baseSha).toBe('base1');
    expect(result.headSha).toBe('head1');
    expect(result.isFork).toBe(true);
    expect(result.diff).toContain('+new');
  });

  it('reports same-repository PRs as non-forks for rebase/force-push playbooks', async () => {
    const octokit = makeOctokit({
      prData: {
        base: { ref: 'main', sha: 'base2', repo: { full_name: 'test-owner/test-repo' } },
        head: { ref: 'feature', sha: 'head2', repo: { full_name: 'test-owner/test-repo' } },
      },
    });

    const result = await fetchPrDiff(makeConfig(), 42, octokit as never);
    expect(result.isFork).toBe(false);
    expect(result.headSha).toBe('head2');
  });

  it('calls kit.pulls.get twice — once for metadata, once for diff', async () => {
    const octokit = makeOctokit({});
    await fetchPrDiff(makeConfig(), 42, octokit as never);
    expect(octokit.pulls.get).toHaveBeenCalledTimes(2);
  });

  it('passes mediaType diff on the second call', async () => {
    const octokit = makeOctokit({});
    await fetchPrDiff(makeConfig(), 42, octokit as never);
    const secondCall = octokit.pulls.get.mock.calls[1][0] as Record<string, unknown>;
    expect((secondCall.mediaType as Record<string, string>).format).toBe('diff');
  });

  it('returns empty string diff when diff response data is not a string', async () => {
    const octokit = makeOctokit({ diffData: { unexpected: 'object' } });
    const result = await fetchPrDiff(makeConfig(), 42, octokit as never);
    expect(result.diff).toBe('');
  });

  it('passes correct owner, repo, pull_number on both calls', async () => {
    const octokit = makeOctokit({});
    await fetchPrDiff(makeConfig(), 99, octokit as never);

    for (const call of octokit.pulls.get.mock.calls) {
      const params = call[0] as Record<string, unknown>;
      expect(params.owner).toBe('test-owner');
      expect(params.repo).toBe('test-repo');
      expect(params.pull_number).toBe(99);
    }
  });

  it('propagates errors thrown by the Octokit get call', async () => {
    const octokit = makeOctokit({ getError: new Error('Not Found') });
    await expect(fetchPrDiff(makeConfig(), 42, octokit as never)).rejects.toThrow('Not Found');
  });

  it('returns the raw diff string when diffData is a plain string', async () => {
    const rawDiff = '--- a/src/main.ts\n+++ b/src/main.ts\n@@ -1,1 +1,2 @@\n line\n+new line';
    const octokit = makeOctokit({ diffData: rawDiff });
    const result = await fetchPrDiff(makeConfig(), 1, octokit as never);
    expect(result.diff).toBe(rawDiff);
  });
});
