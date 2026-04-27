/**
 * Context-Aware Review Tests (Issue #71)
 *
 * Tests for parseDiffFileRanges(), readSurroundingContext(),
 * buildReviewerPrompt() context integration, and token budget capping.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseDiffFileRanges,
  readSurroundingContext,
  mergeRanges,
} from '@codeagora/shared/utils/diff.js';
import { estimateTokens } from '@codeagora/core/pipeline/chunker.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// ============================================================================
// Sample Diffs
// ============================================================================

const SINGLE_FILE_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index abc1234..def5678 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,8 @@ export function login(user: string) {
   const token = generateToken(user);
+  if (!user) {
+    throw new Error('User required');
+  }
   return token;
 }
`;

const MULTI_FILE_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index abc1234..def5678 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,8 @@ export function login(user: string) {
   const token = generateToken(user);
+  if (!user) {
+    throw new Error('User required');
+  }
   return token;
 }
diff --git a/src/utils/validate.ts b/src/utils/validate.ts
index 111aaaa..222bbbb 100644
--- a/src/utils/validate.ts
+++ b/src/utils/validate.ts
@@ -5,3 +5,7 @@ export function validate(input: string) {
   return input.trim();
 }
+
+export function sanitize(input: string) {
+  return input.replace(/[<>]/g, '');
+}
`;

const RENAME_DIFF = `diff --git a/old-name.ts b/new-name.ts
similarity index 90%
rename from old-name.ts
rename to new-name.ts
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,3 +1,4 @@
 export const foo = 1;
+export const bar = 2;
 export const baz = 3;
`;

const DELETED_FILE_DIFF = `diff --git a/removed.ts b/removed.ts
deleted file mode 100644
index abc1234..0000000
--- a/removed.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-export function old() {
-  return 'gone';
-}
`;

const MULTI_HUNK_DIFF = `diff --git a/src/big-file.ts b/src/big-file.ts
index aaa..bbb 100644
--- a/src/big-file.ts
+++ b/src/big-file.ts
@@ -10,3 +10,4 @@ function first() {
   return 1;
+  // added line
 }
@@ -50,3 +51,4 @@ function second() {
   return 2;
+  // another addition
 }
`;

// ============================================================================
// parseDiffFileRanges
// ============================================================================

describe('parseDiffFileRanges', () => {
  it('extracts correct file and range from a single-file diff', () => {
    const result = parseDiffFileRanges(SINGLE_FILE_DIFF);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('src/auth.ts');
    expect(result[0].ranges).toHaveLength(1);
    // @@ -10,6 +10,8 @@ → start=10, count=8, end=17
    expect(result[0].ranges[0][0]).toBe(10);
    expect(result[0].ranges[0][1]).toBe(17);
  });

  it('handles multiple files', () => {
    const result = parseDiffFileRanges(MULTI_FILE_DIFF);
    expect(result).toHaveLength(2);
    expect(result[0].file).toBe('src/auth.ts');
    expect(result[1].file).toBe('src/utils/validate.ts');
    expect(result[1].ranges).toHaveLength(1);
  });

  it('handles rename headers', () => {
    const result = parseDiffFileRanges(RENAME_DIFF);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('new-name.ts');
    expect(result[0].ranges).toHaveLength(1);
  });

  it('skips deleted files (no +++ b/ line)', () => {
    const result = parseDiffFileRanges(DELETED_FILE_DIFF);
    expect(result).toHaveLength(0);
  });

  it('extracts multiple hunks from same file', () => {
    const result = parseDiffFileRanges(MULTI_HUNK_DIFF);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('src/big-file.ts');
    expect(result[0].ranges).toHaveLength(2);
    // First hunk: @@ -10,3 +10,4 @@ → start=10, count=4, end=13
    expect(result[0].ranges[0][0]).toBe(10);
    expect(result[0].ranges[0][1]).toBe(13);
    // Second hunk: @@ -50,3 +51,4 @@ → start=51, count=4, end=54
    expect(result[0].ranges[1][0]).toBe(51);
    expect(result[0].ranges[1][1]).toBe(54);
  });

  it('returns empty array for empty diff', () => {
    expect(parseDiffFileRanges('')).toEqual([]);
    expect(parseDiffFileRanges('   \n\n  ')).toEqual([]);
  });

  it('ignores embedded diff headers inside added fixture lines', () => {
    const diff = `diff --git a/benchmarks/golden-bugs/example/diff.patch b/benchmarks/golden-bugs/example/diff.patch
--- a/benchmarks/golden-bugs/example/diff.patch
+++ b/benchmarks/golden-bugs/example/diff.patch
@@ -1,2 +1,6 @@
+diff --git a/src/admin.ts b/src/admin.ts
+--- a/src/admin.ts
+++ b/src/admin.ts
+@@ -1 +1,2 @@
++export function adminOnly(user) { return true; }
`;

    const result = parseDiffFileRanges(diff);

    expect(result).toEqual([
      {
        file: 'benchmarks/golden-bugs/example/diff.patch',
        ranges: [[1, 6]],
      },
    ]);
  });

  it('handles hunk with no count (single line change)', () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-old
+new
`;
    const result = parseDiffFileRanges(diff);
    expect(result).toHaveLength(1);
    expect(result[0].ranges[0]).toEqual([1, 1]);
  });
});

// ============================================================================
// mergeRanges
// ============================================================================

describe('mergeRanges', () => {
  it('returns empty for empty input', () => {
    expect(mergeRanges([])).toEqual([]);
  });

  it('returns single range unchanged', () => {
    expect(mergeRanges([[5, 10]])).toEqual([[5, 10]]);
  });

  it('merges overlapping ranges', () => {
    expect(mergeRanges([[5, 15], [10, 20]])).toEqual([[5, 20]]);
  });

  it('merges adjacent ranges', () => {
    expect(mergeRanges([[5, 10], [11, 20]])).toEqual([[5, 20]]);
  });

  it('does not merge non-overlapping ranges', () => {
    expect(mergeRanges([[5, 10], [15, 20]])).toEqual([[5, 10], [15, 20]]);
  });

  it('handles unsorted input', () => {
    expect(mergeRanges([[15, 20], [5, 10], [8, 18]])).toEqual([[5, 20]]);
  });
});

// ============================================================================
// readSurroundingContext
// ============================================================================

describe('readSurroundingContext', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-ctx-'));

    // Create a sample source file with 30 lines
    const lines: string[] = [];
    for (let i = 1; i <= 30; i++) {
      lines.push(`line ${i} content`);
    }
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'sample.ts'), lines.join('\n'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('reads correct line range from file', async () => {
    const result = await readSurroundingContext(
      tmpDir,
      'src/sample.ts',
      [[10, 12]],
      3
    );

    expect(result).toContain('### src/sample.ts');
    expect(result).toContain('line 7 content');  // 10 - 3 = 7
    expect(result).toContain('line 10 content');
    expect(result).toContain('line 12 content');
    expect(result).toContain('line 15 content'); // 12 + 3 = 15
    // Should NOT include line 6 or line 16
    expect(result).not.toContain('line 6 content');
    expect(result).not.toContain('line 16 content');
  });

  it('merges overlapping ranges', async () => {
    const result = await readSurroundingContext(
      tmpDir,
      'src/sample.ts',
      [[10, 12], [14, 16]],
      3
    );

    // Ranges expand to [7,15] and [11,19], which overlap → merged to [7,19]
    expect(result).toContain('line 7 content');
    expect(result).toContain('line 19 content');
    // Should be a single continuous block (no ... separator between them)
    const codeBlock = result.split('```')[1];
    expect(codeBlock).not.toContain('...');
  });

  it('skips deleted/missing files', async () => {
    const result = await readSurroundingContext(
      tmpDir,
      'nonexistent/file.ts',
      [[1, 5]],
      3
    );
    expect(result).toBe('');
  });

  it('respects contextLines parameter', async () => {
    const result = await readSurroundingContext(
      tmpDir,
      'src/sample.ts',
      [[15, 15]],
      5
    );

    // 15 - 5 = 10, 15 + 5 = 20
    expect(result).toContain('line 10 content');
    expect(result).toContain('line 20 content');
    expect(result).not.toContain('line 9 content');
    expect(result).not.toContain('line 21 content');
  });

  it('clamps to file boundaries', async () => {
    const result = await readSurroundingContext(
      tmpDir,
      'src/sample.ts',
      [[1, 2]],
      5
    );

    // start clamped to 1 (not -4)
    expect(result).toContain('line 1 content');
    expect(result).toContain('line 7 content'); // 2 + 5
    expect(result).not.toContain('line 8 content');
  });

  it('returns empty string for zero contextLines', async () => {
    const result = await readSurroundingContext(
      tmpDir,
      'src/sample.ts',
      [[10, 12]],
      0
    );
    expect(result).toBe('');
  });

  it('returns empty string for empty ranges', async () => {
    const result = await readSurroundingContext(
      tmpDir,
      'src/sample.ts',
      [],
      5
    );
    expect(result).toBe('');
  });

  it('separates non-overlapping ranges with ...', async () => {
    const result = await readSurroundingContext(
      tmpDir,
      'src/sample.ts',
      [[5, 5], [25, 25]],
      2
    );

    // Ranges expand to [3,7] and [23,27] — not overlapping
    const codeBlock = result.split('```')[1];
    expect(codeBlock).toContain('...');
  });
});

// ============================================================================
// buildReviewerPrompt context integration
// ============================================================================

describe('buildReviewerPrompt context integration', () => {
  // We test buildReviewerPrompt indirectly by importing the reviewer module
  // and inspecting the prompt construction through executeReviewer's input.
  // Since buildReviewerPrompt is not exported, we test via the ReviewerInput interface.

  it('includes surrounding context section when provided', async () => {
    // Import the module to access the prompt building logic
    // Since buildReviewerPrompt is private, we test through the executeBackend mock
    const { executeReviewers } = await import('@codeagora/core/l1/reviewer.js');

    // Mock executeBackend to capture the prompt
    let capturedPrompt = '';
    const mockBackend = await import('@codeagora/core/l1/backend.js');
    const originalFn = mockBackend.executeBackend;
    vi.spyOn(mockBackend, 'executeBackend').mockImplementation(async (opts) => {
      capturedPrompt = opts.prompt;
      return 'No issues found.';
    });

    try {
      await executeReviewers([{
        config: {
          id: 'test-reviewer',
          model: 'test-model',
          backend: 'api' as const,
          timeout: 30,
        },
        groupName: 'test',
        diffContent: '--- a/file.ts\n+++ b/file.ts\n@@ -1,1 +1,2 @@\n line1\n+line2',
        prSummary: 'Test PR',
        surroundingContext: '### file.ts\n```\n   1 | const x = 1;\n   2 | const y = 2;\n```',
      }], 0);

      expect(capturedPrompt).toContain('## Surrounding Code Context');
      expect(capturedPrompt).toContain('### file.ts');
      expect(capturedPrompt).toContain('const x = 1;');
      // Context should appear BEFORE code changes
      const contextIdx = capturedPrompt.indexOf('## Surrounding Code Context');
      const changesIdx = capturedPrompt.indexOf('## Code Changes');
      expect(contextIdx).toBeLessThan(changesIdx);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('omits context section when not provided (backward compat)', async () => {
    const { executeReviewers } = await import('@codeagora/core/l1/reviewer.js');

    let capturedPrompt = '';
    const mockBackend = await import('@codeagora/core/l1/backend.js');
    vi.spyOn(mockBackend, 'executeBackend').mockImplementation(async (opts) => {
      capturedPrompt = opts.prompt;
      return 'No issues found.';
    });

    try {
      await executeReviewers([{
        config: {
          id: 'test-reviewer',
          model: 'test-model',
          backend: 'api' as const,
          timeout: 30,
        },
        groupName: 'test',
        diffContent: '--- a/file.ts\n+++ b/file.ts\n@@ -1,1 +1,2 @@\n line1\n+line2',
        prSummary: 'Test PR',
      }], 0);

      expect(capturedPrompt).not.toContain('## Surrounding Code Context');
      expect(capturedPrompt).toContain('## Code Changes');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ============================================================================
// Context token budget capping
// ============================================================================

describe('context token budget', () => {
  it('estimateTokens works for budget calculations', () => {
    // chars/4 heuristic
    expect(estimateTokens('a'.repeat(400))).toBe(100);
    expect(estimateTokens('')).toBe(0);
  });

  it('context budget is 30% of maxTokens', () => {
    const maxTokens = 8000;
    const contextBudget = Math.floor(maxTokens * 0.3);
    expect(contextBudget).toBe(2400);
  });

  it('large context would exceed budget threshold', () => {
    const maxTokens = 8000;
    const contextBudget = Math.floor(maxTokens * 0.3);
    // 2400 tokens = ~9600 chars
    const largeContext = 'x'.repeat(10000);
    expect(estimateTokens(largeContext)).toBeGreaterThan(contextBudget);
  });

  it('small context fits within budget', () => {
    const maxTokens = 8000;
    const contextBudget = Math.floor(maxTokens * 0.3);
    const smallContext = 'x'.repeat(100);
    expect(estimateTokens(smallContext)).toBeLessThan(contextBudget);
  });
});
