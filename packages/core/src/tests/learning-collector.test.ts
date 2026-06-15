/**
 * Tests for learning/collector.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock so every `new Octokit()` call returns the same instance
const mockGraphql = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    graphql: mockGraphql,
  })),
}));

// Import after mock is set up
const { collectDismissedPatterns } = await import('../learning/collector.js');

function thread({
  body,
  isResolved = true,
  isOutdated = false,
  commentsHasNextPage = false,
}: {
  body: string;
  isResolved?: boolean;
  isOutdated?: boolean;
  commentsHasNextPage?: boolean;
}) {
  return {
    isResolved,
    isOutdated,
    comments: {
      pageInfo: { hasNextPage: commentsHasNextPage },
      nodes: [{ databaseId: 1, body }],
    },
  };
}

function page(nodes: unknown[]) {
  return {
    repository: {
      pullRequest: {
        reviewThreads: {
          pageInfo: {
            hasNextPage: false,
            endCursor: null,
          },
          nodes,
        },
      },
    },
  };
}

describe('collectDismissedPatterns', () => {
  beforeEach(() => {
    mockGraphql.mockReset();
  });

  it('returns empty array when no comments exist', async () => {
    mockGraphql.mockResolvedValue(page([]));

    const result = await collectDismissedPatterns('owner', 'repo', 1, 'token');
    expect(result).toEqual([]);
  });

  it('ignores comments without codeagora marker', async () => {
    mockGraphql.mockResolvedValue(page([
      thread({ body: 'Regular comment without marker' }),
    ]));

    const result = await collectDismissedPatterns('owner', 'repo', 1, 'token');
    expect(result).toEqual([]);
  });

  it('ignores comments with marker but without severity/title match', async () => {
    mockGraphql.mockResolvedValue(page([
      thread({ body: '<!-- codeagora-v3 -->\nNo severity info here' }),
    ]));

    const result = await collectDismissedPatterns('owner', 'repo', 1, 'token');
    expect(result).toEqual([]);
  });

  it('does not learn active unresolved review threads', async () => {
    mockGraphql.mockResolvedValue(page([
      thread({
        body: '<!-- codeagora-v3 -->\n**CRITICAL** — Active finding\ndetails',
        isResolved: false,
        isOutdated: false,
      }),
    ]));

    const result = await collectDismissedPatterns('owner', 'repo', 1, 'token');
    expect(result).toEqual([]);
  });

  it('does not learn when GraphQL thread state cannot be read', async () => {
    mockGraphql.mockRejectedValue(new Error('GraphQL unavailable'));

    const result = await collectDismissedPatterns('owner', 'repo', 1, 'token');
    expect(result).toEqual([]);
  });

  it('does not learn when thread comment matching is incomplete', async () => {
    mockGraphql.mockResolvedValue(page([
      thread({
        body: '<!-- codeagora-v3 -->\n**CRITICAL** — Incomplete thread\ndetails',
        commentsHasNextPage: true,
      }),
    ]));

    const result = await collectDismissedPatterns('owner', 'repo', 1, 'token');
    expect(result).toEqual([]);
  });

  it('collects a CRITICAL pattern from a matching comment', async () => {
    mockGraphql.mockResolvedValue(page([
      thread({ body: '<!-- codeagora-v3 -->\n**CRITICAL** — SQL injection vulnerability\nsome details' }),
    ]));

    const result = await collectDismissedPatterns('owner', 'repo', 1, 'token');
    expect(result).toHaveLength(1);
    expect(result[0]!.pattern).toBe('SQL injection vulnerability');
    expect(result[0]!.severity).toBe('CRITICAL');
    expect(result[0]!.dismissCount).toBe(1);
    expect(result[0]!.action).toBe('downgrade');
  });

  it('collects a SUGGESTION pattern with suppress action', async () => {
    mockGraphql.mockResolvedValue(page([
      thread({
        body: '<!-- codeagora-v3 -->\n**SUGGESTION** — Use const instead of let\nsome details',
        isResolved: false,
        isOutdated: true,
      }),
    ]));

    const result = await collectDismissedPatterns('owner', 'repo', 1, 'token');
    expect(result).toHaveLength(1);
    expect(result[0]!.severity).toBe('SUGGESTION');
    expect(result[0]!.action).toBe('suppress');
  });

  it('merges duplicate patterns and increments dismissCount', async () => {
    const sameBody = '<!-- codeagora-v3 -->\n**WARNING** — Missing null check\ndetails';
    mockGraphql.mockResolvedValue(page([
      thread({ body: sameBody }),
      thread({ body: sameBody }),
    ]));

    const result = await collectDismissedPatterns('owner', 'repo', 1, 'token');
    expect(result).toHaveLength(1);
    expect(result[0]!.dismissCount).toBe(2);
  });

  it('collects multiple distinct patterns as separate entries', async () => {
    mockGraphql.mockResolvedValue(page([
      thread({ body: '<!-- codeagora-v3 -->\n**CRITICAL** — Pattern A\ndetails' }),
      thread({ body: '<!-- codeagora-v3 -->\n**WARNING** — Pattern B\ndetails' }),
    ]));

    const result = await collectDismissedPatterns('owner', 'repo', 1, 'token');
    expect(result).toHaveLength(2);
    const patterns = result.map((r) => r.pattern);
    expect(patterns).toContain('Pattern A');
    expect(patterns).toContain('Pattern B');
  });

  it('sets lastDismissed to today ISO date', async () => {
    mockGraphql.mockResolvedValue(page([
      thread({ body: '<!-- codeagora-v3 -->\n**CRITICAL** — Some issue\ndetails' }),
    ]));

    const today = new Date().toISOString().split('T')[0]!;
    const result = await collectDismissedPatterns('owner', 'repo', 1, 'token');
    expect(result[0]!.lastDismissed).toBe(today);
  });

  it('paginates review threads', async () => {
    mockGraphql
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
              nodes: [
                thread({ body: '<!-- codeagora-v3 -->\n**WARNING** — First page\ndetails' }),
              ],
            },
          },
        },
      })
      .mockResolvedValueOnce(page([
        thread({ body: '<!-- codeagora-v3 -->\n**WARNING** — Second page\ndetails' }),
      ]));

    const result = await collectDismissedPatterns('owner', 'repo', 1, 'token');

    expect(result.map((item) => item.pattern)).toEqual(['First page', 'Second page']);
    expect(mockGraphql).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ after: 'cursor-1' }));
  });
});
