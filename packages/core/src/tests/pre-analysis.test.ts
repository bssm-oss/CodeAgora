/**
 * Pre-Analysis Tests
 * Tests for diff classifier, path rules, and the orchestrator.
 */

import { describe, it, expect } from 'vitest';
import { classifyDiffFiles } from '../pipeline/analyzers/diff-classifier.js';
import { matchPathRules } from '../pipeline/analyzers/path-rules.js';
import { buildEnrichedSection, type EnrichedDiffContext, type FileClassification, type ImpactEntry } from '../pipeline/pre-analysis.js';

// ============================================================================
// classifyDiffFiles
// ============================================================================

describe('classifyDiffFiles', () => {
  it('should return empty map for empty diff', () => {
    expect(classifyDiffFiles('')).toEqual(new Map());
    expect(classifyDiffFiles('   ')).toEqual(new Map());
  });

  it('should classify test files by path', () => {
    const diff = `diff --git a/src/__tests__/auth.test.ts b/src/__tests__/auth.test.ts
--- a/src/__tests__/auth.test.ts
+++ b/src/__tests__/auth.test.ts
@@ -1,3 +1,3 @@
-test('old', () => {});
+test('new', () => {});`;

    const result = classifyDiffFiles(diff);
    expect(result.get('src/__tests__/auth.test.ts')).toBe('test');
  });

  it('should classify .spec files as test', () => {
    const diff = `diff --git a/src/auth.spec.ts b/src/auth.spec.ts
--- a/src/auth.spec.ts
+++ b/src/auth.spec.ts
@@ -1 +1 @@
-old
+new`;

    const result = classifyDiffFiles(diff);
    expect(result.get('src/auth.spec.ts')).toBe('test');
  });

  it('should classify docs files by extension', () => {
    const diff = `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
-old
+new`;

    const result = classifyDiffFiles(diff);
    expect(result.get('README.md')).toBe('docs');
  });

  it('should classify .txt files as docs', () => {
    const diff = `diff --git a/CHANGELOG.txt b/CHANGELOG.txt
--- a/CHANGELOG.txt
+++ b/CHANGELOG.txt
@@ -1 +1 @@
-old
+new`;

    const result = classifyDiffFiles(diff);
    expect(result.get('CHANGELOG.txt')).toBe('docs');
  });

  it('should classify config files', () => {
    const diff = `diff --git a/tsconfig.json b/tsconfig.json
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -1 +1 @@
-old
+new`;

    const result = classifyDiffFiles(diff);
    expect(result.get('tsconfig.json')).toBe('config');
  });

  it('should classify yaml/toml files as config', () => {
    const diff = `diff --git a/.github/workflows/ci.yaml b/.github/workflows/ci.yaml
--- a/.github/workflows/ci.yaml
+++ b/.github/workflows/ci.yaml
@@ -1 +1 @@
-old
+new`;

    const result = classifyDiffFiles(diff);
    expect(result.get('.github/workflows/ci.yaml')).toBe('config');
  });

  it('should classify lock files as dependency', () => {
    const diff = `diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -1 +1 @@
-old
+new`;

    const result = classifyDiffFiles(diff);
    expect(result.get('pnpm-lock.yaml')).toBe('dependency');
  });

  it('should classify package-lock.json as dependency', () => {
    const diff = `diff --git a/package-lock.json b/package-lock.json
--- a/package-lock.json
+++ b/package-lock.json
@@ -1 +1 @@
-old
+new`;

    const result = classifyDiffFiles(diff);
    expect(result.get('package-lock.json')).toBe('dependency');
  });

  it('should classify .env files as config', () => {
    const diff = `diff --git a/.env.example b/.env.example
--- a/.env.example
+++ b/.env.example
@@ -1 +1 @@
-old
+new`;

    const result = classifyDiffFiles(diff);
    expect(result.get('.env.example')).toBe('config');
  });

  it('should classify regular source files as logic', () => {
    const diff = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,5 +1,8 @@
+import { hash } from 'crypto';
+
 export function authenticate(user: string, pass: string) {
-  return user === 'admin';
+  const hashed = hash(pass);
+  return db.verify(user, hashed);
 }`;

    const result = classifyDiffFiles(diff);
    expect(result.get('src/auth.ts')).toBe('logic');
  });

  it('should classify rename-like changes', () => {
    const diff = `diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,5 +1,5 @@
-function oldName(x: number): number {
-  return oldName(x - 1) + oldName(x - 2);
-}
-export const oldHelper = oldName;
-const oldVar = oldName(5);
+function newName(x: number): number {
+  return newName(x - 1) + newName(x - 2);
+}
+export const newHelper = newName;
+const newVar = newName(5);`;

    const result = classifyDiffFiles(diff);
    expect(result.get('src/utils.ts')).toBe('rename');
  });

  it('should handle multiple files in one diff', () => {
    const diff = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,5 @@
+import { hash } from 'crypto';
 export function authenticate(user: string) {
-  return true;
+  const hashed = hash(user);
+  return db.verify(hashed);
 }
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
-old docs
+new docs
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -1 +1 @@
-old
+new`;

    const result = classifyDiffFiles(diff);
    expect(result.get('src/auth.ts')).toBe('logic');
    expect(result.get('README.md')).toBe('docs');
    expect(result.get('pnpm-lock.yaml')).toBe('dependency');
  });
});

// ============================================================================
// matchPathRules
// ============================================================================

describe('matchPathRules', () => {
  it('should return empty array when no rules', () => {
    expect(matchPathRules(['src/auth.ts'], [])).toEqual([]);
  });

  it('should return empty array when no files', () => {
    expect(
      matchPathRules([], [{ pattern: '*.ts', notes: ['check types'] }]),
    ).toEqual([]);
  });

  it('should match exact file names', () => {
    const rules = [
      { pattern: 'package.json', notes: ['check version bump'] },
    ];
    const result = matchPathRules(['package.json', 'src/index.ts'], rules);
    expect(result).toEqual(['check version bump']);
  });

  it('should match glob patterns with *', () => {
    const rules = [
      { pattern: '*.ts', notes: ['TypeScript file'] },
    ];
    const result = matchPathRules(['index.ts', 'utils.js'], rules);
    expect(result).toEqual(['TypeScript file']);
  });

  it('should match glob patterns with **', () => {
    const rules = [
      { pattern: 'src/**/*.ts', notes: ['source file'] },
    ];
    const result = matchPathRules(
      ['src/auth/login.ts', 'test/auth.ts', 'src/index.ts'],
      rules,
    );
    expect(result).toEqual(['source file']);
  });

  it('should deduplicate notes from multiple matching rules', () => {
    const rules = [
      { pattern: 'src/**/*.ts', notes: ['check types', 'run tests'] },
      { pattern: 'src/**', notes: ['check types', 'review imports'] },
    ];
    const result = matchPathRules(['src/auth.ts'], rules);
    expect(result).toContain('check types');
    expect(result).toContain('run tests');
    expect(result).toContain('review imports');
    // 'check types' should appear only once
    expect(result.filter((n) => n === 'check types')).toHaveLength(1);
  });

  it('should handle multiple files matching different rules', () => {
    const rules = [
      { pattern: '*.md', notes: ['docs change'] },
      { pattern: 'src/**', notes: ['code change'] },
    ];
    const result = matchPathRules(['README.md', 'src/index.ts'], rules);
    expect(result).toContain('docs change');
    expect(result).toContain('code change');
  });
});

// ============================================================================
// buildEnrichedSection
// ============================================================================

describe('buildEnrichedSection', () => {
  it('should return empty string when no enrichment data', () => {
    const ctx: EnrichedDiffContext = {
      fileClassifications: new Map(),
      tscDiagnostics: [],
      impactAnalysis: new Map(),
      externalRules: [],
      pathRuleNotes: [],
    };
    expect(buildEnrichedSection(ctx)).toBe('');
  });

  it('should include file classifications', () => {
    const ctx: EnrichedDiffContext = {
      fileClassifications: new Map<string, FileClassification>([
        ['src/auth.ts', 'logic'],
        ['README.md', 'docs'],
      ]),
      tscDiagnostics: [],
      impactAnalysis: new Map(),
      externalRules: [],
      pathRuleNotes: [],
    };
    const result = buildEnrichedSection(ctx);
    expect(result).toContain('[LOGIC] src/auth.ts');
    expect(result).toContain('[DOCS] README.md');
  });

  it('should include TypeScript diagnostics', () => {
    const ctx: EnrichedDiffContext = {
      fileClassifications: new Map(),
      tscDiagnostics: [
        { file: 'src/auth.ts', line: 42, code: 2345, message: 'Argument of type...' },
      ],
      impactAnalysis: new Map(),
      externalRules: [],
      pathRuleNotes: [],
    };
    const result = buildEnrichedSection(ctx);
    expect(result).toContain('TypeScript Diagnostics');
    expect(result).toContain('src/auth.ts:42');
    expect(result).toContain('TS2345');
  });

  it('should include impact analysis with severity levels', () => {
    const ctx: EnrichedDiffContext = {
      fileClassifications: new Map(),
      tscDiagnostics: [],
      impactAnalysis: new Map<string, ImpactEntry>([
        ['validatePath', { symbol: 'validatePath', callerCount: 12, importers: [] }],
        ['helperFn', { symbol: 'helperFn', callerCount: 3, importers: [] }],
      ]),
      externalRules: [],
      pathRuleNotes: [],
    };
    const result = buildEnrichedSection(ctx);
    expect(result).toContain('Change Impact');
    expect(result).toContain('validatePath() — 12 importers (HIGH)');
    expect(result).toContain('helperFn() — 3 importers (LOW)');
  });

  it('should include external rules', () => {
    const ctx: EnrichedDiffContext = {
      fileClassifications: new Map(),
      tscDiagnostics: [],
      impactAnalysis: new Map(),
      externalRules: ['[.cursorrules] Always use strict mode'],
      pathRuleNotes: [],
    };
    const result = buildEnrichedSection(ctx);
    expect(result).toContain('Project Rules');
    expect(result).toContain('[.cursorrules] Always use strict mode');
  });

  it('should include path rule notes', () => {
    const ctx: EnrichedDiffContext = {
      fileClassifications: new Map(),
      tscDiagnostics: [],
      impactAnalysis: new Map(),
      externalRules: [],
      pathRuleNotes: ['Check migration compatibility', 'Verify backward compat'],
    };
    const result = buildEnrichedSection(ctx);
    expect(result).toContain('Path-Specific Review Notes');
    expect(result).toContain('Check migration compatibility');
    expect(result).toContain('Verify backward compat');
  });

  it('should combine all sections', () => {
    const ctx: EnrichedDiffContext = {
      fileClassifications: new Map<string, FileClassification>([['src/a.ts', 'logic']]),
      tscDiagnostics: [{ file: 'src/a.ts', line: 1, code: 1234, message: 'err' }],
      impactAnalysis: new Map<string, ImpactEntry>([
        ['foo', { symbol: 'foo', callerCount: 5, importers: [] }],
      ]),
      externalRules: ['[CLAUDE.md] rule1'],
      pathRuleNotes: ['note1'],
    };
    const result = buildEnrichedSection(ctx);
    expect(result).toContain('File Classifications');
    expect(result).toContain('TypeScript Diagnostics');
    expect(result).toContain('Change Impact');
    expect(result).toContain('Project Rules');
    expect(result).toContain('Path-Specific Review Notes');
  });
});

// ============================================================================
// analyzeBeforeReview (integration — graceful degradation)
// ============================================================================

describe('analyzeBeforeReview', () => {
  it('should return enriched context with graceful degradation', async () => {
    // Use dynamic import to allow mocking
    const { analyzeBeforeReview } = await import('../pipeline/pre-analysis.js');

    // Run with a non-existent repo path — all async analyzers should fail gracefully
    const diff = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,5 @@
+import { hash } from 'crypto';
 export function authenticate(user: string) {
-  return true;
+  const hashed = hash(user);
+  return db.verify(hashed);
 }`;

    const config = {
      reviewers: [],
      supporters: { pool: [], pickCount: 2, pickStrategy: 'random' as const, devilsAdvocate: { id: 'da', model: 'm', backend: 'api' as const, provider: 'p', timeout: 60, enabled: true }, personaPool: ['p'], personaAssignment: 'random' as const },
      moderator: { backend: 'api' as const, model: 'm', timeout: 60 },
      discussion: { enabled: true, maxRounds: 3, registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null }, codeSnippetRange: 10, objectionTimeout: 60, maxObjectionRounds: 1 },
      errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
    };

    const result = await analyzeBeforeReview(
      '/non-existent-repo-path-xyz',
      diff,
      config as any,
      ['src/auth.ts'],
    );

    // Diff classifier should still work (sync, no I/O)
    expect(result.fileClassifications.get('src/auth.ts')).toBe('logic');

    // Async analyzers should return empty defaults on failure
    expect(result.tscDiagnostics).toEqual([]);
    expect(result.impactAnalysis.size).toBe(0);
    expect(result.externalRules).toEqual([]);
    expect(result.pathRuleNotes).toEqual([]);
  });

  it('should apply path rules from config', async () => {
    const { analyzeBeforeReview } = await import('../pipeline/pre-analysis.js');

    const diff = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,5 @@
+import { hash } from 'crypto';
 export function authenticate(user: string) {
-  return true;
+  const hashed = hash(user);
+  return db.verify(hashed);
 }`;

    const config = {
      reviewers: [],
      supporters: { pool: [], pickCount: 2, pickStrategy: 'random' as const, devilsAdvocate: { id: 'da', model: 'm', backend: 'api' as const, provider: 'p', timeout: 60, enabled: true }, personaPool: ['p'], personaAssignment: 'random' as const },
      moderator: { backend: 'api' as const, model: 'm', timeout: 60 },
      discussion: { enabled: true, maxRounds: 3, registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null }, codeSnippetRange: 10, objectionTimeout: 60, maxObjectionRounds: 1 },
      errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
      reviewContext: {
        pathRules: [
          { pattern: 'src/**', notes: ['Check auth logic'] },
        ],
      },
    };

    const result = await analyzeBeforeReview(
      '/non-existent-repo-path-xyz',
      diff,
      config as any,
      ['src/auth.ts'],
    );

    expect(result.pathRuleNotes).toContain('Check auth logic');
  });
});
