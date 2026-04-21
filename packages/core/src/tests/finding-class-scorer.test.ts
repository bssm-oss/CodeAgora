import { describe, it, expect } from 'vitest';
import type { EvidenceDocument } from '../types/core.js';
import { matchFindingClass, FINDING_CLASS_PRIORS } from '../pipeline/finding-class-scorer.js';

function doc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'title',
    problem: 'problem',
    evidence: [],
    severity: 'WARNING',
    suggestion: 's',
    filePath: 'src/a.ts',
    lineRange: [10, 10],
    ...overrides,
  };
}

describe('matchFindingClass — positive matches', () => {
  // Real FP samples captured from 2026-04-20 bench-fn runs against
  // fp-moderator-regex and quota-manager-dual. Each must trip the
  // corresponding prior class.

  it('catches ReDoS claim against a bounded regex (run 3 FP)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential ReDoS Vulnerability in Regex Pattern',
        problem: 'The regex pattern may cause catastrophic backtracking on malformed input.',
      }),
    )!;
    expect(match.id).toBe('redos');
    expect(match.multiplier).toBe(0.6);
  });

  it('catches "Potential Regular Expression Denial of Service" phrasing (run 3 FP)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential Regular Expression Denial of Service (ReDoS)',
        problem: 'Exponential time possible on adversarial input.',
      }),
    )!;
    expect(match.id).toBe('redos');
  });

  it('catches JSON.parse "may throw" claim against code with try/catch (run 1 FP)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Unhandled JSON Parsing Exception in parseForcedDecisionJson',
        problem: 'JSON.parse may throw a SyntaxError if the payload is not valid JSON.',
      }),
    )!;
    expect(match.id).toBe('may-throw');
    expect(match.multiplier).toBe(0.7);
  });

  it('catches "uncaught exception" phrasing', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Uncaught exception on malformed input',
        problem: 'function may throw with invalid shape',
      }),
    )!;
    expect(match.id).toBe('may-throw');
  });

  it('catches missing-input-validation against exported typed function (run 3 FP)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Exported Function Missing Input Sanitization for response Parameter',
        problem: 'No validation of the response parameter before use.',
      }),
    )!;
    expect(match.id).toBe('missing-validation');
    expect(match.multiplier).toBe(0.7);
  });

  it('catches "unvalidated user input" phrasing', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Unvalidated user input reaches dispatcher',
        problem: 'details',
      }),
    )!;
    expect(match.id).toBe('missing-validation');
  });

  it('catches zero-width-space claim against pure-ASCII code (PR #490 FP)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Zero-width character in regex literal',
        problem: 'The regex literal contains zero-width space characters embedded in the pattern.',
      }),
    )!;
    expect(match.id).toBe('zero-width');
    expect(match.multiplier).toBe(0.5);
  });

  it('catches invisible-unicode-character variant', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Invisible unicode character in identifier',
        problem: 'details',
      }),
    )!;
    expect(match.id).toBe('zero-width');
  });

  it('catches "missing null guard" (PR #499 self-review FP)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Missing null guard for activeReviewers in computeL1Confidence',
        problem: 'The function does not check whether activeReviewers is null before use.',
      }),
    )!;
    expect(match.id).toBe('missing-null-guard');
    expect(match.multiplier).toBe(0.7);
  });

  it('catches "no null check" phrasing', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Null dereference risk',
        problem: 'The code has no null check on the response object.',
      }),
    )!;
    expect(match.id).toBe('missing-null-guard');
  });

  it('catches "null/undefined check" phrasing', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential undefined reference in handler',
        problem: 'A null/undefined check is missing before property access.',
      }),
    )!;
    expect(match.id).toBe('missing-null-guard');
  });

  it('catches generic "potential security concern" phrasing (run 3 FP)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Potential security risk in request handling',
        problem: 'could be exploited to bypass authentication.',
      }),
    )!;
    // Either generic-potential or a more-specific class is fine; the
    // important thing is that SOMETHING matches and the multiplier is
    // sub-unity. Order in the table means more-specific wins when both
    // apply.
    expect(match.multiplier).toBeLessThan(1);
  });
});

describe('matchFindingClass — negative cases (real bugs must pass)', () => {
  // Findings that describe real, well-grounded bugs should NOT match
  // any FP-heavy prior. These mirror the shape of BUG 1 / BUG 2 from
  // quota-manager-dual that were correctly caught across runs.

  it('off-by-one claim with concrete slice evidence does not match', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Off-by-one error in findExceededUsers slice operation',
        problem:
          'slice(0, limit + 1) returns pageSize+1 items; the `+ 1` is the defect. Subsequent pagination consumers will see one extra row.',
      }),
    );
    expect(match).toBeNull();
  });

  it('input-mutation claim does not match may-throw or missing-validation', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'In-place mutation in maybeResetWindow',
        problem:
          'maybeResetWindow mutates its input quota parameter via quota.usedToday = 0 despite the "returns updated quota" contract.',
      }),
    );
    expect(match).toBeNull();
  });

  it('SQL injection claim does not match generic-potential (specific category)', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'SQL injection via unparameterized email in findUserByEmail',
        problem: 'The email is concatenated directly into the SQL string.',
      }),
    );
    expect(match).toBeNull();
  });

  it('null-deref claim does not match anything', () => {
    const match = matchFindingClass(
      doc({
        issueTitle: 'Null reference at getDisplayName line 4',
        problem: 'user.displayName is accessed before the `user === null` check.',
      }),
    );
    expect(match).toBeNull();
  });
});

describe('FINDING_CLASS_PRIORS — table invariants', () => {
  it('all multipliers are in [0, 1]', () => {
    for (const p of FINDING_CLASS_PRIORS) {
      expect(p.multiplier).toBeGreaterThanOrEqual(0);
      expect(p.multiplier).toBeLessThanOrEqual(1);
    }
  });

  it('all priors have a non-empty pattern list', () => {
    for (const p of FINDING_CLASS_PRIORS) {
      expect(p.patterns.length).toBeGreaterThan(0);
    }
  });

  it('ids are unique', () => {
    const ids = FINDING_CLASS_PRIORS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('specific classes appear before generic-potential catch-all', () => {
    const specific = FINDING_CLASS_PRIORS.findIndex((p) => p.id !== 'generic-potential');
    const generic = FINDING_CLASS_PRIORS.findIndex((p) => p.id === 'generic-potential');
    expect(specific).toBeLessThan(generic);
  });
});
