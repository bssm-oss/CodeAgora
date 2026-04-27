import { describe, it, expect } from 'vitest';
import { filterHallucinations } from '../pipeline/hallucination-filter.js';
import type { EvidenceDocument } from '../types/core.js';

// ============================================================================
// Test Diff Fixtures
// ============================================================================

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

/** Diff with only additions (no removals) for contradiction tests. */
const ADDITIONS_ONLY_DIFF = `diff --git a/src/new-feature.ts b/src/new-feature.ts
--- /dev/null
+++ b/src/new-feature.ts
@@ -0,0 +1,5 @@
+export function newFeature() {
+  const x = 1;
+  const y = 2;
+  return x + y;
+}
`;

/** Diff with only removals (no additions) for contradiction tests. */
const REMOVALS_ONLY_DIFF = `diff --git a/src/deprecated.ts b/src/deprecated.ts
--- a/src/deprecated.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-export function oldFunction() {
-  const x = 1;
-  const y = 2;
-  return x + y;
-}
`;

// ============================================================================
// Helper
// ============================================================================

// Default doc values are intentionally rich so the #468 evidence-quality
// check (check 6) scores 1.0 → multiplier 1.0 → no penalty. That lets
// each `describe(Check N)` block exercise its specific check in
// isolation.
const DEFAULT_PROBLEM =
  'At `src/utils.ts:10` the helper `computeValue(input)` is invoked without validating the `options.timeout` parameter. ' +
  'The call site at line 12 forwards the raw user-provided value directly into `setTimeoutWrapper(input)`, bypassing ' +
  'the sanitisation performed inside `normaliseTimeout()`. This allows unexpected NaN or negative values to propagate ' +
  'through the scheduler and eventually land in `setTimeout(callback, value)` where the platform coerces them in ' +
  'provider-specific ways.';
const DEFAULT_EVIDENCE = [
  'Line 10 of `src/utils.ts` introduces the unguarded call to `computeValue(input)`.',
  'The subsequent call chain `setTimeoutWrapper(input)` → `setTimeout(callback, value)` never validates the argument.',
  'Comparable helpers such as `normaliseTimeout()` already perform the sanity check but are not applied here.',
];

/**
 * Wrap a short, check-specific problem snippet with enough surrounding
 * context (length + specificity markers + file:line citation) to keep
 * the #468 evidence-quality sub-scores at 1.0. Use when a test wants to
 * exercise checks 3–5 against a minimal trigger string without also
 * taking a check-6 multiplier.
 *
 * Padding deliberately avoids backticked code quotes ≥10 chars so it
 * does not trip Check 3 (fabricated code quote) for diffs that don't
 * contain those symbols. Specificity is carried by plain-text
 * file:line citations, `line N` phrasing, and camelCase identifiers.
 */
function richProblem(snippet: string): string {
  return (
    `At src/utils.ts:10 inside the introduced call: ${snippet} ` +
    'This bug was introduced on line 10 of src/utils.ts where the new ' +
    'call site forwards the raw numeric argument into setTimeoutWrapper(input) ' +
    'before normaliseTimeout() runs, which means negative or NaN values ' +
    'can reach setTimeout(callback, value) and trigger platform-specific ' +
    'coercion that the caller does not expect.'
  );
}

function makeDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'Test Issue',
    problem: DEFAULT_PROBLEM,
    evidence: [...DEFAULT_EVIDENCE],
    severity: 'WARNING',
    suggestion: 'Add a null check for the timeout value before forwarding to setTimeoutWrapper.',
    filePath: 'src/utils.ts',
    lineRange: [10, 12] as [number, number],
    source: 'llm',
    confidence: 80,
    ...overrides,
  };
}

// ============================================================================
// Check 1: File Existence
// ============================================================================

describe('Check 1: File existence', () => {
  it('should remove findings referencing files not in diff', () => {
    const docs = [makeDoc({ filePath: 'src/nonexistent.ts' })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(0);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].filePath).toBe('src/nonexistent.ts');
  });

  it('should keep findings for valid files', () => {
    const docs = [makeDoc({ filePath: 'src/utils.ts', lineRange: [11, 12] })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
    expect(result.removed).toHaveLength(0);
  });

  it('should keep findings with unknown filePath', () => {
    const docs = [makeDoc({ filePath: 'unknown' })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
  });

  it('should handle files with similar prefixes correctly', () => {
    // src/utils.ts exists but src/utils.test.ts does not
    const docs = [makeDoc({ filePath: 'src/utils.test.ts' })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.removed).toHaveLength(1);
  });
});

// ============================================================================
// Check 2: Line Range Overlap
// ============================================================================

describe('Check 2: Line range overlap', () => {
  it('should remove findings with line ranges far outside all hunks', () => {
    const docs = [makeDoc({ filePath: 'src/utils.ts', lineRange: [500, 510] })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(0);
    expect(result.removed).toHaveLength(1);
  });

  it('should keep findings within hunk tolerance (±10 lines)', () => {
    // Hunk is ~10-17, tolerance is 10, so line 25 should still overlap
    const docs = [makeDoc({ filePath: 'src/utils.ts', lineRange: [20, 25] })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
  });

  it('should keep findings at exact hunk boundaries', () => {
    const docs = [makeDoc({ filePath: 'src/utils.ts', lineRange: [10, 10] })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
  });

  it('should handle lineRange [0, 0] gracefully (skip line check)', () => {
    const docs = [makeDoc({ filePath: 'src/utils.ts', lineRange: [0, 0] })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
  });
});

// ============================================================================
// Check 3: Code Quote Verification
// ============================================================================

describe('Check 3: Code quote verification', () => {
  it('should penalize confidence for fabricated code quotes', () => {
    const docs = [makeDoc({
      problem: richProblem('The code `thisIsAFabricatedCodeSnippetThatDoesNotExist` is wrong'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0].confidence).toBe(40); // 80 * 0.5
  });

  it('should not penalize confidence for real code quotes', () => {
    const docs = [makeDoc({
      problem: richProblem('The code `const b = computeValue()` is problematic'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0].confidence).toBe(80);
  });

  it('should ignore short code quotes (< 10 chars)', () => {
    const docs = [makeDoc({
      problem: richProblem('Variable `x` and `y` are bad'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered[0].confidence).toBe(80); // Not penalized
  });

  it('should handle mixed real and fabricated quotes', () => {
    const docs = [makeDoc({
      problem: richProblem('The `const b = computeValue()` is fine but `totallyFakeCodeThatDoesNotExist` is bad'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    // 1 real + 1 fake = 50% fabricated, not > 50%, so no penalty
    expect(result.filtered[0].confidence).toBe(80);
  });

  it('should penalize when majority of quotes are fabricated', () => {
    const docs = [makeDoc({
      problem: richProblem('`fakeSnippetOne1234` and `fakeSnippetTwo5678` and `fakeSnippetThreeABC` are wrong'),
      confidence: 60,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered[0].confidence).toBe(30); // 60 * 0.5
  });

  it('should not crash on problem text with no backticks', () => {
    const docs = [makeDoc({ problem: richProblem('No code quotes here at all'), confidence: 80 })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered[0].confidence).toBe(80);
  });
});

// ============================================================================
// Check 4: Self-Contradiction Detection
// ============================================================================

describe('Check 4: Self-contradiction detection', () => {
  it('should penalize when finding claims "added" but only removals exist', () => {
    const docs = [makeDoc({
      filePath: 'src/deprecated.ts',
      lineRange: [1, 5],
      problem: richProblem('A new variable was added without type annotation'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, REMOVALS_ONLY_DIFF);

    expect(result.filtered[0].confidence).toBe(40); // 80 * 0.5
  });

  it('should penalize when finding claims "removed" but only additions exist', () => {
    const docs = [makeDoc({
      filePath: 'src/new-feature.ts',
      lineRange: [1, 5],
      problem: richProblem('The function was removed without deprecation notice'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, ADDITIONS_ONLY_DIFF);

    expect(result.filtered[0].confidence).toBe(40); // 80 * 0.5
  });

  it('should not penalize when direction matches (added + additions exist)', () => {
    const docs = [makeDoc({
      filePath: 'src/new-feature.ts',
      lineRange: [1, 5],
      problem: richProblem('A new function was added to host the helper'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, ADDITIONS_ONLY_DIFF);

    expect(result.filtered[0].confidence).toBe(80); // No penalty
  });

  it('should not penalize neutral descriptions', () => {
    const docs = [makeDoc({
      filePath: 'src/new-feature.ts',
      lineRange: [1, 5],
      problem: richProblem('The function has a potential null reference'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, ADDITIONS_ONLY_DIFF);

    expect(result.filtered[0].confidence).toBe(80);
  });

  it('should stack with code quote penalty', () => {
    const docs = [makeDoc({
      filePath: 'src/deprecated.ts',
      lineRange: [1, 5],
      problem: richProblem('The new import `totallyFakeCodeSnippetHere` was added incorrectly'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, REMOVALS_ONLY_DIFF);

    // Both check 3 (fabricated quote) and check 4 (contradiction) apply
    // 80 * 0.5 (quote) * 0.5 (contradiction) = 20
    expect(result.filtered[0].confidence).toBe(20);
  });
});

describe('Check 7: Finding-class prior', () => {
  it('routes undeclared-type compile-error claims below the benchmark actionable threshold', () => {
    const docs = [makeDoc({
      issueTitle: 'Return type annotation uses undeclared Severity type',
      problem: richProblem(
        'The return type annotation references Severity but the type is not imported. ' +
        'This will cause a TypeScript compilation error.',
      ),
      confidence: 48,
    })];

    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    expect(result.uncertain[0].confidence).toBe(19);
    expect(result.uncertain[0].confidenceTrace?.classPrior).toBe('undeclared-type');
  });
});

// ============================================================================
// Check 5: Speculative Language Penalty
// ============================================================================

describe('Check 5: Speculative language penalty', () => {
  it('should penalize "may not exist" phrasing', () => {
    const docs = [makeDoc({
      filePath: 'src/utils.ts',
      lineRange: [10, 12],
      problem: richProblem('The helper may not exist in the target environment, causing runtime failure.'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered[0].confidence).toBe(56); // 80 * 0.7
  });

  it('should penalize "potentially unsupported" phrasing', () => {
    const docs = [makeDoc({
      filePath: 'src/utils.ts',
      lineRange: [10, 12],
      problem: richProblem('Potentially unsupported API invocation for this provider.'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered[0].confidence).toBe(56);
  });

  it('should penalize "could fail" phrasing', () => {
    const docs = [makeDoc({
      filePath: 'src/utils.ts',
      lineRange: [10, 12],
      problem: richProblem('This computation could fail under high concurrency.'),
      confidence: 90,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered[0].confidence).toBe(63); // round(90 * 0.7)
  });

  it('should penalize "appears to" / "seems to" phrasing', () => {
    const docs = [
      makeDoc({
        filePath: 'src/utils.ts',
        lineRange: [10, 12],
        problem: richProblem('The function appears to handle null incorrectly.'),
        confidence: 80,
      }),
      makeDoc({
        filePath: 'src/utils.ts',
        lineRange: [10, 12],
        problem: richProblem('This seems to leak a file handle.'),
        confidence: 80,
      }),
    ];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered[0].confidence).toBe(56);
    expect(result.filtered[1].confidence).toBe(56);
  });

  it('should penalize when hedge marker is in suggestion text only', () => {
    const docs = [makeDoc({
      filePath: 'src/utils.ts',
      lineRange: [10, 12],
      problem: richProblem('The helper returns an unchecked value.'),
      suggestion: 'Add a null check; the current code unclear about edge cases.',
      confidence: 80,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered[0].confidence).toBe(56);
  });

  it('should NOT penalize plain declarative findings', () => {
    const docs = [makeDoc({
      filePath: 'src/utils.ts',
      lineRange: [10, 12],
      problem: richProblem('The helper returns without validating the input range.'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered[0].confidence).toBe(80);
  });

  it('should NOT trip on "may" used non-speculatively', () => {
    // "may" without a speculative collocation should not match
    const docs = [makeDoc({
      filePath: 'src/utils.ts',
      lineRange: [10, 12],
      problem: richProblem('The May 2026 release introduces a breaking change in this helper.'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered[0].confidence).toBe(80);
  });

  it('should stack with contradiction penalty', () => {
    const docs = [makeDoc({
      filePath: 'src/deprecated.ts',
      lineRange: [1, 5],
      problem: richProblem('A new variable was added that may leak memory.'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, REMOVALS_ONLY_DIFF);

    // check 4 (contradiction: claims "added" but only removals) × check 5 (hedge "may leak")
    // 80 * 0.5 * 0.7 = 28
    expect(result.filtered[0].confidence).toBe(28);
  });

  it('should populate confidenceTrace.filtered after speculation penalty', () => {
    const docs = [makeDoc({
      filePath: 'src/utils.ts',
      lineRange: [10, 12],
      problem: richProblem('The helper appears to mishandle null inputs.'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered[0].confidenceTrace?.filtered).toBe(56);
    expect(result.filtered[0].confidenceTrace?.filtered).toBe(result.filtered[0].confidence);
  });
});

// ============================================================================
// Uncertainty Routing
// ============================================================================

describe('Uncertainty routing', () => {
  it('should route very low confidence findings to uncertain', () => {
    const docs = [makeDoc({
      filePath: 'src/deprecated.ts',
      lineRange: [1, 5],
      problem: richProblem('A `totallyFakeCodeSnippetHere` was introduced that is wrong'),
      confidence: 30, // After penalties: 30 * 0.5 (quote) * 0.5 (contradiction) = 8 < 20
    })];
    const result = filterHallucinations(docs, REMOVALS_ONLY_DIFF);

    expect(result.filtered).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    expect(result.uncertain[0].confidence).toBeLessThan(20);
  });

  it('should keep moderate confidence findings in filtered', () => {
    const docs = [makeDoc({ confidence: 80 })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
    expect(result.uncertain).toHaveLength(0);
  });
});

// ============================================================================
// Rule Source Bypass
// ============================================================================

describe('Rule-source bypass', () => {
  it('should always keep rule-source findings', () => {
    const docs = [makeDoc({
      source: 'rule',
      filePath: 'src/nonexistent.ts',
      lineRange: [999, 999],
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(1);
    expect(result.removed).toHaveLength(0);
  });
});

// ============================================================================
// Edge Cases & Integration
// ============================================================================

describe('Edge cases', () => {
  it('should return empty results for empty docs', () => {
    const result = filterHallucinations([], SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.uncertain).toHaveLength(0);
  });

  it('should handle empty diff content', () => {
    const docs = [makeDoc()];
    const result = filterHallucinations(docs, '');

    // No files in diff → removed
    expect(result.removed).toHaveLength(1);
  });

  it('should correctly split mixed valid/invalid docs', () => {
    const docs = [
      makeDoc({ filePath: 'src/utils.ts', lineRange: [11, 12] }),       // valid
      makeDoc({ filePath: 'src/nonexistent.ts' }),                       // invalid: file not in diff
      makeDoc({ filePath: 'src/index.ts', lineRange: [1, 3] }),         // valid
      makeDoc({ filePath: 'src/utils.ts', lineRange: [500, 510] }),     // invalid: out of range
      makeDoc({ source: 'rule', filePath: 'any-file.ts' }),             // valid: rule source
    ];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered).toHaveLength(3);
    expect(result.removed).toHaveLength(2);
    expect(result.removed.map(d => d.filePath)).toEqual([
      'src/nonexistent.ts',
      'src/utils.ts',
    ]);
  });

  it('should handle doc with undefined confidence', () => {
    const docs = [makeDoc({
      problem: richProblem('The code `thisIsAFabricatedCodeSnippetThatDoesNotExist` is wrong'),
      confidence: undefined,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    // Default 50 * 0.5 = 25, still above uncertainty threshold
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0].confidence).toBe(25);
  });
});

// ============================================================================
// ConfidenceTrace population
// ============================================================================

describe('ConfidenceTrace: filtered stage', () => {
  it('should populate confidenceTrace.filtered after code-quote penalty', () => {
    const docs = [makeDoc({
      problem: richProblem('The code `thisIsAFabricatedCodeSnippetThatDoesNotExist` is wrong'),
      confidence: 80,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered[0].confidenceTrace?.filtered).toBe(40);
    // BC parity: legacy `confidence` field mirrors trace.filtered within this stage.
    expect(result.filtered[0].confidenceTrace?.filtered).toBe(result.filtered[0].confidence);
  });

  it('should populate confidenceTrace.filtered as pass-through when no penalty applied', () => {
    const docs = [makeDoc({
      problem: richProblem('Plain problem description with no fabricated quotes'),
      confidence: 75,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    expect(result.filtered[0].confidenceTrace?.filtered).toBe(75);
  });

  it('should populate confidenceTrace.filtered for docs routed to uncertain', () => {
    const docs = [makeDoc({
      filePath: 'src/deprecated.ts',
      lineRange: [1, 5],
      problem: richProblem('A `totallyFakeCodeSnippetHere` was introduced that is wrong'),
      confidence: 30,
    })];
    const result = filterHallucinations(docs, REMOVALS_ONLY_DIFF);

    // Routed to uncertain bucket, but trace must still be populated so
    // downstream stages can reconstruct the history.
    expect(result.uncertain).toHaveLength(1);
    expect(result.uncertain[0].confidenceTrace?.filtered).toBeLessThan(20);
    expect(result.uncertain[0].confidenceTrace?.filtered).toBe(result.uncertain[0].confidence);
  });

  it('should not populate confidenceTrace for rule-source findings', () => {
    const docs = [makeDoc({
      source: 'rule',
      filePath: 'src/nonexistent.ts',
      confidence: 90,
    })];
    const result = filterHallucinations(docs, SAMPLE_DIFF);

    // Rule-source docs bypass the filter entirely — filter does not write trace.
    expect(result.filtered[0].confidenceTrace).toBeUndefined();
  });
});
