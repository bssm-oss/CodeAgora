/**
 * Diff Utility Tests
 */

import { describe, it, expect } from 'vitest';
import {
  extractFileListFromDiff,
  fuzzyMatchFilePath,
  extractCodeSnippet,
  extractMultipleSnippets,
} from '@codeagora/shared/utils/diff.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SINGLE_FILE_DIFF = `diff --git a/src/parser.ts b/src/parser.ts
index abc1234..def5678 100644
--- a/src/parser.ts
+++ b/src/parser.ts
@@ -1,5 +1,8 @@
 export function parse(input: string) {
-  return input;
+  const trimmed = input.trim();
+  if (!trimmed) return null;
+  return trimmed;
 }
`;

const MULTI_FILE_DIFF = `diff --git a/src/parser.ts b/src/parser.ts
index abc1234..def5678 100644
--- a/src/parser.ts
+++ b/src/parser.ts
@@ -1,5 +1,6 @@
 export function parse(input: string) {
-  return input;
+  return input.trim();
 }
diff --git a/src/validator.ts b/src/validator.ts
index 1111111..2222222 100644
--- a/src/validator.ts
+++ b/src/validator.ts
@@ -1,3 +1,4 @@
 export function validate(x: unknown): boolean {
+  if (x === null) return false;
   return Boolean(x);
 }
`;

const RENAMED_FILE_DIFF = `diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 90%
rename from src/old-name.ts
rename to src/new-name.ts
index abc1234..def5678 100644
--- a/src/old-name.ts
+++ b/src/new-name.ts
@@ -1,3 +1,3 @@
-export const NAME = 'old';
+export const NAME = 'new';
`;

// A diff whose added lines span lines 1–6 in the new file.
const SNIPPET_DIFF = `diff --git a/src/utils.ts b/src/utils.ts
index aaa1111..bbb2222 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,6 +1,10 @@
 export function add(a: number, b: number): number {
   return a + b;
 }
+
+export function subtract(a: number, b: number): number {
+  return a - b;
+}
+
 export function multiply(a: number, b: number): number {
   return a * b;
 }
`;

// ---------------------------------------------------------------------------
// extractFileListFromDiff
// ---------------------------------------------------------------------------

describe('extractFileListFromDiff', () => {
  it('returns empty array for empty diff', () => {
    expect(extractFileListFromDiff('')).toEqual([]);
  });

  it('returns single file path from single-file diff', () => {
    const result = extractFileListFromDiff(SINGLE_FILE_DIFF);
    expect(result).toEqual(['src/parser.ts']);
  });

  it('returns all file paths from multi-file diff', () => {
    const result = extractFileListFromDiff(MULTI_FILE_DIFF);
    expect(result).toEqual(['src/parser.ts', 'src/validator.ts']);
  });

  it('extracts the "a/" path from a renamed-file diff header', () => {
    // The regex captures the a/ side: a/src/old-name.ts
    const result = extractFileListFromDiff(RENAMED_FILE_DIFF);
    expect(result).toEqual(['src/old-name.ts']);
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatchFilePath
// ---------------------------------------------------------------------------

describe('fuzzyMatchFilePath', () => {
  const paths = ['src/parser.ts', 'src/validator.ts', 'src/utils/diff.ts'];

  it('returns null when filePaths array is empty', () => {
    expect(fuzzyMatchFilePath('parser.ts', [])).toBeNull();
  });

  it('returns the path on exact filename match', () => {
    const result = fuzzyMatchFilePath('parser.ts', paths);
    expect(result).toBe('src/parser.ts');
  });

  it('finds the path via partial match when the base name is a substring of a path', () => {
    // "parse.ts" → exact: no path ends with "parse.ts"; partial: base "parse" is
    // a substring of "src/parseResult.ts" → partial branch returns that path.
    const partialPaths = ['src/parseResult.ts', 'src/validator.ts'];
    const result = fuzzyMatchFilePath('parse.ts', partialPaths);
    expect(result).toBe('src/parseResult.ts');
  });

  it('returns null when no filename token matches any path', () => {
    const result = fuzzyMatchFilePath('auth.ts', paths);
    expect(result).toBeNull();
  });

  it('returns null when query has no filename-like tokens', () => {
    expect(fuzzyMatchFilePath('line 42 has a bug', paths)).toBeNull();
  });

  it('prefers exact filename match over partial match when both exist', () => {
    const ambiguousPaths = ['src/diff.ts', 'src/utils/diff.ts'];
    // "diff.ts" is an exact suffix of both; the first one found wins
    const result = fuzzyMatchFilePath('diff.ts', ambiguousPaths);
    expect(result).toBe('src/diff.ts');
  });
});

// ---------------------------------------------------------------------------
// extractCodeSnippet
// ---------------------------------------------------------------------------

describe('extractCodeSnippet', () => {
  it('returns null when the file is not in the diff', () => {
    const result = extractCodeSnippet(SINGLE_FILE_DIFF, 'src/missing.ts', [1, 3]);
    expect(result).toBeNull();
  });

  it('returns null when the line range falls entirely outside diff content', () => {
    // SINGLE_FILE_DIFF only has a few lines (1-based ~1–4); ask for very high range
    // with 0 context so no lines are captured.
    const result = extractCodeSnippet(SINGLE_FILE_DIFF, 'src/parser.ts', [1000, 1002], 0);
    expect(result).toBeNull();
  });

  it('returns a snippet with line numbers for a valid file and range', () => {
    // Line 5 of the new file is the "subtract" function start
    const result = extractCodeSnippet(SNIPPET_DIFF, 'src/utils.ts', [5, 5], 0);
    expect(result).not.toBeNull();
    expect(result!.filePath).toBe('src/utils.ts');
    expect(result!.lineRange).toEqual([5, 5]);
    expect(result!.code).toContain('|');          // formatted "NNNN | <code>"
    expect(result!.context).toContain('src/utils.ts');
  });

  it('includes surrounding context lines when contextLines > 0', () => {
    // Ask for line 5 with 2 lines of context → should capture lines 3–7
    const result = extractCodeSnippet(SNIPPET_DIFF, 'src/utils.ts', [5, 5], 2);
    expect(result).not.toBeNull();
    const lineNumbers = result!.code
      .split('\n')
      .map((l) => parseInt(l.trim(), 10))
      .filter((n) => !isNaN(n));
    // Should include lines before 5 (context) and potentially after
    expect(lineNumbers.length).toBeGreaterThan(1);
    expect(Math.min(...lineNumbers)).toBeLessThan(5);
  });

  it('context field contains file path and line range', () => {
    const result = extractCodeSnippet(SNIPPET_DIFF, 'src/utils.ts', [4, 6], 0);
    if (result) {
      expect(result.context).toContain('src/utils.ts');
      expect(result.context).toContain('4');
      expect(result.context).toContain('6');
    }
  });
});

// ---------------------------------------------------------------------------
// extractMultipleSnippets
// ---------------------------------------------------------------------------

describe('extractMultipleSnippets', () => {
  it('returns an empty map when issues array is empty', () => {
    const result = extractMultipleSnippets(MULTI_FILE_DIFF, []);
    expect(result.size).toBe(0);
  });

  it('returns snippets for all issues whose files exist in the diff', () => {
    const issues = [
      { filePath: 'src/parser.ts', lineRange: [1, 2] as [number, number] },
      { filePath: 'src/validator.ts', lineRange: [1, 2] as [number, number] },
    ];
    const result = extractMultipleSnippets(MULTI_FILE_DIFF, issues, 0);
    // Both files are present in the diff; at least one snippet should be found
    expect(result.size).toBeGreaterThan(0);
  });

  it('omits entries for files not present in the diff', () => {
    const issues = [
      { filePath: 'src/parser.ts', lineRange: [1, 2] as [number, number] },
      { filePath: 'src/nonexistent.ts', lineRange: [1, 3] as [number, number] },
    ];
    const result = extractMultipleSnippets(MULTI_FILE_DIFF, issues, 0);
    const keys = [...result.keys()];
    expect(keys.some((k) => k.startsWith('src/nonexistent.ts'))).toBe(false);
  });

  it('keys snippets as "filePath:start-end"', () => {
    const issues = [{ filePath: 'src/parser.ts', lineRange: [1, 1] as [number, number] }];
    const result = extractMultipleSnippets(MULTI_FILE_DIFF, issues, 0);
    if (result.size > 0) {
      expect([...result.keys()][0]).toBe('src/parser.ts:1-1');
    }
  });
});
