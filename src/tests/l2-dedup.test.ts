/**
 * L2 Discussion Deduplication Tests
 */

import { describe, it, expect } from 'vitest';
import { findDuplicates, mergeDiscussions, deduplicateDiscussions } from '@codeagora/core/l2/deduplication.js';
import type { Discussion, Severity } from '@codeagora/core/types/core.js';

// ---------------------------------------------------------------------------
// Helper factory
// ---------------------------------------------------------------------------

let _idCounter = 0;

function makeDiscussion(overrides: Partial<Discussion> = {}): Discussion {
  _idCounter++;
  return {
    id: `d${String(_idCounter).padStart(3, '0')}`,
    severity: 'WARNING',
    issueTitle: 'Some Issue',
    filePath: 'src/auth.ts',
    lineRange: [10, 20],
    codeSnippet: 'function login() { return false; }',
    evidenceDocs: ['.ca/evidence/r1.md'],
    status: 'pending',
    ...overrides,
  };
}

// Reset counter before each test suite to keep IDs deterministic within a describe block
// (Each describe-level `beforeEach` is impractical here; we rely on unique overrides instead)

// ---------------------------------------------------------------------------

describe('findDuplicates()', () => {
  describe('no duplicates', () => {
    it('returns an empty map for an empty list', () => {
      const result = findDuplicates([]);
      expect(result.size).toBe(0);
    });

    it('returns an empty map for a single discussion', () => {
      const d = makeDiscussion({ id: 'solo-1' });
      const result = findDuplicates([d]);
      expect(result.size).toBe(0);
    });

    it('returns empty map when same file but non-overlapping line ranges', () => {
      const d1 = makeDiscussion({ id: 'nol-1', filePath: 'src/auth.ts', lineRange: [1, 10], issueTitle: 'Issue Alpha' });
      const d2 = makeDiscussion({ id: 'nol-2', filePath: 'src/auth.ts', lineRange: [20, 30], issueTitle: 'Issue Alpha' });

      const result = findDuplicates([d1, d2]);
      expect(result.size).toBe(0);
    });

    it('returns empty map when different files even with same line range and title', () => {
      const d1 = makeDiscussion({ id: 'df-1', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'Null pointer' });
      const d2 = makeDiscussion({ id: 'df-2', filePath: 'src/user.ts', lineRange: [10, 20], issueTitle: 'Null pointer' });

      const result = findDuplicates([d1, d2]);
      expect(result.size).toBe(0);
    });

    it('returns empty map when titles are too dissimilar (below 60% threshold)', () => {
      // "foo bar" vs "baz qux" → 0/4 intersection → 0% similarity
      const d1 = makeDiscussion({ id: 'thr-1', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'foo bar' });
      const d2 = makeDiscussion({ id: 'thr-2', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'baz qux' });

      const result = findDuplicates([d1, d2]);
      expect(result.size).toBe(0);
    });
  });

  describe('duplicates detected', () => {
    it('detects two discussions on the same file with overlapping ranges and similar titles', () => {
      const d1 = makeDiscussion({ id: 'dup-1', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'Null pointer dereference' });
      const d2 = makeDiscussion({ id: 'dup-2', filePath: 'src/auth.ts', lineRange: [15, 25], issueTitle: 'Null pointer dereference' });

      const result = findDuplicates([d1, d2]);

      expect(result.size).toBe(1);
      expect(result.has('dup-1')).toBe(true);
      expect(result.get('dup-1')).toContain('dup-2');
    });

    it('uses the first discussion as primary key in the map', () => {
      const d1 = makeDiscussion({ id: 'pk-1', filePath: 'src/x.ts', lineRange: [5, 15], issueTitle: 'Missing null check' });
      const d2 = makeDiscussion({ id: 'pk-2', filePath: 'src/x.ts', lineRange: [5, 15], issueTitle: 'Missing null check' });

      const result = findDuplicates([d1, d2]);

      // Primary is d1 (first encountered), duplicate is d2
      expect(result.has('pk-1')).toBe(true);
      expect(result.has('pk-2')).toBe(false);
    });

    it('detects a duplicate when line ranges only touch at a single point', () => {
      // [1,10] and [10,20] share line 10 → overlap
      const d1 = makeDiscussion({ id: 'touch-1', filePath: 'src/auth.ts', lineRange: [1, 10], issueTitle: 'SQL injection attack' });
      const d2 = makeDiscussion({ id: 'touch-2', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'SQL injection attack' });

      const result = findDuplicates([d1, d2]);

      expect(result.size).toBe(1);
    });

    it('detects multiple duplicates for a single primary', () => {
      const d1 = makeDiscussion({ id: 'multi-1', filePath: 'src/auth.ts', lineRange: [1, 30], issueTitle: 'Memory leak issue' });
      const d2 = makeDiscussion({ id: 'multi-2', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'Memory leak issue' });
      const d3 = makeDiscussion({ id: 'multi-3', filePath: 'src/auth.ts', lineRange: [5, 15], issueTitle: 'Memory leak issue' });

      const result = findDuplicates([d1, d2, d3]);

      expect(result.get('multi-1')).toContain('multi-2');
      expect(result.get('multi-1')).toContain('multi-3');
    });
  });
});

// ---------------------------------------------------------------------------

describe('mergeDiscussions()', () => {
  describe('line range expansion', () => {
    it('expands line range to cover the union of primary and duplicate ranges', () => {
      const primary = makeDiscussion({ id: 'mr-1', lineRange: [10, 20] });
      const dup = makeDiscussion({ id: 'mr-2', lineRange: [15, 30] });

      const merged = mergeDiscussions(primary, [dup]);

      expect(merged.lineRange[0]).toBe(10);
      expect(merged.lineRange[1]).toBe(30);
    });

    it('expands line range across multiple duplicates', () => {
      const primary = makeDiscussion({ id: 'mrl-1', lineRange: [10, 20] });
      const dup1 = makeDiscussion({ id: 'mrl-2', lineRange: [5, 15] });
      const dup2 = makeDiscussion({ id: 'mrl-3', lineRange: [18, 40] });

      const merged = mergeDiscussions(primary, [dup1, dup2]);

      expect(merged.lineRange[0]).toBe(5);
      expect(merged.lineRange[1]).toBe(40);
    });

    it('keeps line range unchanged when duplicates are contained within primary range', () => {
      const primary = makeDiscussion({ id: 'mrc-1', lineRange: [1, 50] });
      const dup = makeDiscussion({ id: 'mrc-2', lineRange: [10, 20] });

      const merged = mergeDiscussions(primary, [dup]);

      expect(merged.lineRange[0]).toBe(1);
      expect(merged.lineRange[1]).toBe(50);
    });
  });

  describe('evidence docs combination', () => {
    it('combines evidence docs from primary and duplicate', () => {
      const primary = makeDiscussion({ id: 'ed-1', evidenceDocs: ['.ca/evidence/r1.md'] });
      const dup = makeDiscussion({ id: 'ed-2', evidenceDocs: ['.ca/evidence/r2.md'] });

      const merged = mergeDiscussions(primary, [dup]);

      expect(merged.evidenceDocs).toContain('.ca/evidence/r1.md');
      expect(merged.evidenceDocs).toContain('.ca/evidence/r2.md');
    });

    it('deduplicates evidence docs that appear in both primary and duplicate', () => {
      const sharedDoc = '.ca/evidence/shared.md';
      const primary = makeDiscussion({ id: 'edd-1', evidenceDocs: [sharedDoc, '.ca/evidence/r1.md'] });
      const dup = makeDiscussion({ id: 'edd-2', evidenceDocs: [sharedDoc, '.ca/evidence/r2.md'] });

      const merged = mergeDiscussions(primary, [dup]);

      const count = merged.evidenceDocs.filter((d) => d === sharedDoc).length;
      expect(count).toBe(1);
    });

    it('accumulates evidence docs from multiple duplicates', () => {
      const primary = makeDiscussion({ id: 'edm-1', evidenceDocs: ['.ca/evidence/r1.md'] });
      const dup1 = makeDiscussion({ id: 'edm-2', evidenceDocs: ['.ca/evidence/r2.md'] });
      const dup2 = makeDiscussion({ id: 'edm-3', evidenceDocs: ['.ca/evidence/r3.md'] });

      const merged = mergeDiscussions(primary, [dup1, dup2]);

      expect(merged.evidenceDocs).toContain('.ca/evidence/r1.md');
      expect(merged.evidenceDocs).toContain('.ca/evidence/r2.md');
      expect(merged.evidenceDocs).toContain('.ca/evidence/r3.md');
    });
  });

  describe('severity escalation', () => {
    it('uses the highest severity when duplicate has higher severity than primary', () => {
      const primary = makeDiscussion({ id: 'sev-1', severity: 'WARNING' });
      const dup = makeDiscussion({ id: 'sev-2', severity: 'CRITICAL' });

      const merged = mergeDiscussions(primary, [dup]);

      expect(merged.severity).toBe('CRITICAL');
    });

    it('keeps primary severity when it is already the highest', () => {
      const primary = makeDiscussion({ id: 'sevh-1', severity: 'HARSHLY_CRITICAL' });
      const dup = makeDiscussion({ id: 'sevh-2', severity: 'SUGGESTION' });

      const merged = mergeDiscussions(primary, [dup]);

      expect(merged.severity).toBe('HARSHLY_CRITICAL');
    });

    it('uses HARSHLY_CRITICAL as top severity across all levels', () => {
      const primary = makeDiscussion({ id: 'sevt-1', severity: 'CRITICAL' });
      const dup1 = makeDiscussion({ id: 'sevt-2', severity: 'WARNING' });
      const dup2 = makeDiscussion({ id: 'sevt-3', severity: 'HARSHLY_CRITICAL' });

      const merged = mergeDiscussions(primary, [dup1, dup2]);

      expect(merged.severity).toBe('HARSHLY_CRITICAL');
    });

    it('keeps same severity when all discussions share the same severity', () => {
      const primary = makeDiscussion({ id: 'sevs-1', severity: 'WARNING' });
      const dup = makeDiscussion({ id: 'sevs-2', severity: 'WARNING' });

      const merged = mergeDiscussions(primary, [dup]);

      expect(merged.severity).toBe('WARNING');
    });
  });

  describe('title annotation', () => {
    it('appends merge count to the primary issue title', () => {
      const primary = makeDiscussion({ id: 'ttl-1', issueTitle: 'Original Title' });
      const dup = makeDiscussion({ id: 'ttl-2', issueTitle: 'Duplicate Title' });

      const merged = mergeDiscussions(primary, [dup]);

      expect(merged.issueTitle).toContain('Original Title');
      expect(merged.issueTitle).toContain('1 duplicate(s)');
    });

    it('reflects the correct count when merging two duplicates', () => {
      const primary = makeDiscussion({ id: 'ttl2-1', issueTitle: 'Root Issue' });
      const dup1 = makeDiscussion({ id: 'ttl2-2' });
      const dup2 = makeDiscussion({ id: 'ttl2-3' });

      const merged = mergeDiscussions(primary, [dup1, dup2]);

      expect(merged.issueTitle).toContain('2 duplicate(s)');
    });
  });

  describe('primary fields preserved', () => {
    it('preserves the primary discussion id', () => {
      const primary = makeDiscussion({ id: 'pf-primary', filePath: 'src/auth.ts' });
      const dup = makeDiscussion({ id: 'pf-dup', filePath: 'src/auth.ts' });

      const merged = mergeDiscussions(primary, [dup]);

      expect(merged.id).toBe('pf-primary');
    });

    it('preserves the primary discussion filePath', () => {
      const primary = makeDiscussion({ id: 'fp-primary', filePath: 'src/auth.ts' });
      const dup = makeDiscussion({ id: 'fp-dup', filePath: 'src/auth.ts' });

      const merged = mergeDiscussions(primary, [dup]);

      expect(merged.filePath).toBe('src/auth.ts');
    });
  });
});

// ---------------------------------------------------------------------------

describe('deduplicateDiscussions()', () => {
  describe('no duplicates', () => {
    it('returns empty deduplicated list for empty input', () => {
      const result = deduplicateDiscussions([]);

      expect(result.deduplicated).toEqual([]);
      expect(result.mergedCount).toBe(0);
    });

    it('returns the same single item for a single-item list', () => {
      const d = makeDiscussion({ id: 'dd-solo' });
      const result = deduplicateDiscussions([d]);

      expect(result.deduplicated).toHaveLength(1);
      expect(result.mergedCount).toBe(0);
    });

    it('returns all items unchanged when no items are duplicates', () => {
      const d1 = makeDiscussion({ id: 'nd-1', filePath: 'src/a.ts', lineRange: [1, 10], issueTitle: 'Alpha Issue' });
      const d2 = makeDiscussion({ id: 'nd-2', filePath: 'src/b.ts', lineRange: [1, 10], issueTitle: 'Alpha Issue' });

      const result = deduplicateDiscussions([d1, d2]);

      expect(result.deduplicated).toHaveLength(2);
      expect(result.mergedCount).toBe(0);
    });
  });

  describe('with duplicates', () => {
    it('merges a pair of duplicates into a single entry', () => {
      const d1 = makeDiscussion({ id: 'wdup-1', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'SQL injection attack' });
      const d2 = makeDiscussion({ id: 'wdup-2', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'SQL injection attack' });

      const result = deduplicateDiscussions([d1, d2]);

      expect(result.deduplicated).toHaveLength(1);
      expect(result.mergedCount).toBe(1);
    });

    it('merged entry retains the primary discussion id', () => {
      const d1 = makeDiscussion({ id: 'wdup-p1', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'SQL injection attack' });
      const d2 = makeDiscussion({ id: 'wdup-p2', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'SQL injection attack' });

      const result = deduplicateDiscussions([d1, d2]);

      expect(result.deduplicated[0].id).toBe('wdup-p1');
    });

    it('mergedCount equals the number of discussions that were absorbed', () => {
      const d1 = makeDiscussion({ id: 'cnt-1', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'Memory leak problem' });
      const d2 = makeDiscussion({ id: 'cnt-2', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'Memory leak problem' });
      const d3 = makeDiscussion({ id: 'cnt-3', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'Memory leak problem' });

      const result = deduplicateDiscussions([d1, d2, d3]);

      // All three collapse to 1, so 2 were absorbed
      expect(result.mergedCount).toBe(2);
      expect(result.deduplicated).toHaveLength(1);
    });

    it('non-duplicate items in the same list pass through unchanged', () => {
      const d1 = makeDiscussion({ id: 'pass-1', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'SQL injection attack' });
      const d2 = makeDiscussion({ id: 'pass-2', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'SQL injection attack' });
      const d3 = makeDiscussion({ id: 'pass-3', filePath: 'src/user.ts', lineRange: [50, 60], issueTitle: 'Completely different issue' });

      const result = deduplicateDiscussions([d1, d2, d3]);

      expect(result.deduplicated).toHaveLength(2);
      expect(result.mergedCount).toBe(1);

      const ids = result.deduplicated.map((d) => d.id);
      expect(ids).toContain('pass-1');
      expect(ids).toContain('pass-3');
    });
  });

  describe('transitive duplicates', () => {
    it('handles a chain where d1 duplicates d2 and d1 duplicates d3 (all collapse to d1)', () => {
      // d1 is primary; both d2 and d3 are duplicates of d1
      const d1 = makeDiscussion({ id: 'trans-1', filePath: 'src/auth.ts', lineRange: [1, 50], issueTitle: 'Race condition bug' });
      const d2 = makeDiscussion({ id: 'trans-2', filePath: 'src/auth.ts', lineRange: [10, 30], issueTitle: 'Race condition bug' });
      const d3 = makeDiscussion({ id: 'trans-3', filePath: 'src/auth.ts', lineRange: [20, 40], issueTitle: 'Race condition bug' });

      const result = deduplicateDiscussions([d1, d2, d3]);

      expect(result.deduplicated).toHaveLength(1);
      expect(result.deduplicated[0].id).toBe('trans-1');
      expect(result.mergedCount).toBe(2);
    });

    it('does not double-count a discussion that was already absorbed', () => {
      const d1 = makeDiscussion({ id: 'dc-1', filePath: 'src/auth.ts', lineRange: [1, 30], issueTitle: 'Use after free memory' });
      const d2 = makeDiscussion({ id: 'dc-2', filePath: 'src/auth.ts', lineRange: [10, 20], issueTitle: 'Use after free memory' });
      const d3 = makeDiscussion({ id: 'dc-3', filePath: 'src/auth.ts', lineRange: [15, 25], issueTitle: 'Use after free memory' });

      const result = deduplicateDiscussions([d1, d2, d3]);

      // 3 inputs, 1 output → 2 merged, no double-counting
      const totalCovered = result.deduplicated.length + result.mergedCount;
      expect(totalCovered).toBe(3);
    });
  });
});
