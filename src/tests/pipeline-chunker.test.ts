/**
 * Pipeline Chunker Tests
 * Covers: estimateTokens, parseDiffFiles, splitLargeFile, chunkDiffFiles,
 *         chunkDiff, filterIgnoredFiles, mergeReviewOutputsByReviewer
 */

import { describe, it, expect, vi } from 'vitest';
import {
  estimateTokens,
  parseDiffFiles,
  splitLargeFile,
  chunkDiffFiles,
  chunkDiff,
  filterIgnoredFiles,
} from '@codeagora/core/pipeline/chunker.js';
import { mergeReviewOutputsByReviewer } from '@codeagora/core/pipeline/orchestrator.js';
import type { ReviewOutput, EvidenceDocument } from '@codeagora/core/types/core.js';

// ============================================================================
// Helpers
// ============================================================================

function makeDiffSection(
  filePath: string,
  linesPerHunk: number = 5,
  hunkCount: number = 1
): string {
  let section = `diff --git a/${filePath} b/${filePath}\nindex abc1234..def5678 100644\n--- a/${filePath}\n+++ b/${filePath}\n`;

  for (let h = 0; h < hunkCount; h++) {
    const start = h * linesPerHunk + 1;
    section += `@@ -${start},${linesPerHunk} +${start},${linesPerHunk} @@\n`;
    for (let j = 0; j < linesPerHunk; j++) {
      section += `-const old${start + j} = ${start + j};\n+const new${start + j} = ${start + j + 1};\n`;
    }
  }

  return section;
}

function generateLargeDiff(fileCount: number, linesPerFile: number): string {
  let diff = '';
  for (let i = 0; i < fileCount; i++) {
    const path = `src/module${Math.floor(i / 10)}/file${i}.ts`;
    diff += `diff --git a/${path} b/${path}\nindex abc1234..def5678 100644\n--- a/${path}\n+++ b/${path}\n`;
    diff += `@@ -1,${linesPerFile} +1,${linesPerFile} @@\n`;
    for (let j = 0; j < linesPerFile; j++) {
      diff += `-const old${j} = ${j};\n+const new${j} = ${j + 1};\n`;
    }
  }
  return diff;
}

function makeReviewOutput(overrides: Partial<ReviewOutput> = {}): ReviewOutput {
  return {
    reviewerId: 'reviewer-1',
    model: 'gpt-4o',
    group: 'src',
    evidenceDocs: [],
    rawResponse: '',
    status: 'success',
    ...overrides,
  };
}

const sampleEvidence: EvidenceDocument = {
  issueTitle: 'Test Issue',
  problem: 'Test problem',
  evidence: ['evidence 1'],
  severity: 'WARNING',
  suggestion: 'Fix it',
  filePath: 'src/test.ts',
  lineRange: [1, 5],
};

// ============================================================================
// Mock .reviewignore (prevent fs reads during unit tests)
// ============================================================================

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const mockReadFileSync = vi.fn().mockImplementation((...args: unknown[]) => {
    const p = args[0];
    if (typeof p === 'string' && p.endsWith('.reviewignore')) {
      throw new Error('ENOENT');
    }
    return actual.readFileSync(p as string, args[1] as BufferEncoding);
  });
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: mockReadFileSync,
    },
    readFileSync: mockReadFileSync,
  };
});

// ============================================================================
// estimateTokens
// ============================================================================

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 250 for 1000 chars', () => {
    expect(estimateTokens('a'.repeat(1000))).toBe(250);
  });

  it('rounds up for non-divisible lengths', () => {
    expect(estimateTokens('abc')).toBe(1); // ceil(3/4) = 1
  });

  it('returns 1 for a single character', () => {
    expect(estimateTokens('x')).toBe(1);
  });
});

// ============================================================================
// parseDiffFiles
// ============================================================================

describe('parseDiffFiles', () => {
  it('returns empty array for empty diff', () => {
    expect(parseDiffFiles('')).toEqual([]);
  });

  it('returns empty array for non-diff text', () => {
    expect(parseDiffFiles('just some random text')).toEqual([]);
  });

  it('parses a single file diff', () => {
    const diff = makeDiffSection('src/auth.ts');
    const files = parseDiffFiles(diff);

    expect(files).toHaveLength(1);
    expect(files[0].filePath).toBe('src/auth.ts');
    expect(files[0].content).toContain('diff --git a/src/auth.ts b/src/auth.ts');
    expect(files[0].hunks).toHaveLength(1);
  });

  it('parses 3 files correctly', () => {
    const diff =
      makeDiffSection('src/auth.ts') +
      makeDiffSection('src/user.ts') +
      makeDiffSection('tests/auth.test.ts');
    const files = parseDiffFiles(diff);

    expect(files).toHaveLength(3);
    expect(files.map((f) => f.filePath)).toEqual([
      'src/auth.ts',
      'src/user.ts',
      'tests/auth.test.ts',
    ]);
  });

  it('preserves diff --git header in content', () => {
    const diff = makeDiffSection('src/index.ts');
    const files = parseDiffFiles(diff);

    expect(files[0].content).toContain('diff --git a/src/index.ts b/src/index.ts');
    expect(files[0].content).toContain('--- a/src/index.ts');
    expect(files[0].content).toContain('+++ b/src/index.ts');
  });

  it('extracts multiple hunks from a single file', () => {
    const diff = makeDiffSection('src/auth.ts', 3, 3);
    const files = parseDiffFiles(diff);

    expect(files).toHaveLength(1);
    expect(files[0].hunks).toHaveLength(3);
  });
});

// ============================================================================
// splitLargeFile
// ============================================================================

describe('splitLargeFile', () => {
  it('returns file as-is when within budget', () => {
    const diff = makeDiffSection('src/small.ts', 3);
    const files = parseDiffFiles(diff);
    const result = splitLargeFile(files[0], 8000);

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/small.ts');
    expect(result[0].content).toBe(files[0].content);
  });

  it('splits file by hunk boundaries when over budget', () => {
    // Create a file with many hunks that exceeds budget
    const diff = makeDiffSection('src/large.ts', 50, 10);
    const files = parseDiffFiles(diff);
    const totalTokens = estimateTokens(files[0].content);

    // Use a small budget to force splitting
    const budget = Math.floor(totalTokens / 3);
    const result = splitLargeFile(files[0], budget);

    expect(result.length).toBeGreaterThan(1);

    // Each split must preserve headers
    for (const part of result) {
      expect(part.filePath).toBe('src/large.ts');
      expect(part.content).toContain('diff --git a/src/large.ts b/src/large.ts');
      expect(part.content).toContain('--- a/src/large.ts');
      expect(part.content).toContain('+++ b/src/large.ts');
    }
  });

  it('returns single hunk file as-is even if over budget', () => {
    const diff = makeDiffSection('src/huge.ts', 500, 1);
    const files = parseDiffFiles(diff);
    const result = splitLargeFile(files[0], 100); // Very small budget

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/huge.ts');
  });
});

// ============================================================================
// chunkDiffFiles
// ============================================================================

describe('chunkDiffFiles', () => {
  it('returns empty array for empty input', () => {
    expect(chunkDiffFiles([], 8000)).toEqual([]);
  });

  it('groups small files into a single chunk', () => {
    const files = [
      { filePath: 'src/a.ts', content: 'a'.repeat(100) },
      { filePath: 'src/b.ts', content: 'b'.repeat(100) },
    ];
    const chunks = chunkDiffFiles(files, 8000);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].files).toContain('src/a.ts');
    expect(chunks[0].files).toContain('src/b.ts');
  });

  it('creates multiple chunks when files exceed budget', () => {
    const files = [
      { filePath: 'src/a.ts', content: 'a'.repeat(20000) },
      { filePath: 'src/b.ts', content: 'b'.repeat(20000) },
      { filePath: 'src/c.ts', content: 'c'.repeat(20000) },
    ];
    const chunks = chunkDiffFiles(files, 8000);

    expect(chunks.length).toBeGreaterThan(1);
    // Each file should be in exactly one chunk
    const allFiles = chunks.flatMap((c) => c.files);
    expect(allFiles).toContain('src/a.ts');
    expect(allFiles).toContain('src/b.ts');
    expect(allFiles).toContain('src/c.ts');
  });

  it('groups same-directory files together', () => {
    const files = [
      { filePath: 'src/a.ts', content: 'a'.repeat(100) },
      { filePath: 'src/b.ts', content: 'b'.repeat(100) },
      { filePath: 'tests/a.test.ts', content: 'c'.repeat(100) },
    ];
    const chunks = chunkDiffFiles(files, 8000);

    // With small files, everything may fit in one chunk
    // But directory grouping is attempted
    const allFiles = chunks.flatMap((c) => c.files);
    expect(allFiles).toHaveLength(3);
  });

  it('merges small chunks with adjacent', () => {
    // Create files from different dirs, each very small
    const files = [
      { filePath: 'src/a.ts', content: 'a'.repeat(40) },
      { filePath: 'tests/b.ts', content: 'b'.repeat(40) },
      { filePath: 'docs/c.ts', content: 'c'.repeat(40) },
    ];
    const chunks = chunkDiffFiles(files, 8000);

    // Small chunks should be merged (each is < 30% of 8000)
    expect(chunks).toHaveLength(1);
  });

  it('assigns sequential indices to chunks', () => {
    const files = [
      { filePath: 'src/a.ts', content: 'a'.repeat(20000) },
      { filePath: 'src/b.ts', content: 'b'.repeat(20000) },
    ];
    const chunks = chunkDiffFiles(files, 8000);

    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
  });
});

// ============================================================================
// chunkDiff (integration)
// ============================================================================

describe('chunkDiff', () => {
  it('returns empty array for empty diff', async () => {
    expect(await chunkDiff('', { maxTokens: 8000 })).toEqual([]);
  });

  it('returns empty array for whitespace-only diff', async () => {
    expect(await chunkDiff('   \n\n  ', { maxTokens: 8000 })).toEqual([]);
  });

  it('returns single chunk for small diff', async () => {
    const diff = makeDiffSection('src/auth.ts', 5);
    const chunks = await chunkDiff(diff, { maxTokens: 8000 });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].files).toContain('src/auth.ts');
    expect(chunks[0].estimatedTokens).toBeLessThanOrEqual(8000);
  });

  it('splits large diff into multiple chunks within budget', async () => {
    const diff = generateLargeDiff(100, 20);
    const chunks = await chunkDiff(diff, { maxTokens: 8000 });

    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      expect(chunk.estimatedTokens).toBeLessThanOrEqual(8000);
    }
  });

  it('preserves all file paths across chunks', async () => {
    const diff = generateLargeDiff(30, 20);
    const chunks = await chunkDiff(diff, { maxTokens: 8000 });

    const allFiles = chunks.flatMap((c) => c.files);
    // All 30 files should be represented
    expect(allFiles.length).toBeGreaterThanOrEqual(30);
  });

  it('each chunk has non-empty diffContent', async () => {
    const diff = generateLargeDiff(20, 10);
    const chunks = await chunkDiff(diff, { maxTokens: 8000 });

    for (const chunk of chunks) {
      expect(chunk.diffContent.length).toBeGreaterThan(0);
    }
  });

  it('uses default maxTokens of 8000 when options omitted', async () => {
    const diff = generateLargeDiff(100, 20);
    const chunks = await chunkDiff(diff);

    for (const chunk of chunks) {
      expect(chunk.estimatedTokens).toBeLessThanOrEqual(8000);
    }
  });
});

// ============================================================================
// filterIgnoredFiles
// ============================================================================

describe('filterIgnoredFiles', () => {
  it('returns all files when patterns is empty', () => {
    const files = [
      { filePath: 'src/auth.ts', content: '' },
      { filePath: 'tests/auth.test.ts', content: '' },
    ];
    expect(filterIgnoredFiles(files, [])).toEqual(files);
  });

  it('filters files matching exact pattern', () => {
    const files = [
      { filePath: 'src/auth.ts', content: '' },
      { filePath: 'dist/index.js', content: '' },
    ];
    const result = filterIgnoredFiles(files, ['dist/index.js']);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/auth.ts');
  });

  it('filters files matching glob pattern with *', () => {
    const files = [
      { filePath: 'src/auth.ts', content: '' },
      { filePath: 'src/auth.test.ts', content: '' },
      { filePath: 'src/user.ts', content: '' },
    ];
    const result = filterIgnoredFiles(files, ['*.test.ts']);
    // *.test.ts matches files without / in the name, so src/auth.test.ts won't match
    // because * doesn't match /
    expect(result).toHaveLength(3);
  });

  it('filters files matching ** glob pattern', () => {
    const files = [
      { filePath: 'src/auth.ts', content: '' },
      { filePath: 'dist/index.js', content: '' },
      { filePath: 'dist/utils/helper.js', content: '' },
    ];
    const result = filterIgnoredFiles(files, ['dist/**']);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/auth.ts');
  });

  it('filters with **/ prefix for deep matches', () => {
    const files = [
      { filePath: 'src/auth.ts', content: '' },
      { filePath: 'src/utils/auth.test.ts', content: '' },
      { filePath: 'tests/auth.test.ts', content: '' },
    ];
    const result = filterIgnoredFiles(files, ['**/*.test.ts']);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/auth.ts');
  });

  it('ignores comment lines in patterns', () => {
    const files = [
      { filePath: 'src/auth.ts', content: '' },
      { filePath: 'dist/index.js', content: '' },
    ];
    const result = filterIgnoredFiles(files, ['# This is a comment', 'dist/**']);
    expect(result).toHaveLength(1);
  });

  it('returns all files when no patterns match', () => {
    const files = [
      { filePath: 'src/auth.ts', content: '' },
      { filePath: 'src/user.ts', content: '' },
    ];
    const result = filterIgnoredFiles(files, ['dist/**', '*.log']);
    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// globToRegex metacharacter safety (via filterIgnoredFiles)
// ============================================================================

describe('filterIgnoredFiles — globToRegex metacharacter safety', () => {
  it('pattern with parentheses does not throw and matches literally', () => {
    const files = [
      { filePath: 'src/(foo)/index.ts', content: '' },
      { filePath: 'src/bar/index.ts', content: '' },
    ];
    expect(() => filterIgnoredFiles(files, ['src/(foo)/index.ts'])).not.toThrow();
    const result = filterIgnoredFiles(files, ['src/(foo)/index.ts']);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/bar/index.ts');
  });

  it('pattern with brackets does not throw', () => {
    const files = [
      { filePath: 'src/[bar]/index.ts', content: '' },
      { filePath: 'src/baz/index.ts', content: '' },
    ];
    expect(() => filterIgnoredFiles(files, ['src/[bar]/index.ts'])).not.toThrow();
    const result = filterIgnoredFiles(files, ['src/[bar]/index.ts']);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/baz/index.ts');
  });

  it('pattern with + in path does not throw and matches correctly', () => {
    const files = [
      { filePath: 'src/c++/main.ts', content: '' },
      { filePath: 'src/other/main.ts', content: '' },
    ];
    expect(() => filterIgnoredFiles(files, ['src/c++/main.ts'])).not.toThrow();
    const result = filterIgnoredFiles(files, ['src/c++/main.ts']);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/other/main.ts');
  });
});

// ============================================================================
// mergeReviewOutputsByReviewer
// ============================================================================

describe('mergeReviewOutputsByReviewer', () => {
  it('passes through single reviewer unchanged', () => {
    const results = [makeReviewOutput({ reviewerId: 'r1', evidenceDocs: [sampleEvidence] })];
    const merged = mergeReviewOutputsByReviewer(results);

    expect(merged).toHaveLength(1);
    expect(merged[0].reviewerId).toBe('r1');
    expect(merged[0].evidenceDocs).toHaveLength(1);
  });

  it('merges evidenceDocs for same reviewer across chunks', () => {
    const ev1: EvidenceDocument = { ...sampleEvidence, issueTitle: 'Issue 1' };
    const ev2: EvidenceDocument = { ...sampleEvidence, issueTitle: 'Issue 2' };

    const results = [
      makeReviewOutput({ reviewerId: 'r1', evidenceDocs: [ev1], chunkIndex: 0 }),
      makeReviewOutput({ reviewerId: 'r1', evidenceDocs: [ev2], chunkIndex: 1 }),
    ];
    const merged = mergeReviewOutputsByReviewer(results);

    expect(merged).toHaveLength(1);
    expect(merged[0].reviewerId).toBe('r1');
    expect(merged[0].evidenceDocs).toHaveLength(2);
    expect(merged[0].evidenceDocs[0].issueTitle).toBe('Issue 1');
    expect(merged[0].evidenceDocs[1].issueTitle).toBe('Issue 2');
  });

  it('keeps separate entries for different reviewers', () => {
    const results = [
      makeReviewOutput({ reviewerId: 'r1' }),
      makeReviewOutput({ reviewerId: 'r2' }),
    ];
    const merged = mergeReviewOutputsByReviewer(results);

    expect(merged).toHaveLength(2);
  });

  it('marks merged result as success if any chunk succeeded', () => {
    const results = [
      makeReviewOutput({ reviewerId: 'r1', status: 'forfeit', chunkIndex: 0 }),
      makeReviewOutput({ reviewerId: 'r1', status: 'success', chunkIndex: 1 }),
    ];
    const merged = mergeReviewOutputsByReviewer(results);

    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('success');
  });

  it('returns empty array for empty input', () => {
    expect(mergeReviewOutputsByReviewer([])).toEqual([]);
  });
});
