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
  chunkDiffWithMetadata,
  scoreDiffPriority,
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

  it('does not split on diff headers embedded in added file content', () => {
    const diff = `diff --git a/benchmarks/golden-bugs/example/diff.patch b/benchmarks/golden-bugs/example/diff.patch
new file mode 100644
--- /dev/null
+++ b/benchmarks/golden-bugs/example/diff.patch
@@ -0,0 +1,7 @@
+diff --git a/src/admin.ts b/src/admin.ts
+--- a/src/admin.ts
++++ b/src/admin.ts
+@@ -1,3 +1,2 @@
+ const user = getUser(req);
+-requireAdmin(user);
+ deleteAccount(user.id);
`;
    const files = parseDiffFiles(diff);
    expect(files).toHaveLength(1);
    expect(files[0].filePath).toBe('benchmarks/golden-bugs/example/diff.patch');
    expect(files[0].content).toContain('+diff --git a/src/admin.ts b/src/admin.ts');
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

  it('matches ignore patterns against normalized workspace-relative paths', () => {
    const result = filterIgnoredFiles(
      [
        { filePath: './src/generated.ts' },
        { filePath: 'src/app.ts' },
      ],
      ['src/generated.ts'],
    );

    expect(result.map((f) => f.filePath)).toEqual(['src/app.ts']);
  });

  it('does not include paths that normalize outside the workspace root', () => {
    const result = filterIgnoredFiles(
      [
        { filePath: 'src/app.ts' },
        { filePath: '../secrets.ts' },
        { filePath: 'src/../../secrets.ts' },
        { filePath: '/tmp/secrets.ts' },
      ],
      [],
    );

    expect(result.map((f) => f.filePath)).toEqual(['src/app.ts']);
  });

  it('does not let outside-root ignore patterns match workspace files', () => {
    const result = filterIgnoredFiles(
      [
        { filePath: 'src/app.ts' },
        { filePath: '../src/app.ts' },
      ],
      ['../**'],
    );

    expect(result.map((f) => f.filePath)).toEqual(['src/app.ts']);
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
    // Additional ecosystems
    'assets/hero.avif',
    'releases/archive.bz2',
    'pkg/runtime.wasm',
    'src/foo.pyc',
    'src/__pycache__/compiled.cpython-312.pyc',
    'dist/my_pkg-1.0-py3-none-any.whl',
    'dist/my_pkg.egg-info/PKG-INFO',
    'vendor/github.com/pkg/errors/errors.go',
    'target/debug/build/foo.o',
    'target/release/build/foo.o',
    'classes/com/example/Foo.class',
    'libs/common-1.0.jar',
    'deploy/webapp-1.0.war',
    '.bundle/config',
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

  it('excludes build and generated artifacts from review chunks while keeping source lookalikes', async () => {
    const diff = `diff --git a/dist/bundle.js b/dist/bundle.js
--- a/dist/bundle.js
+++ b/dist/bundle.js
@@ -1,2 +1,3 @@
 const bundled = true;
+const noisy = true;
diff --git a/build/client/index.js b/build/client/index.js
--- a/build/client/index.js
+++ b/build/client/index.js
@@ -1,2 +1,3 @@
 const built = true;
+const noisyBuild = true;
diff --git a/src/api/client.gen.ts b/src/api/client.gen.ts
--- a/src/api/client.gen.ts
+++ b/src/api/client.gen.ts
@@ -1,2 +1,3 @@
 export const generatedClient = {};
+export const noisyGeneratedClient = {};
diff --git a/src/generated-report.ts b/src/generated-report.ts
--- a/src/generated-report.ts
+++ b/src/generated-report.ts
@@ -1,2 +1,3 @@
 export const report = {};
+export const nextReport = {};
diff --git a/src/build-tools.ts b/src/build-tools.ts
--- a/src/build-tools.ts
+++ b/src/build-tools.ts
@@ -1,2 +1,3 @@
 export const tool = {};
+export const nextTool = {};
diff --git a/distribution/index.ts b/distribution/index.ts
--- a/distribution/index.ts
+++ b/distribution/index.ts
@@ -1,2 +1,3 @@
 export const distribution = {};
+export const nextDistribution = {};
`;
    const result = await chunkDiffWithMetadata(diff, { maxTokens: 8000 });

    expect(result.chunks).toHaveLength(1);
    expect(result.metadata.diffChunking.excludedByBuiltinPatterns).toEqual([
      'dist/bundle.js',
      'build/client/index.js',
      'src/api/client.gen.ts',
    ]);
    expect(result.metadata.includedFiles).toEqual([
      'src/generated-report.ts',
      'src/build-tools.ts',
      'distribution/index.ts',
    ]);
    expect(result.chunks[0].files).toEqual([
      'src/generated-report.ts',
      'src/build-tools.ts',
      'distribution/index.ts',
    ]);
    expect(result.chunks[0].diffContent).not.toContain('dist/bundle.js');
    expect(result.chunks[0].diffContent).not.toContain('build/client/index.js');
    expect(result.chunks[0].diffContent).not.toContain('src/api/client.gen.ts');
    expect(result.chunks[0].diffContent).toContain('src/generated-report.ts');
    expect(result.chunks[0].diffContent).toContain('src/build-tools.ts');
    expect(result.chunks[0].diffContent).toContain('distribution/index.ts');
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

  it('applies .reviewignore only to normalized workspace-relative paths', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'chunker-normalized-ignore-'));
    try {
      await writeFile(path.join(tmpDir, '.reviewignore'), 'src/generated.ts\n', 'utf-8');
      const diff = `diff --git a/./src/generated.ts b/./src/generated.ts
--- a/./src/generated.ts
+++ b/./src/generated.ts
@@ -1,2 +1,3 @@
 generated
+new
diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,3 @@
 app
+new
`;
      const result = await chunkDiffWithMetadata(diff, { cwd: tmpDir });

      expect(result.metadata.includedFiles).toEqual(['src/app.ts']);
      expect(result.metadata.diffChunking.excludedByReviewIgnorePatterns).toEqual([
        'src/generated.ts',
      ]);
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].files).toEqual(['src/app.ts']);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('excludes outside-workspace diff paths instead of letting .reviewignore match or include them', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'chunker-outside-ignore-'));
    try {
      await writeFile(path.join(tmpDir, '.reviewignore'), '../**\n', 'utf-8');
      const diff = `diff --git a/../secrets.ts b/../secrets.ts
--- a/../secrets.ts
+++ b/../secrets.ts
@@ -1,2 +1,3 @@
 secret
+new
diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,3 @@
 app
+new
`;
      const result = await chunkDiffWithMetadata(diff, { cwd: tmpDir });

      expect(result.metadata.includedFiles).toEqual(['src/app.ts']);
      expect(result.metadata.diffChunking.excludedByReviewIgnorePatterns).toEqual([]);
      expect(result.metadata.excludedFiles).toContain('../secrets.ts');
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].files).toEqual(['src/app.ts']);
      expect(result.chunks[0].files).not.toContain('../secrets.ts');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('supports context-driven ignore patterns and returns metadata', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'chunker-context-ignore-'));
    try {
      await writeFile(path.join(tmpDir, '.reviewignore'), 'docs/**\n', 'utf-8');
      const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,3 @@
 line
 new
diff --git a/src/app.spec.ts b/src/app.spec.ts
--- a/src/app.spec.ts
+++ b/src/app.spec.ts
@@ -1,2 +1,3 @@
 test
+assert
diff --git a/dist/bundle.js b/dist/bundle.js
--- a/dist/bundle.js
+++ b/dist/bundle.js
@@ -1,2 +1,3 @@
const a = 1;
+const b = 2;
diff --git a/docs/readme.md b/docs/readme.md
--- a/docs/readme.md
+++ b/docs/readme.md
@@ -1,2 +1,3 @@
doc
`;
      const result = await chunkDiffWithMetadata(diff, {
        cwd: tmpDir,
        contextIgnorePatterns: ['**/*.spec.ts'],
      });

      expect(result.chunks).toHaveLength(1);
      expect(result.metadata.includedFiles).toEqual(['src/app.ts']);
      expect(result.metadata.diffChunking.excludedByBuiltinPatterns).toContain('dist/bundle.js');
      expect(result.metadata.diffChunking.excludedByReviewIgnorePatterns).toContain('docs/readme.md');
      expect(result.metadata.diffChunking.excludedByContextIgnorePatterns).toContain('src/app.spec.ts');
      expect(result.metadata.excludedFiles).toContain('dist/bundle.js');
      expect(result.metadata.excludedFiles).toContain('docs/readme.md');
      expect(result.metadata.excludedFiles).toContain('src/app.spec.ts');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns empty chunks when context ignores cover all remaining files', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'chunker-context-empty-'));
    try {
      const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,3 @@
 line
+new`;
      const result = await chunkDiffWithMetadata(diff, {
        cwd: tmpDir,
        contextIgnorePatterns: ['src/**'],
      });
      expect(result.chunks).toHaveLength(0);
      expect(result.metadata.includedFiles).toEqual([]);
      expect(result.metadata.excludedFiles).toEqual(['src/app.ts']);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('records priority files and token budget decisions for security-sensitive diffs', async () => {
    const diff = [
      'diff --git a/src/auth/session.ts b/src/auth/session.ts',
      '--- a/src/auth/session.ts',
      '+++ b/src/auth/session.ts',
      '@@ -1,2 +1,3 @@',
      ' export function verify(token: string) {',
      '+  return token === process.env.ADMIN_TOKEN;',
      ' }',
      'diff --git a/docs/readme.md b/docs/readme.md',
      '--- a/docs/readme.md',
      '+++ b/docs/readme.md',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
    ].join('\n');

    const result = await chunkDiffWithMetadata(diff, { maxTokens: 80 });
    expect(result.metadata.diffChunking.priorityFiles).toContain('src/auth/session.ts');
    expect(result.metadata.diffChunking.tokenBudgetDecisions.some((d) => d.includes('review chunk'))).toBe(true);
    expect(result.chunks[0]?.files).toContain('src/auth/session.ts');
  });

  it('records oversized hunks instead of silently hiding token budget overflow', async () => {
    const longLine = `+${'secret token verification '.repeat(80)}`;
    const diff = [
      'diff --git a/src/auth/huge.ts b/src/auth/huge.ts',
      '--- a/src/auth/huge.ts',
      '+++ b/src/auth/huge.ts',
      '@@ -1,1 +1,2 @@',
      longLine,
    ].join('\n');

    const result = await chunkDiffWithMetadata(diff, { maxTokens: 20 });
    expect(result.metadata.diffChunking.oversizedHunks).toHaveLength(1);
    expect(result.metadata.diffChunking.oversizedHunks[0]).toMatchObject({
      filePath: 'src/auth/huge.ts',
      priority: 'security',
    });
    expect(result.metadata.diffChunking.tokenBudgetDecisions[0]).toContain('kept oversized security hunk');
  });
});

describe('scoreDiffPriority', () => {
  it('prioritizes security-sensitive paths and hunk content', () => {
    expect(scoreDiffPriority('src/auth/login.ts', '+const ok = true')).toBe('security');
    expect(scoreDiffPriority('src/ui/button.tsx', '+const token = getToken()')).toBe('security');
    expect(scoreDiffPriority('src/ui/button.tsx', '+const label = "Save"')).toBe('normal');
  });
});
