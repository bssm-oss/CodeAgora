/**
 * GitHub PR Diff Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { fetchPrDiff } from '@codeagora/github/pr-diff.js';
import type { GitHubConfig } from '@codeagora/github/client.js';

const config: GitHubConfig = { token: 'tok', owner: 'owner', repo: 'repo' };

function makeOctokit(prData: object, diffData: unknown) {
  return {
    pulls: {
      get: vi.fn()
        .mockResolvedValueOnce({ data: prData })
        .mockResolvedValueOnce({ data: diffData }),
    },
  } as unknown as import('@octokit/rest').Octokit;
}

describe('github/pr-diff.ts', () => {
  it('returns PR metadata with diff content', async () => {
    const prData = {
      number: 7,
      title: 'Fix auth bug',
      base: { ref: 'main' },
      head: { ref: 'fix/auth' },
    };
    const diffText = 'diff --git a/auth.ts b/auth.ts\n+fixed';
    const octokit = makeOctokit(prData, diffText);

    const result = await fetchPrDiff(config, 7, octokit);

    expect(result.number).toBe(7);
    expect(result.title).toBe('Fix auth bug');
    expect(result.baseBranch).toBe('main');
    expect(result.headBranch).toBe('fix/auth');
    expect(result.diff).toBe(diffText);
  });

  it('returns empty string when diff response is not a string', async () => {
    const prData = {
      number: 8,
      title: 'Update deps',
      base: { ref: 'main' },
      head: { ref: 'chore/deps' },
    };
    const octokit = makeOctokit(prData, { unexpected: 'object' });

    const result = await fetchPrDiff(config, 8, octokit);
    expect(result.diff).toBe('');
  });

  it('warns when diff exceeds 500KB', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prData = {
      number: 9,
      title: 'Huge PR',
      base: { ref: 'main' },
      head: { ref: 'feat/huge' },
    };
    // 500KB + 1 byte
    const bigDiff = 'x'.repeat(500001);
    const octokit = makeOctokit(prData, bigDiff);

    const result = await fetchPrDiff(config, 9, octokit);
    expect(result.diff.length).toBe(500001);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('truncated')
    );
    warnSpy.mockRestore();
  });
});
