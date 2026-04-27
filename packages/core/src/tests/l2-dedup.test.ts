/**
 * L2 Deduplication — mergeDiscussions, findDuplicates, similarity boundaries
 */

import { describe, it, expect } from 'vitest';
import {
  findDuplicates,
  mergeDiscussions,
  deduplicateDiscussions,
} from '../l2/deduplication.js';
import type { Discussion } from '../types/core.js';

// ============================================================================
// Helpers
// ============================================================================

function makeDiscussion(overrides: Partial<Discussion> & { id: string }): Discussion {
  return {
    severity: 'WARNING',
    issueTitle: 'null pointer dereference',
    filePath: 'src/foo.ts',
    lineRange: [10, 20],
    codeSnippet: '',
    evidenceDocs: ['evidence-a.md'],
    status: 'pending',
    ...overrides,
  };
}

// ============================================================================
// findDuplicates
// ============================================================================

describe('findDuplicates', () => {
  it('returns empty map for a single discussion', () => {
    const d = makeDiscussion({ id: 'd001' });
    expect(findDuplicates([d]).size).toBe(0);
  });

  it('groups discussions on the same file with overlapping lines and similar title', () => {
    const d1 = makeDiscussion({ id: 'd001', filePath: 'src/a.ts', lineRange: [5, 15], issueTitle: 'null pointer dereference' });
    const d2 = makeDiscussion({ id: 'd002', filePath: 'src/a.ts', lineRange: [10, 20], issueTitle: 'null pointer dereference' });
    const map = findDuplicates([d1, d2]);
    expect(map.has('d001')).toBe(true);
    expect(map.get('d001')).toContain('d002');
  });

  it('does NOT group discussions on different files', () => {
    const d1 = makeDiscussion({ id: 'd001', filePath: 'src/a.ts', lineRange: [1, 10] });
    const d2 = makeDiscussion({ id: 'd002', filePath: 'src/b.ts', lineRange: [1, 10] });
    expect(findDuplicates([d1, d2]).size).toBe(0);
  });

  it('does NOT group discussions with non-overlapping line ranges', () => {
    const d1 = makeDiscussion({ id: 'd001', filePath: 'src/a.ts', lineRange: [1, 5] });
    const d2 = makeDiscussion({ id: 'd002', filePath: 'src/a.ts', lineRange: [30, 40] });
    expect(findDuplicates([d1, d2]).size).toBe(0);
  });

  it('does NOT group discussions with low title similarity', () => {
    const d1 = makeDiscussion({ id: 'd001', filePath: 'src/a.ts', lineRange: [1, 10], issueTitle: 'sql injection risk' });
    const d2 = makeDiscussion({ id: 'd002', filePath: 'src/a.ts', lineRange: [1, 10], issueTitle: 'memory leak unclosed resource' });
    // Jaccard similarity is 0 (no common words)
    expect(findDuplicates([d1, d2]).size).toBe(0);
  });

  it('uses the higher 0.8 threshold for single-word titles', () => {
    // Single-word titles: exact match → similarity 1.0, should exceed 0.8
    const d1 = makeDiscussion({ id: 'd001', filePath: 'src/a.ts', lineRange: [1, 5], issueTitle: 'overflow' });
    const d2 = makeDiscussion({ id: 'd002', filePath: 'src/a.ts', lineRange: [1, 5], issueTitle: 'overflow' });
    expect(findDuplicates([d1, d2]).size).toBe(1);
  });

  it('uses the standard 0.6 threshold for multi-word titles', () => {
    // Jaccard: {null, pointer} ∩ {null, pointer, issue} / {null, pointer, issue} = 2/3 ≈ 0.67 > 0.6
    const d1 = makeDiscussion({ id: 'd001', filePath: 'src/a.ts', lineRange: [1, 10], issueTitle: 'null pointer' });
    const d2 = makeDiscussion({ id: 'd002', filePath: 'src/a.ts', lineRange: [1, 10], issueTitle: 'null pointer issue' });
    expect(findDuplicates([d1, d2]).size).toBe(1);
  });

  it('transitively groups A-B and B-C into one cluster', () => {
    const d1 = makeDiscussion({ id: 'd001', filePath: 'src/a.ts', lineRange: [1, 10], issueTitle: 'null pointer' });
    const d2 = makeDiscussion({ id: 'd002', filePath: 'src/a.ts', lineRange: [5, 15], issueTitle: 'null pointer' });
    const d3 = makeDiscussion({ id: 'd003', filePath: 'src/a.ts', lineRange: [10, 20], issueTitle: 'null pointer' });
    const map = findDuplicates([d1, d2, d3]);
    // d001 is primary, d002 and d003 are duplicates
    expect(map.get('d001')).toContain('d002');
    expect(map.get('d001')).toContain('d003');
  });

  it('groups same root-cause security findings with different wording', () => {
    const d1 = makeDiscussion({
      id: 'd001',
      filePath: 'src/admin.ts',
      lineRange: [42, 48],
      issueTitle: 'Admin endpoint bypasses authorization',
      codeSnippet: '42 | router.post("/admin", async (req) => deleteUser(req.body.id));',
    });
    const d2 = makeDiscussion({
      id: 'd002',
      filePath: 'src/admin.ts',
      lineRange: [43, 47],
      issueTitle: 'Missing permission check before destructive route',
      codeSnippet: '43 | router.post("/admin", async (req) => deleteUser(req.body.id));',
    });

    const map = findDuplicates([d1, d2]);

    expect(map.get('d001')).toContain('d002');
  });
});

// ============================================================================
// mergeDiscussions
// ============================================================================

describe('mergeDiscussions', () => {
  it('expands line range to cover all duplicates', () => {
    const primary = makeDiscussion({ id: 'd001', lineRange: [10, 20], evidenceDocs: ['ev1.md'] });
    const dup = makeDiscussion({ id: 'd002', lineRange: [5, 25], evidenceDocs: ['ev2.md'] });
    const merged = mergeDiscussions(primary, [dup]);
    expect(merged.lineRange).toEqual([5, 25]);
  });

  it('uses the highest severity among all duplicates', () => {
    const primary = makeDiscussion({ id: 'd001', severity: 'WARNING' });
    const dup = makeDiscussion({ id: 'd002', severity: 'CRITICAL' });
    const merged = mergeDiscussions(primary, [dup]);
    expect(merged.severity).toBe('CRITICAL');
  });

  it('combines evidence documents without duplicates', () => {
    const primary = makeDiscussion({ id: 'd001', evidenceDocs: ['ev1.md', 'ev2.md'] });
    const dup = makeDiscussion({ id: 'd002', evidenceDocs: ['ev2.md', 'ev3.md'] });
    const merged = mergeDiscussions(primary, [dup]);
    expect(merged.evidenceDocs).toContain('ev1.md');
    expect(merged.evidenceDocs).toContain('ev2.md');
    expect(merged.evidenceDocs).toContain('ev3.md');
    // No duplicates
    expect(new Set(merged.evidenceDocs).size).toBe(merged.evidenceDocs.length);
  });

  it('appends merged count to issue title', () => {
    const primary = makeDiscussion({ id: 'd001', issueTitle: 'null check' });
    const dup1 = makeDiscussion({ id: 'd002' });
    const dup2 = makeDiscussion({ id: 'd003' });
    const merged = mergeDiscussions(primary, [dup1, dup2]);
    expect(merged.issueTitle).toContain('merged with 2 duplicate(s)');
  });

  it('preserves primary id', () => {
    const primary = makeDiscussion({ id: 'd001' });
    const dup = makeDiscussion({ id: 'd002' });
    const merged = mergeDiscussions(primary, [dup]);
    expect(merged.id).toBe('d001');
  });
});

// ============================================================================
// deduplicateDiscussions
// ============================================================================

describe('deduplicateDiscussions', () => {
  it('returns all discussions unchanged when there are no duplicates', () => {
    const d1 = makeDiscussion({ id: 'd001', filePath: 'src/a.ts', lineRange: [1, 5] });
    const d2 = makeDiscussion({ id: 'd002', filePath: 'src/b.ts', lineRange: [1, 5] });
    const { deduplicated, mergedCount } = deduplicateDiscussions([d1, d2]);
    expect(deduplicated).toHaveLength(2);
    expect(mergedCount).toBe(0);
  });

  it('reduces count when duplicates are present', () => {
    const d1 = makeDiscussion({ id: 'd001', filePath: 'src/a.ts', lineRange: [1, 10], issueTitle: 'null pointer' });
    const d2 = makeDiscussion({ id: 'd002', filePath: 'src/a.ts', lineRange: [5, 15], issueTitle: 'null pointer' });
    const { deduplicated, mergedCount } = deduplicateDiscussions([d1, d2]);
    expect(deduplicated).toHaveLength(1);
    expect(mergedCount).toBe(1);
  });
});
