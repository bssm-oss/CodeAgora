/**
 * Unit tests for auto-approve trivial diff detection.
 */

import { describe, it, expect } from 'vitest';
import { analyzeTrivialDiff } from '@codeagora/core/pipeline/auto-approve.js';

const DEFAULT_CONFIG = {
  maxLines: 5,
  allowedFilePatterns: ['*.md', '*.txt', '*.rst', 'docs/**'],
};

// ============================================================================
// Helpers
// ============================================================================

function makeDiff(filePath: string, lines: string[]): string {
  const hunks = lines.map((l) => (l.startsWith('+') || l.startsWith('-') ? l : `+${l}`));
  return [
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    '@@ -1,1 +1,1 @@',
    ...hunks,
  ].join('\n');
}

// ============================================================================
// Tests
// ============================================================================

describe('analyzeTrivialDiff', () => {
  it('empty diff → isTrivial=true', () => {
    const result = analyzeTrivialDiff('', DEFAULT_CONFIG);
    expect(result.isTrivial).toBe(true);
  });

  it('whitespace-only diff string → isTrivial=true', () => {
    const result = analyzeTrivialDiff('   \n\n  ', DEFAULT_CONFIG);
    expect(result.isTrivial).toBe(true);
  });

  it('comment-only diff → isTrivial=true, reason=comments-only', () => {
    const diff = makeDiff('src/app.ts', [
      '+// This is a comment',
      '+// Another comment',
      '-// Old comment',
    ]);
    const result = analyzeTrivialDiff(diff, DEFAULT_CONFIG);
    expect(result.isTrivial).toBe(true);
    expect(result.reason).toBe('comments-only');
  });

  it('block comment lines → isTrivial=true, reason=comments-only', () => {
    const diff = makeDiff('src/app.ts', [
      '+/* start',
      '+ * middle',
      '+ */',
    ]);
    const result = analyzeTrivialDiff(diff, DEFAULT_CONFIG);
    expect(result.isTrivial).toBe(true);
    expect(result.reason).toBe('comments-only');
  });

  it('blank-line-only diff → isTrivial=true', () => {
    const diff = makeDiff('src/app.ts', [
      '+',
      '+',
      '-',
    ]);
    const result = analyzeTrivialDiff(diff, DEFAULT_CONFIG);
    expect(result.isTrivial).toBe(true);
  });

  it('docs-only diff (README.md) → isTrivial=true, reason=docs-only', () => {
    const diff = makeDiff('README.md', [
      '+# New heading',
      '+Some documentation text',
      '-# Old heading',
    ]);
    const result = analyzeTrivialDiff(diff, DEFAULT_CONFIG);
    expect(result.isTrivial).toBe(true);
    expect(result.reason).toBe('docs-only');
  });

  it('docs-only diff (.txt file) → isTrivial=true, reason=docs-only', () => {
    const diff = makeDiff('CHANGELOG.txt', [
      '+v1.0.1 - fixed bug',
    ]);
    const result = analyzeTrivialDiff(diff, DEFAULT_CONFIG);
    expect(result.isTrivial).toBe(true);
    expect(result.reason).toBe('docs-only');
  });

  it('docs-only diff (docs/** path) → isTrivial=true, reason=docs-only', () => {
    const diff = makeDiff('docs/guide.ts', [
      '+export const x = 1;',
    ]);
    const result = analyzeTrivialDiff(diff, DEFAULT_CONFIG);
    expect(result.isTrivial).toBe(true);
    expect(result.reason).toBe('docs-only');
  });

  it('import-reorder only → isTrivial=true, reason=import-reorder', () => {
    const diff = makeDiff('src/app.ts', [
      '+import { foo } from "./foo.js"',
      '-import { bar } from "./bar.js"',
      '+import { bar } from "./bar.js"',
      '-import { foo } from "./foo.js"',
    ]);
    const result = analyzeTrivialDiff(diff, DEFAULT_CONFIG);
    expect(result.isTrivial).toBe(true);
    expect(result.reason).toBe('import-reorder');
  });

  it('mixed trivial (comments + blanks) → isTrivial=true', () => {
    const diff = makeDiff('src/app.ts', [
      '+// comment',
      '+',
      '-// old comment',
    ]);
    const result = analyzeTrivialDiff(diff, DEFAULT_CONFIG);
    expect(result.isTrivial).toBe(true);
  });

  it('mixed trivial + 1 code line → isTrivial=false', () => {
    const diff = makeDiff('src/app.ts', [
      '+// comment',
      '+const x = 1;',
      '-// old comment',
    ]);
    const result = analyzeTrivialDiff(diff, DEFAULT_CONFIG);
    expect(result.isTrivial).toBe(false);
  });

  it('maxLines boundary: 5 blank lines → trivial', () => {
    const diff = makeDiff('src/app.ts', ['+', '+', '+', '+', '+']);
    const result = analyzeTrivialDiff(diff, { ...DEFAULT_CONFIG, maxLines: 5 });
    expect(result.isTrivial).toBe(true);
  });

  it('maxLines boundary: 6 code lines → not trivial', () => {
    const lines = Array(6).fill('+const x = 1;');
    const diff = makeDiff('src/app.ts', lines);
    const result = analyzeTrivialDiff(diff, { ...DEFAULT_CONFIG, maxLines: 5 });
    expect(result.isTrivial).toBe(false);
  });

  it('stats are populated correctly', () => {
    const diff = makeDiff('src/app.ts', [
      '+// comment',
      '+',
      '+const x = 1;',
    ]);
    const result = analyzeTrivialDiff(diff, DEFAULT_CONFIG);
    expect(result.stats.commentLines).toBe(1);
    expect(result.stats.blankLines).toBe(1);
    expect(result.stats.codeLines).toBe(1);
    expect(result.stats.totalLines).toBe(3);
  });

  it('non-docs file with code line → not trivial even if other file is docs', () => {
    const docsDiff = makeDiff('README.md', ['+# heading']);
    const codeDiff = makeDiff('src/app.ts', ['+const x = 1;']);
    const combined = docsDiff + '\n' + codeDiff;
    const result = analyzeTrivialDiff(combined, DEFAULT_CONFIG);
    expect(result.isTrivial).toBe(false);
  });
});
