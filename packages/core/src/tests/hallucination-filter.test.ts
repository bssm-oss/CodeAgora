import { describe, it, expect } from 'vitest';
import { filterHallucinations, detectSelfContradiction, deduplicateEvidence } from '../pipeline/hallucination-filter.js';
import type { EvidenceDocument } from '../types/core.js';

// Minimal diff for testing
const SAMPLE_DIFF = `diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -10,7 +10,8 @@ export function helper() {
   const a = 1;
-  const b = 2;
+  const b = computeValue();
+  const c = 3;
   return a + b;
 }
diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,6 @@
 import { helper } from './utils.js';
+import { newModule } from './new-module.js';

 export function main() {
   return helper();
`;

function makeDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'Test Issue',
    problem: 'Some problem description',
    evidence: ['evidence line'],
    severity: 'WARNING',
    suggestion: 'Fix it',
    filePath: 'src/utils.ts',
    lineRange: [10, 12] as [number, number],
    source: 'llm',
    confidence: 80,
    ...overrides,
  };
}

describe('filterHallucinations', () => {
  it('should remove findings referencing files not in diff', () => {
    const docs = [makeDoc({ filePath: 'src/nonexistent.ts' })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(0);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].filePath).toBe('src/nonexistent.ts');
  });

  it('should keep findings for files in diff with lines in hunk', () => {
    const docs = [makeDoc({ filePath: 'src/utils.ts', lineRange: [11, 12] })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
    expect(result.removed).toHaveLength(0);
  });

  it('should remove findings with line ranges outside all hunks', () => {
    // Hunk is at lines 10-17, tolerance is 10, so line 500 is well outside
    const docs = [makeDoc({ filePath: 'src/utils.ts', lineRange: [500, 510] })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(0);
    expect(result.removed).toHaveLength(1);
  });

  it('should penalize confidence for fabricated code quotes', () => {
    const docs = [makeDoc({
      problem: 'The code `thisIsAFabricatedCodeSnippetThatDoesNotExist` is wrong',
      confidence: 80,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0].confidence).toBe(40); // 80 * 0.5
  });

  it('should not penalize confidence for real code quotes', () => {
    const docs = [makeDoc({
      problem: 'The code `const b = computeValue()` is problematic',
      confidence: 80,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0].confidence).toBe(80);
  });

  it('should always keep rule-source findings', () => {
    const docs = [makeDoc({
      source: 'rule',
      filePath: 'src/nonexistent.ts', // Even if file doesn't exist in diff
      lineRange: [999, 999],
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
    expect(result.removed).toHaveLength(0);
  });

  it('should keep findings with unknown filePath', () => {
    const docs = [makeDoc({ filePath: 'unknown' })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
    expect(result.removed).toHaveLength(0);
  });

  it('should return empty results for empty docs', () => {
    const result = filterHallucinations([], SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('should penalize confidence for self-contradicting findings', () => {
    const docs = [makeDoc({
      evidence: ['Division by zero is avoided due to prior check on line 5'],
      confidence: 80,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0].confidence).toBe(24); // 80 * 0.3
  });

  it('should not penalize confidence for findings without self-contradiction', () => {
    const docs = [makeDoc({
      problem: 'Division by zero on line 12',
      evidence: ['computeValue() may return 0'],
      suggestion: 'Validate the divisor is non-zero',
      confidence: 80,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0].confidence).toBe(80);
  });

  it('should correctly split mixed valid/invalid docs', () => {
    const docs = [
      makeDoc({ filePath: 'src/utils.ts', lineRange: [11, 12] }), // valid
      makeDoc({ filePath: 'src/nonexistent.ts' }), // invalid: file not in diff
      makeDoc({ filePath: 'src/index.ts', lineRange: [1, 3] }), // valid
      makeDoc({ filePath: 'src/utils.ts', lineRange: [500, 510] }), // invalid: out of range
      makeDoc({ source: 'rule', filePath: 'any-file.ts' }), // valid: rule source
    ];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(3);
    expect(result.removed).toHaveLength(2);
    expect(result.removed.map(d => d.filePath)).toEqual([
      'src/nonexistent.ts',
      'src/utils.ts',
    ]);
  });
});

describe('deduplicateEvidence', () => {
  it('should merge findings on same file, same line, similar title', () => {
    const docs = [
      makeDoc({
        issueTitle: 'Null pointer dereference risk',
        filePath: 'src/utils.ts',
        lineRange: [10, 12],
        confidence: 70,
        evidence: ['evidence A'],
      }),
      makeDoc({
        issueTitle: 'Null pointer dereference possible',
        filePath: 'src/utils.ts',
        lineRange: [11, 13],
        confidence: 85,
        evidence: ['evidence B'],
      }),
    ];
    const result = deduplicateEvidence(docs);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(85); // higher confidence kept
    expect(result[0].evidence).toContain('evidence A');
    expect(result[0].evidence).toContain('evidence B');
  });

  it('should not merge findings on different files', () => {
    const docs = [
      makeDoc({
        issueTitle: 'Null pointer dereference',
        filePath: 'src/utils.ts',
        lineRange: [10, 12],
      }),
      makeDoc({
        issueTitle: 'Null pointer dereference',
        filePath: 'src/index.ts',
        lineRange: [10, 12],
      }),
    ];
    const result = deduplicateEvidence(docs);

    expect(result).toHaveLength(2);
  });

  it('should not merge findings with very different titles', () => {
    const docs = [
      makeDoc({
        issueTitle: 'SQL injection vulnerability',
        filePath: 'src/utils.ts',
        lineRange: [10, 12],
      }),
      makeDoc({
        issueTitle: 'Memory leak in event handler',
        filePath: 'src/utils.ts',
        lineRange: [10, 12],
      }),
    ];
    const result = deduplicateEvidence(docs);

    expect(result).toHaveLength(2);
  });

  it('should preserve self-contradiction penalty after merge', () => {
    const docs = [
      makeDoc({
        issueTitle: 'Division by zero risk in helper',
        filePath: 'src/utils.ts',
        lineRange: [10, 12],
        confidence: 24,
        evidence: ['Division by zero is avoided due to prior check on line 5'],
      }),
      makeDoc({
        issueTitle: 'Division by zero possible in helper',
        filePath: 'src/utils.ts',
        lineRange: [11, 13],
        confidence: 80,
        evidence: ['Potential divide by zero in compute path'],
      }),
    ];
    const result = deduplicateEvidence(docs);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(24); // max(24,80)=80 then contradiction penalty => 24
  });
});
