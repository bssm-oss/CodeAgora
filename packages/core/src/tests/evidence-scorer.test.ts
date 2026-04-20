import { describe, it, expect } from 'vitest';
import type { EvidenceDocument } from '../types/core.js';
import { scoreEvidence, evidenceMultiplier, __internal } from '../pipeline/evidence-scorer.js';

const { scoreEvidenceCount, scoreProblemLength, scoreSpecificity } = __internal;

function doc(over: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'title',
    problem: 'problem',
    evidence: ['e1'],
    severity: 'WARNING',
    suggestion: 's',
    filePath: 'src/a.ts',
    lineRange: [10, 10],
    ...over,
  };
}

describe('scoreEvidenceCount', () => {
  it('0 items → 0', () => {
    expect(scoreEvidenceCount(doc({ evidence: [] }))).toBe(0);
  });
  it('1 item → 0.33', () => {
    expect(scoreEvidenceCount(doc({ evidence: ['a'] }))).toBe(0.33);
  });
  it('2 items → 0.67', () => {
    expect(scoreEvidenceCount(doc({ evidence: ['a', 'b'] }))).toBe(0.67);
  });
  it('3+ items → 1.0', () => {
    expect(scoreEvidenceCount(doc({ evidence: ['a', 'b', 'c'] }))).toBe(1.0);
    expect(scoreEvidenceCount(doc({ evidence: new Array(10).fill('x') }))).toBe(1.0);
  });
});

describe('scoreProblemLength', () => {
  it('<50 chars → 0', () => {
    expect(scoreProblemLength(doc({ problem: 'short problem' }))).toBe(0);
  });
  it('50–99 chars → 0.5', () => {
    expect(scoreProblemLength(doc({ problem: 'x'.repeat(60) }))).toBe(0.5);
    expect(scoreProblemLength(doc({ problem: 'x'.repeat(99) }))).toBe(0.5);
  });
  it('100–299 chars → 0.8', () => {
    expect(scoreProblemLength(doc({ problem: 'x'.repeat(100) }))).toBe(0.8);
    expect(scoreProblemLength(doc({ problem: 'x'.repeat(299) }))).toBe(0.8);
  });
  it('300+ chars → 1.0', () => {
    expect(scoreProblemLength(doc({ problem: 'x'.repeat(300) }))).toBe(1.0);
    expect(scoreProblemLength(doc({ problem: 'x'.repeat(1000) }))).toBe(1.0);
  });
});

describe('scoreSpecificity', () => {
  it('zero markers → 0', () => {
    expect(scoreSpecificity(doc({ problem: 'This is generic English with no code citations.' }))).toBe(0);
  });
  it('file:line citation counts', () => {
    expect(scoreSpecificity(doc({ problem: 'Bug at moderator.ts:755 inside that function.' }))).toBeGreaterThan(0);
  });
  it('backtick identifier counts', () => {
    expect(scoreSpecificity(doc({ problem: 'The `parseForcedDecisionJson` call ignores errors.' }))).toBeGreaterThan(0);
  });
  it('combined markers stack to higher score', () => {
    const weak = doc({ problem: 'Bug at foo.ts.' });
    const strong = doc({
      problem:
        'Line 755 of `foo.ts`: `parseForcedDecisionJson(input)` invokes `JSON.parse(payload)` without guarding the parseJsonError.',
    });
    expect(scoreSpecificity(strong)).toBeGreaterThan(scoreSpecificity(weak));
    expect(scoreSpecificity(strong)).toBe(1.0);
  });
  it('ignores generic capitalised words', () => {
    expect(scoreSpecificity(doc({ problem: 'In Production Our System Sometimes Throws Exceptions.' }))).toBe(0);
  });
});

describe('scoreEvidence (composite)', () => {
  it('empty doc scores near zero', () => {
    const s = scoreEvidence(doc({ evidence: [], problem: '' }));
    expect(s).toBe(0);
  });

  it('low-quality FP template scores low', () => {
    // Shape matches the "JSON.parse may throw" FP we observed in
    // benchmark run #1: short evidence list, mid-length vague problem,
    // no file:line citation, minimal specificity.
    const fp = doc({
      evidence: ['The function does not handle errors.'],
      problem:
        'The function may throw an uncaught exception if the input is malformed, which could crash the application.',
    });
    expect(scoreEvidence(fp)).toBeLessThan(0.6);
  });

  it('high-quality bug report scores high', () => {
    const good = doc({
      evidence: [
        'packages/foo.ts:42 calls parseThing(input)',
        'the return value is never null-checked before .length access',
        'the caller path includes unauthenticated routes',
      ],
      problem:
        'At `packages/foo.ts:42` the function `parseThing(input)` returns `null` when the input is malformed. The immediately following access `result.length` then dereferences null, producing a `TypeError: Cannot read properties of null`. This path is reachable via unauthenticated requests because `handleRequest()` does not validate the body before dispatch.',
    });
    expect(scoreEvidence(good)).toBeGreaterThan(0.8);
  });

  it('rounds to three decimals', () => {
    const s = scoreEvidence(doc({ evidence: ['a'], problem: 'x'.repeat(60) }));
    // (0.33 + 0.5 + specificity) / 3 — value must have at most 3 decimals
    expect(s).toBe(Math.round(s * 1000) / 1000);
  });
});

describe('evidenceMultiplier', () => {
  it('score 0 → multiplier 0.7', () => {
    expect(evidenceMultiplier(0)).toBeCloseTo(0.7, 5);
  });
  it('score 1 → multiplier 1.0', () => {
    expect(evidenceMultiplier(1)).toBeCloseTo(1.0, 5);
  });
  it('score 0.5 → multiplier 0.85', () => {
    expect(evidenceMultiplier(0.5)).toBeCloseTo(0.85, 5);
  });
  it('clamps out-of-range scores', () => {
    expect(evidenceMultiplier(-0.5)).toBeCloseTo(0.7, 5);
    expect(evidenceMultiplier(2)).toBeCloseTo(1.0, 5);
  });
});
