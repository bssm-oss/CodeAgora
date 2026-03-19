import { describe, it, expect } from 'vitest';
import { buildDiffPositionIndex, resolvePosition, resolveLineRange } from '@codeagora/github/diff-parser.js';

const SIMPLE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,5 +1,6 @@
 line1
 line2
+added line
 line3
 line4
 line5`;

const MULTI_HUNK_DIFF = `diff --git a/src/bar.ts b/src/bar.ts
--- a/src/bar.ts
+++ b/src/bar.ts
@@ -1,4 +1,5 @@
 first
+inserted
 second
 third
 fourth
@@ -10,4 +11,5 @@
 ten
 eleven
+another
 twelve
 thirteen`;

const MULTI_FILE_DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 a1
+a-new
 a2
 a3
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -5,3 +5,4 @@
 b5
 b6
+b-new
 b7`;

const DELETE_DIFF = `diff --git a/src/del.ts b/src/del.ts
--- a/src/del.ts
+++ b/src/del.ts
@@ -1,5 +1,4 @@
 keep1
-deleted
 keep2
 keep3
 keep4`;

describe('buildDiffPositionIndex', () => {
  it('maps added line to correct position', () => {
    const index = buildDiffPositionIndex(SIMPLE_DIFF);
    // @@ line is position 1
    // " line1" is position 2, newLine 1
    // " line2" is position 3, newLine 2
    // "+added line" is position 4, newLine 3
    // " line3" is position 5, newLine 4
    expect(index['src/foo.ts:1']).toBe(2);
    expect(index['src/foo.ts:2']).toBe(3);
    expect(index['src/foo.ts:3']).toBe(4); // the added line
    expect(index['src/foo.ts:4']).toBe(5);
    expect(index['src/foo.ts:5']).toBe(6);
    expect(index['src/foo.ts:6']).toBe(7);
  });

  it('handles multi-hunk diffs with cumulative position', () => {
    const index = buildDiffPositionIndex(MULTI_HUNK_DIFF);
    // First hunk: @@ -1,4 +1,5 @@
    //   pos 1: @@
    //   pos 2: " first" → line 1
    //   pos 3: "+inserted" → line 2
    //   pos 4: " second" → line 3
    //   pos 5: " third" → line 4
    //   pos 6: " fourth" → line 5
    expect(index['src/bar.ts:1']).toBe(2);
    expect(index['src/bar.ts:2']).toBe(3); // inserted
    expect(index['src/bar.ts:3']).toBe(4);

    // Second hunk: @@ -10,4 +11,5 @@
    //   pos 7: @@
    //   pos 8: " ten" → line 11
    //   pos 9: " eleven" → line 12
    //   pos 10: "+another" → line 13
    //   pos 11: " twelve" → line 14
    //   pos 12: " thirteen" → line 15
    expect(index['src/bar.ts:11']).toBe(8);
    expect(index['src/bar.ts:13']).toBe(10); // another
    expect(index['src/bar.ts:14']).toBe(11);
  });

  it('handles multi-file diffs with per-file position reset', () => {
    const index = buildDiffPositionIndex(MULTI_FILE_DIFF);
    // File a: pos resets at "+++ b/src/a.ts"
    expect(index['src/a.ts:1']).toBe(2);
    expect(index['src/a.ts:2']).toBe(3); // a-new
    expect(index['src/a.ts:3']).toBe(4);

    // File b: pos resets at "+++ b/src/b.ts"
    expect(index['src/b.ts:5']).toBe(2);
    expect(index['src/b.ts:6']).toBe(3);
    expect(index['src/b.ts:7']).toBe(4); // b-new
    expect(index['src/b.ts:8']).toBe(5);
  });

  it('skips deleted lines (no newLine mapping)', () => {
    const index = buildDiffPositionIndex(DELETE_DIFF);
    // @@ pos 1
    // " keep1" pos 2 → line 1
    // "-deleted" pos 3 → no mapping (deleted)
    // " keep2" pos 4 → line 2
    expect(index['src/del.ts:1']).toBe(2);
    expect(index['src/del.ts:2']).toBe(4); // jumps over deleted line
    expect(index['src/del.ts:3']).toBe(5);
  });

  it('returns empty index for empty diff', () => {
    const index = buildDiffPositionIndex('');
    expect(Object.keys(index)).toHaveLength(0);
  });
});

describe('resolvePosition', () => {
  it('returns position for existing entry', () => {
    const index = buildDiffPositionIndex(SIMPLE_DIFF);
    expect(resolvePosition(index, 'src/foo.ts', 3)).toBe(4);
  });

  it('returns null for line not in diff', () => {
    const index = buildDiffPositionIndex(SIMPLE_DIFF);
    expect(resolvePosition(index, 'src/foo.ts', 100)).toBeNull();
  });

  it('returns null for unknown file', () => {
    const index = buildDiffPositionIndex(SIMPLE_DIFF);
    expect(resolvePosition(index, 'src/unknown.ts', 1)).toBeNull();
  });
});

describe('resolveLineRange', () => {
  it('resolves first line in range', () => {
    const index = buildDiffPositionIndex(SIMPLE_DIFF);
    expect(resolveLineRange(index, 'src/foo.ts', [1, 3])).toBe(2);
  });

  it('scans through range to find first hit', () => {
    const index = buildDiffPositionIndex(SIMPLE_DIFF);
    // Lines 50-53 don't exist, but we can test with a range that starts outside
    expect(resolveLineRange(index, 'src/foo.ts', [50, 60])).toBeNull();
  });

  it('returns null when entire range is outside diff', () => {
    const index = buildDiffPositionIndex(SIMPLE_DIFF);
    expect(resolveLineRange(index, 'src/foo.ts', [100, 200])).toBeNull();
  });
});
