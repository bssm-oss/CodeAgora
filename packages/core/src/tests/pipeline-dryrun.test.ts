/**
 * Dry-run pipeline tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type { Config } from '../types/config.js';
import { dryRun, formatDryRunText, estimateTokensFromDiff } from '../pipeline/dryrun.js';

function makeBaseConfig(overrides: Partial<Config> = {}): Config {
  return {
    reviewers: [
      { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', enabled: true, timeout: 120 },
    { id: 'r2', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', enabled: true, timeout: 120 },
    { id: 'r3', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', enabled: false, timeout: 120 },
    { id: 'r4', auto: true, enabled: true },
    { id: 'r5', auto: true, enabled: true },
    { id: 'r6', auto: true, enabled: true },
  ] as unknown as Config['reviewers'],
    supporters: {
      pool: [{ id: 's1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', enabled: true, timeout: 120 }],
      pickCount: 1,
      pickStrategy: 'random',
      devilsAdvocate: { id: 'da', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', enabled: true, timeout: 120 },
      personaPool: ['strict'],
      personaAssignment: 'random',
    },
    moderator: { provider: 'groq', backend: 'api', model: 'llama-3.3-70b-versatile' },
    head: { provider: 'groq', backend: 'api', model: 'llama-3.3-70b-versatile', enabled: true },
    discussion: {
      enabled: true,
      maxRounds: 2,
      registrationThreshold: {
        HARSHLY_CRITICAL: 1,
        CRITICAL: 1,
        WARNING: 2,
        SUGGESTION: null,
      },
      codeSnippetRange: 10,
      objectionTimeout: 60,
      maxObjectionRounds: 1,
    },
    errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
    autoApprove: { enabled: false },
    prompts: {},
    reviewContext: { ignorePatterns: [] },
    ...overrides,
  } as Config;
}

describe('dryRun()', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'dryrun-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('reports diff metadata with config-driven context ignore patterns', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    await writeFile(path.join(tmpDir, '.reviewignore'), 'docs/**\n', 'utf-8');

    const config = makeBaseConfig({
      reviewContext: { ignorePatterns: ['**/*.spec.ts', 'temp/**'] },
    });

    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,3 @@
 line
@@ -1,2 +1,3 @@
+new
diff --git a/src/app.spec.ts b/src/app.spec.ts
--- a/src/app.spec.ts
+++ b/src/app.spec.ts
@@ -1,2 +1,3 @@
 test
diff --git a/temp/cache.ts b/temp/cache.ts
--- a/temp/cache.ts
+++ b/temp/cache.ts
@@ -1,2 +1,3 @@
 cache
diff --git a/dist/bundle.js b/dist/bundle.js
--- a/dist/bundle.js
+++ b/dist/bundle.js
@@ -1,2 +1,3 @@
 const a = 1;
diff --git a/docs/readme.md b/docs/readme.md
--- a/docs/readme.md
+++ b/docs/readme.md
@@ -1,2 +1,3 @@
 doc
`;

    const report = await dryRun(config, diff);

    expect(report.diffMetadata?.includedFiles).toEqual(['src/app.ts']);
    expect(report.diffMetadata?.diffChunking.excludedByBuiltinPatterns).toContain('dist/bundle.js');
    expect(report.diffMetadata?.diffChunking.excludedByReviewIgnorePatterns).toContain('docs/readme.md');
    expect(report.diffMetadata?.diffChunking.excludedByContextIgnorePatterns).toContain('src/app.spec.ts');
    expect(report.diffMetadata?.diffChunking.excludedByContextIgnorePatterns).toContain('temp/cache.ts');
    expect(report.config.reviewerCount).toBe(5);
  });

  it('renders dry-run text with diff filtering section', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    await writeFile(path.join(tmpDir, '.reviewignore'), 'docs/**\n', 'utf-8');

    const config = makeBaseConfig({
      reviewContext: { ignorePatterns: ['**/*.spec.ts'] },
    });

    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,3 @@
 line
diff --git a/src/app.spec.ts b/src/app.spec.ts
--- a/src/app.spec.ts
+++ b/src/app.spec.ts
@@ -1,2 +1,3 @@
 test
diff --git a/dist/bundle.js b/dist/bundle.js
--- a/dist/bundle.js
+++ b/dist/bundle.js
@@ -1,2 +1,3 @@
 const a = 1;
`;

    const report = await dryRun(config, diff);
    const text = formatDryRunText(report);

    expect(text).toContain('Diff Filtering:');
    expect(text).toContain('Included files: 1');
    expect(text).toContain('Excluded files: 2');
    expect(text).toContain('Exclusion Breakdown:');
    expect(text).toContain('Built-in artifacts');
    expect(text).toContain('reviewContext.ignorePatterns');
  });
});

describe('estimateTokensFromDiff()', () => {
  it('uses char-length heuristic', () => {
    expect(estimateTokensFromDiff('')).toBe(0);
    expect(estimateTokensFromDiff('abcd')).toBe(1);
    expect(estimateTokensFromDiff('aaaaa')).toBe(2);
  });
});
