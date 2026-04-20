/**
 * Pipeline Chunker — splitLargeFile boundaries, loadReviewIgnorePatterns when file absent
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import {
  estimateTokens,
  parseDiffFiles,
  splitLargeFile,
  filterIgnoredFiles,
  loadReviewIgnorePatterns,
  chunkDiff,
  REVIEW_IGNORE_MAX_BYTES,
  BUILT_IN_ARTIFACT_PATTERNS,
} from '../pipeline/chunker.js';

// ============================================================================
// estimateTokens
// ============================================================================

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('uses ceil(len/4) heuristic', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });
});

// ============================================================================
// parseDiffFiles
// ============================================================================

describe('parseDiffFiles', () => {
  it('returns empty array for empty diff', () => {
    expect(parseDiffFiles('')).toHaveLength(0);
    expect(parseDiffFiles('   ')).toHaveLength(0);
  });

  it('parses a single-file diff correctly', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 line1
+line2
 line3
`;
    const files = parseDiffFiles(diff);
    expect(files).toHaveLength(1);
    expect(files[0].filePath).toBe('src/foo.ts');
    expect(files[0].hunks).toHaveLength(1);
  });

  it('parses a two-file diff correctly', () => {
    const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 a
+aa
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,2 +1,3 @@
 b
+bb
`;
    const files = parseDiffFiles(diff);
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.filePath)).toEqual(['src/a.ts', 'src/b.ts']);
  });
});

// ============================================================================
// splitLargeFile
// ============================================================================

describe('splitLargeFile', () => {
  it('returns the file as-is when it fits within maxTokens', () => {
    const small = 'x'.repeat(100); // 25 tokens
    const file = { filePath: 'src/foo.ts', content: small, hunks: [] };
    const result = splitLargeFile(file, 1000);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(small);
  });

  it('returns file as-is when it has only one hunk (cannot split further)', () => {
    // Build content that exceeds maxTokens but has only 1 hunk
    const header = `diff --git a/big.ts b/big.ts\n--- a/big.ts\n+++ b/big.ts\n`;
    const hunk = `@@ -1,5 +1,5 @@\n` + '+x\n'.repeat(200); // 200 * 3 = 600 chars → 150 tokens
    const content = header + hunk;
    const file = { filePath: 'big.ts', content, hunks: [hunk] };

    const result = splitLargeFile(file, 10); // maxTokens very small
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('big.ts');
  });

  it('splits a file with multiple hunks that exceed maxTokens', () => {
    const header = `diff --git a/big.ts b/big.ts\n--- a/big.ts\n+++ b/big.ts\n`;
    // Each hunk is 40 chars → 10 tokens; maxTokens = 12 so at most 1 hunk per split
    const hunk1 = `@@ -1,2 +1,2 @@\n` + '+a\n'.repeat(8); // ~40 chars
    const hunk2 = `@@ -10,2 +10,2 @@\n` + '+b\n'.repeat(8);
    const hunk3 = `@@ -20,2 +20,2 @@\n` + '+c\n'.repeat(8);

    const content = header + hunk1 + hunk2 + hunk3;
    const file = { filePath: 'big.ts', content, hunks: [hunk1, hunk2, hunk3] };

    // Small maxTokens forces each hunk into its own split
    const result = splitLargeFile(file, 12);
    expect(result.length).toBeGreaterThan(1);
    // Every split preserves the header
    for (const r of result) {
      expect(r.content).toContain('diff --git');
      expect(r.filePath).toBe('big.ts');
    }
  });
});

// ============================================================================
// filterIgnoredFiles
// ============================================================================

describe('filterIgnoredFiles', () => {
  const files = [
    { filePath: 'src/foo.ts' },
    { filePath: 'dist/bundle.js' },
    { filePath: 'node_modules/pkg/index.js' },
    { filePath: 'src/bar.test.ts' },
  ];

  it('returns all files when patterns array is empty', () => {
    expect(filterIgnoredFiles(files, [])).toHaveLength(4);
  });

  it('filters files matching a simple glob pattern', () => {
    const result = filterIgnoredFiles(files, ['dist/*.js']);
    expect(result.some((f) => f.filePath === 'dist/bundle.js')).toBe(false);
    expect(result).toHaveLength(3);
  });

  it('filters files matching ** glob', () => {
    const result = filterIgnoredFiles(files, ['node_modules/**']);
    expect(result.some((f) => f.filePath.startsWith('node_modules'))).toBe(false);
  });

  it('ignores comment lines in patterns', () => {
    const result = filterIgnoredFiles(files, ['# this is a comment', 'dist/*.js']);
    expect(result).toHaveLength(3);
  });

  it('filters test files with *.test.ts', () => {
    const result = filterIgnoredFiles(files, ['**/*.test.ts']);
    expect(result.some((f) => f.filePath.endsWith('.test.ts'))).toBe(false);
  });
});

// ============================================================================
// BUILT_IN_ARTIFACT_PATTERNS (#482)
// ============================================================================

describe('BUILT_IN_ARTIFACT_PATTERNS', () => {
  // Each entry is a filePath that MUST be filtered out by the built-in
  // pattern list. Failure of any of these is a regression in the default
  // exclusion set.
  const SHOULD_BE_FILTERED: string[] = [
    // Build outputs
    'dist/bundle.js',
    'build/index.html',
    'out/chunk.abc.js',
    '.next/server/pages/index.js',
    '.nuxt/client.js',
    '.svelte-kit/output/client/app.js',
    '.turbo/cache/abc.log',
    '.docusaurus/registry.js',
    'storybook-static/iframe.html',
    'coverage/lcov.info',
    'node_modules/react/index.js',
    // Minified / bundled
    'assets/vendor.min.js',
    'assets/styles.min.css',
    'assets/app.bundle.js',
    'assets/app.bundle.mjs',
    // Source maps
    'src/app.js.map',
    'src/app.css.map',
    'src/types.d.ts.map',
    // Generated code
    'proto/messages.pb.go',
    'proto/messages.pb.ts',
    'proto/messages.pb.py',
    'gen/service_pb.js',
    'gen/service.gen.ts',
    'gen/handlers_generated.go',
    // Lock files (JS ecosystem)
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'bun.lockb',
    'bun.lock',
    // Lock files (other ecosystems)
    'Cargo.lock',
    'poetry.lock',
    'Pipfile.lock',
    'uv.lock',
    'composer.lock',
    'Gemfile.lock',
    'go.sum',
    'mix.lock',
    'flake.lock',
    // Binary assets
    'assets/logo.png',
    'assets/hero.jpg',
    'assets/icon.svg.ignored-ext-so-skip', // placeholder to keep list intact
    'docs/diagram.webp',
    'public/favicon.ico',
    'assets/font.woff2',
    'assets/font.ttf',
    'assets/demo.mp4',
    'docs/spec.pdf',
    'releases/build.zip',
    'releases/build.tar.gz',
    // Test snapshots
    'src/__snapshots__/foo.test.ts.snap',
    'components/__snapshots__/Button.test.tsx.snap',
    'src/foo.snap',
  ].filter((p) => !p.endsWith('.ignored-ext-so-skip'));

  // Files that MUST survive the built-in filter — real source code that
  // shares prefixes with filtered directories.
  const SHOULD_SURVIVE: string[] = [
    'src/foo.ts',
    'packages/core/src/pipeline/chunker.ts',
    'distribution/index.ts',          // starts with "dist" but not dist/
    'src/build-helpers.ts',           // has "build" in the name, not a dir
    'src/node_modules_adapter.ts',    // substring match false positive guard
    'scripts/postinstall.cjs',
    'tests/fixtures/sample.snapshot.json', // .snapshot, not .snap
  ];

  for (const p of SHOULD_BE_FILTERED) {
    it(`filters ${p}`, () => {
      const result = filterIgnoredFiles([{ filePath: p }], BUILT_IN_ARTIFACT_PATTERNS);
      expect(result).toHaveLength(0);
    });
  }

  for (const p of SHOULD_SURVIVE) {
    it(`keeps source-code path ${p}`, () => {
      const result = filterIgnoredFiles([{ filePath: p }], BUILT_IN_ARTIFACT_PATTERNS);
      expect(result).toHaveLength(1);
    });
  }
});

// ============================================================================
// loadReviewIgnorePatterns
// ============================================================================

describe('loadReviewIgnorePatterns', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'chunker-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when .reviewignore does not exist', async () => {
    const patterns = await loadReviewIgnorePatterns(tmpDir);
    expect(patterns).toEqual([]);
  });

  it('reads and parses patterns from .reviewignore', async () => {
    await writeFile(
      path.join(tmpDir, '.reviewignore'),
      '# comment\ndist/**\n*.test.ts\n',
      'utf-8',
    );
    const patterns = await loadReviewIgnorePatterns(tmpDir);
    expect(patterns).toEqual(['dist/**', '*.test.ts']);
  });

  it('ignores blank lines', async () => {
    await writeFile(
      path.join(tmpDir, '.reviewignore'),
      'dist/**\n\n   \n*.js\n',
      'utf-8',
    );
    const patterns = await loadReviewIgnorePatterns(tmpDir);
    expect(patterns).toEqual(['dist/**', '*.js']);
  });

  it('returns empty array and warns when file exceeds size limit', async () => {
    const oversized = 'a'.repeat(REVIEW_IGNORE_MAX_BYTES + 1);
    await writeFile(path.join(tmpDir, '.reviewignore'), oversized, 'utf-8');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const patterns = await loadReviewIgnorePatterns(tmpDir);

    expect(patterns).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('.reviewignore exceeds size limit'),
    );
    warnSpy.mockRestore();
  });

  it('reads file normally when exactly at size limit', async () => {
    // Create a file of exactly REVIEW_IGNORE_MAX_BYTES bytes
    const line = 'dist/**\n';
    const fullLines = line.repeat(Math.floor(REVIEW_IGNORE_MAX_BYTES / Buffer.byteLength(line, 'utf-8')));
    const padding = 'x'.repeat(REVIEW_IGNORE_MAX_BYTES - Buffer.byteLength(fullLines, 'utf-8'));
    const content = fullLines + padding;
    expect(Buffer.byteLength(content, 'utf-8')).toBe(REVIEW_IGNORE_MAX_BYTES);

    await writeFile(path.join(tmpDir, '.reviewignore'), content, 'utf-8');
    const patterns = await loadReviewIgnorePatterns(tmpDir);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns).toContain('dist/**');
  });
});

// ============================================================================
// chunkDiff integration
// ============================================================================

describe('chunkDiff', () => {
  it('returns empty array for empty diff', async () => {
    expect(await chunkDiff('')).toEqual([]);
    expect(await chunkDiff('   ')).toEqual([]);
  });

  it('returns a single chunk when diff fits within budget', async () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 line1
+line2
`;
    const chunks = await chunkDiff(diff, { maxTokens: 8000 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].files).toContain('src/foo.ts');
  });

  it('returns empty when all files are ignored by .reviewignore', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'chunker-ignore-'));
    try {
      await writeFile(path.join(tmpDir, '.reviewignore'), 'src/**\n', 'utf-8');
      const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,2 +1,3 @@
 a
+b
`;
      const chunks = await chunkDiff(diff, { cwd: tmpDir });
      expect(chunks).toEqual([]);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
