/**
 * GitHub Dedup Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { findPriorReviews, dismissPriorReviews } from '@codeagora/github/dedup.js';
import type { GitHubConfig } from '@codeagora/github/client.js';

const config: GitHubConfig = { token: 'tok', owner: 'owner', repo: 'repo' };

const MARKER = '<!-- codeagora-v3 -->';

function makeOctokit(reviews: Array<{ id: number; body?: string }>) {
  return {
    pulls: {
      listReviews: vi.fn(),
      dismissReview: vi.fn().mockResolvedValue({}),
    },
    paginate: vi.fn().mockResolvedValue(reviews),
  } as unknown as import('@octokit/rest').Octokit;
}

describe('github/dedup.ts', () => {
  describe('findPriorReviews', () => {
    it('returns ids of reviews containing the codeagora-v3 marker', async () => {
      const reviews = [
        { id: 1, body: `${MARKER} some text` },
        { id: 2, body: 'unrelated review' },
        { id: 3, body: `preamble ${MARKER}` },
      ];
      const octokit = makeOctokit(reviews);
      const ids = await findPriorReviews(config, 42, octokit);
      expect(ids).toEqual([1, 3]);
    });

    it('returns empty array when no reviews match marker', async () => {
      const reviews = [
        { id: 10, body: 'no marker here' },
        { id: 11, body: '' },
        { id: 12, body: undefined },
      ];
      const octokit = makeOctokit(reviews);
      const ids = await findPriorReviews(config, 42, octokit);
      expect(ids).toEqual([]);
    });

    it('returns empty array when there are no reviews', async () => {
      const octokit = makeOctokit([]);
      const ids = await findPriorReviews(config, 42, octokit);
      expect(ids).toEqual([]);
    });
  });

  describe('dismissPriorReviews', () => {
    it('dismisses all given review ids and returns counts', async () => {
      const octokit = makeOctokit([]);
      const result = await dismissPriorReviews(config, 42, [1, 2, 3], octokit);
      expect(result.dismissed).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('counts failed dismissals without throwing', async () => {
      const octokit = makeOctokit([]);
      (octokit.pulls.dismissReview as unknown as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('403'))
        .mockResolvedValueOnce({});

      const result = await dismissPriorReviews(config, 42, [1, 2], octokit);
      expect(result.dismissed).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('returns zero counts for empty reviewIds list', async () => {
      const octokit = makeOctokit([]);
      const result = await dismissPriorReviews(config, 42, [], octokit);
      expect(result.dismissed).toBe(0);
      expect(result.failed).toBe(0);
    });
  });
});
