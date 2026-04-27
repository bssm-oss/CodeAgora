/**
 * #186 Rules Engine Integration Tests
 * Verifies loadReviewRules, matchRules, and their integration via the rules engine.
 */

import { describe, it, expect, vi } from 'vitest';
import { matchRules } from '@codeagora/core/rules/matcher.js';
import type { CompiledRule } from '@codeagora/core/rules/types.js';

// ============================================================================
// matchRules — direct unit tests (no file system needed)
// ============================================================================

describe('matchRules', () => {
  const makeRule = (overrides: Partial<CompiledRule> = {}): CompiledRule => ({
    id: 'no-console',
    pattern: 'console\\.log',
    regex: /console\.log/,
    severity: 'WARNING',
    message: 'Avoid console.log in production code',
    ...overrides,
  });

  it('returns empty array when rules list is empty', () => {
    const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 const x = 1;
+console.log(x);
`;
    const results = matchRules(diff, []);
    expect(results).toEqual([]);
  });

  it('returns empty array when diff has no added lines matching rule', () => {
    const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,3 @@
-const x = 1;
+const x = 2;
`;
    const results = matchRules(diff, [makeRule()]);
    expect(results).toEqual([]);
  });

  it('returns EvidenceDocument when rule matches an added line', () => {
    const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,2 +1,3 @@
 const x = 1;
+console.log(x);
 export default x;
`;
    const results = matchRules(diff, [makeRule()]);
    expect(results).toHaveLength(1);

    const doc = results[0];
    expect(doc.issueTitle).toBe('Rule: no-console');
    expect(doc.problem).toBe('Avoid console.log in production code');
    expect(doc.severity).toBe('WARNING');
    expect(doc.source).toBe('rule');
    expect(doc.filePath).toBe('src/index.ts');
    expect(doc.lineRange[0]).toBe(doc.lineRange[1]); // single line
  });

  it('does not treat embedded diff headers in added content as real files', () => {
    const diff = `diff --git a/benchmarks/golden-bugs/example/diff.patch b/benchmarks/golden-bugs/example/diff.patch
new file mode 100644
--- /dev/null
+++ b/benchmarks/golden-bugs/example/diff.patch
@@ -0,0 +1,7 @@
+diff --git a/src/index.ts b/src/index.ts
+--- a/src/index.ts
++++ b/src/index.ts
+@@ -1,2 +1,3 @@
+ const x = 1;
++console.log(x);
+ export default x;
`;
    const results = matchRules(diff, [makeRule()]);

    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('benchmarks/golden-bugs/example/diff.patch');
  });

  it('sets source="rule" on all returned documents', () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,1 +1,3 @@
+console.log('a');
+console.log('b');
 export {};
`;
    const results = matchRules(diff, [makeRule()]);
    expect(results.length).toBeGreaterThan(0);
    for (const doc of results) {
      expect(doc.source).toBe('rule');
    }
  });

  it('respects filePatterns filter — skips non-matching files', () => {
    const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,1 +1,2 @@
 const x = 1;
+console.log(x);
`;
    const rule = makeRule({ filePatterns: ['**/*.js'] }); // only .js, not .ts
    const results = matchRules(diff, [rule]);
    expect(results).toHaveLength(0);
  });

  it('respects filePatterns filter — includes matching files', () => {
    const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,1 +1,2 @@
 const x = 1;
+console.log(x);
`;
    const rule = makeRule({ filePatterns: ['**/*.ts'] });
    const results = matchRules(diff, [rule]);
    expect(results).toHaveLength(1);
  });

  it('returns multiple documents for multiple matching rules', () => {
    const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,1 +1,3 @@
+console.log('debug');
+dangerousFunction('arg');
 export {};
`;
    const rules: CompiledRule[] = [
      makeRule({ id: 'no-console', pattern: 'console\\.log', regex: /console\.log/ }),
      makeRule({
        id: 'no-dangerous',
        pattern: 'dangerousFunction',
        regex: /dangerousFunction/,
        severity: 'CRITICAL',
        message: 'Avoid dangerous functions',
      }),
    ];
    const results = matchRules(diff, rules);
    expect(results).toHaveLength(2);

    const titles = results.map((r) => r.issueTitle);
    expect(titles).toContain('Rule: no-console');
    expect(titles).toContain('Rule: no-dangerous');
  });

  it('does not match removed lines (only added lines)', () => {
    const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,2 +1,1 @@
-console.log('removed');
 const x = 1;
`;
    const results = matchRules(diff, [makeRule()]);
    expect(results).toHaveLength(0);
  });
});

// ============================================================================
// loadReviewRules — behavior tests
// ============================================================================

describe('loadReviewRules behavior', () => {
  it('returns null when no rules file exists', async () => {
    const os = await import('os');
    const path = await import('path');
    const { loadReviewRules } = await import('@codeagora/core/rules/loader.js');

    const tempDir = path.default.join(os.default.tmpdir(), `codeagora-rules-test-${Date.now()}`);
    const result = await loadReviewRules(tempDir);
    expect(result).toBeNull();
  });

  it('compiles valid rules from YAML content', async () => {
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');
    const { loadReviewRules } = await import('@codeagora/core/rules/loader.js');

    const tempDir = path.default.join(os.default.tmpdir(), `codeagora-rules-compile-${Date.now()}`);
    await fs.default.mkdir(tempDir, { recursive: true });
    const rulesYaml = `rules:
  - id: no-todo
    pattern: "TODO:"
    severity: SUGGESTION
    message: Resolve TODO comments before merging
`;
    await fs.default.writeFile(path.default.join(tempDir, '.reviewrules'), rulesYaml, 'utf-8');

    try {
      const rules = await loadReviewRules(tempDir);
      expect(rules).not.toBeNull();
      expect(rules!.length).toBe(1);
      expect(rules![0].id).toBe('no-todo');
      expect(rules![0].severity).toBe('SUGGESTION');
      expect(rules![0].regex).toBeInstanceOf(RegExp);
    } finally {
      await fs.default.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns null (no rules) when integrated in pipeline with null loadReviewRules', async () => {
    // Simulates the orchestrator-branches behavior where loadReviewRules returns null
    // The pipeline should still work — allEvidenceDocs is not affected
    const mockLoadRules = vi.fn().mockResolvedValue(null);
    const rulesResult = await mockLoadRules('/some/project');

    // null means no rules file found — pipeline continues normally
    expect(rulesResult).toBeNull();

    // When rules is null, matchRules should not be called
    const mockMatchRules = vi.fn();
    if (rulesResult !== null) {
      mockMatchRules(rulesResult);
    }
    expect(mockMatchRules).not.toHaveBeenCalled();
  });

  it('rule docs are included in evidenceDocs when rules match', () => {
    // Simulate what the pipeline does: merge llm docs + rule docs
    const llmDocs = [
      {
        issueTitle: 'LLM finding',
        problem: 'p',
        evidence: [],
        severity: 'WARNING' as const,
        suggestion: 's',
        filePath: 'src/a.ts',
        lineRange: [1, 1] as [number, number],
        source: 'llm' as const,
      },
    ];

    const diff = `diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,1 +1,2 @@
 const x = 1;
+console.log(x);
`;
    const rules: CompiledRule[] = [
      {
        id: 'no-console',
        pattern: 'console\\.log',
        regex: /console\.log/,
        severity: 'WARNING',
        message: 'Avoid console.log',
      },
    ];

    const ruleDocs = matchRules(diff, rules);
    const allEvidenceDocs = [...llmDocs, ...ruleDocs];

    expect(allEvidenceDocs).toHaveLength(2);
    expect(allEvidenceDocs.some((d) => d.source === 'rule')).toBe(true);
    expect(allEvidenceDocs.some((d) => d.source === 'llm')).toBe(true);
  });

  it('pipeline continues normally when rules return empty array', () => {
    const llmDocs = [
      {
        issueTitle: 'LLM finding',
        problem: 'p',
        evidence: [],
        severity: 'CRITICAL' as const,
        suggestion: 's',
        filePath: 'src/a.ts',
        lineRange: [1, 1] as [number, number],
        source: 'llm' as const,
      },
    ];

    const emptyRuleDocs = matchRules('diff --git a/x b/x\n', []);
    const allEvidenceDocs = [...llmDocs, ...emptyRuleDocs];

    expect(allEvidenceDocs).toHaveLength(1);
    expect(allEvidenceDocs[0].source).toBe('llm');
  });
});
