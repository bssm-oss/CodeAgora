/**
 * Parser bilingual regex + confidence extraction tests (#238, #240)
 *
 * Covers:
 * - English headers (### Problem / Evidence / Severity / Suggestion) parse correctly
 * - Korean headers still parse correctly (regression)
 * - "CRITICAL (85%)" extracts confidence 85
 * - "WARNING" (no percentage) returns undefined confidence
 * - Confidence blending: reviewer 80% + agreement 50% → 68
 */

import { describe, it, expect } from 'vitest';
import { parseEvidenceResponse } from '../l1/parser.js';
import { computeL1Confidence } from '../pipeline/confidence.js';
import type { EvidenceDocument } from '../types/core.js';

// ---------------------------------------------------------------------------
// English header parsing (#240)
// ---------------------------------------------------------------------------

function makeEnglishBlock(severity: string, fileLine = 'In src/foo.ts:10-20'): string {
  return `## Issue: Test Issue\n\n### Problem\n${fileLine}\n\n### Evidence\n1. Evidence item\n\n### Severity\n${severity}\n\n### Suggestion\nFix it\n`;
}

function makeKoreanBlock(severity: string, fileLine = 'In src/foo.ts:10-20'): string {
  return `## Issue: Test Issue\n\n### 문제\n${fileLine}\n\n### 근거\n1. Evidence item\n\n### 심각도\n${severity}\n\n### 제안\nFix it\n`;
}

describe('parseEvidenceResponse — English headers (#240)', () => {
  it('parses a block with English headers correctly', () => {
    const result = parseEvidenceResponse(makeEnglishBlock('WARNING'));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('WARNING');
    expect(result[0].issueTitle).toBe('Test Issue');
    expect(result[0].filePath).toBe('src/foo.ts');
    expect(result[0].lineRange).toEqual([10, 20]);
  });

  it('parses CRITICAL with English headers', () => {
    const result = parseEvidenceResponse(makeEnglishBlock('CRITICAL'));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('CRITICAL');
  });

  it('parses HARSHLY_CRITICAL with English headers', () => {
    const result = parseEvidenceResponse(makeEnglishBlock('HARSHLY_CRITICAL'));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('HARSHLY_CRITICAL');
  });

  it('parses SUGGESTION with English headers', () => {
    const result = parseEvidenceResponse(makeEnglishBlock('SUGGESTION'));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('SUGGESTION');
  });

  it('parses multiple English-header blocks in one response', () => {
    const response = makeEnglishBlock('WARNING') + '\n' + makeEnglishBlock('CRITICAL', 'In src/bar.ts:5-15');
    const result = parseEvidenceResponse(response);
    expect(result).toHaveLength(2);
    expect(result[0].severity).toBe('WARNING');
    expect(result[1].severity).toBe('CRITICAL');
  });
});

// ---------------------------------------------------------------------------
// Korean header regression (#240)
// ---------------------------------------------------------------------------

describe('parseEvidenceResponse — Korean headers regression (#240)', () => {
  it('still parses Korean headers after regex update', () => {
    const result = parseEvidenceResponse(makeKoreanBlock('WARNING'));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('WARNING');
    expect(result[0].filePath).toBe('src/foo.ts');
  });

  it('parses CRITICAL with Korean headers', () => {
    const result = parseEvidenceResponse(makeKoreanBlock('CRITICAL'));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('CRITICAL');
  });

  it('parses HARSHLY_CRITICAL with Korean headers', () => {
    const result = parseEvidenceResponse(makeKoreanBlock('HARSHLY_CRITICAL'));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('HARSHLY_CRITICAL');
  });
});

// ---------------------------------------------------------------------------
// Confidence extraction (#238)
// ---------------------------------------------------------------------------

describe('parseEvidenceResponse — confidence extraction (#238)', () => {
  it('extracts confidence 85 from "CRITICAL (85%)"', () => {
    const result = parseEvidenceResponse(makeEnglishBlock('CRITICAL (85%)'));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('CRITICAL');
    expect(result[0].confidence).toBe(85);
  });

  it('extracts confidence 90 from "WARNING (90%)"', () => {
    const result = parseEvidenceResponse(makeEnglishBlock('WARNING (90%)'));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('WARNING');
    expect(result[0].confidence).toBe(90);
  });

  it('returns undefined confidence for "WARNING" (no percentage)', () => {
    const result = parseEvidenceResponse(makeEnglishBlock('WARNING'));
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBeUndefined();
  });

  it('returns undefined confidence for "CRITICAL" (no percentage)', () => {
    const result = parseEvidenceResponse(makeEnglishBlock('CRITICAL'));
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBeUndefined();
  });

  it('extracts confidence from Korean-header blocks too', () => {
    const result = parseEvidenceResponse(makeKoreanBlock('CRITICAL (70%)'));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('CRITICAL');
    expect(result[0].confidence).toBe(70);
  });

  it('extracts confidence 100 from "HARSHLY_CRITICAL (100%)"', () => {
    const result = parseEvidenceResponse(makeEnglishBlock('HARSHLY_CRITICAL (100%)'));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('HARSHLY_CRITICAL');
    expect(result[0].confidence).toBe(100);
  });

  it('extracts confidence 0 from "WARNING (0%)"', () => {
    const result = parseEvidenceResponse(makeEnglishBlock('WARNING (0%)'));
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Confidence blending in computeL1Confidence (#238)
// ---------------------------------------------------------------------------

describe('computeL1Confidence — reviewer confidence blending (#238)', () => {
  function makeDoc(filePath: string, lineStart: number, confidence?: number): EvidenceDocument {
    return {
      issueTitle: 'Test',
      problem: 'Test problem',
      evidence: [],
      severity: 'WARNING',
      suggestion: 'Fix it',
      filePath,
      lineRange: [lineStart, lineStart + 10],
      ...(confidence !== undefined && { confidence }),
    };
  }

  it('blends reviewer 80% + agreement 50% → 68', () => {
    // 2 agreeing docs out of 4 total reviewers → agreementRate = 50
    const doc = makeDoc('src/foo.ts', 10, 80);
    const allDocs = [
      makeDoc('src/foo.ts', 10),
      makeDoc('src/foo.ts', 12),
      makeDoc('src/bar.ts', 10),
      makeDoc('src/baz.ts', 10),
    ];
    // agreeing: docs with filePath=src/foo.ts AND |lineStart - 10| <= 5 → first 2
    const result = computeL1Confidence(doc, allDocs, 4);
    // Math.round(80 * 0.6 + 50 * 0.4) = Math.round(48 + 20) = 68
    expect(result).toBe(68);
  });

  it('uses pure agreement rate when no reviewer confidence provided', () => {
    const doc = makeDoc('src/foo.ts', 10);
    const allDocs = [
      makeDoc('src/foo.ts', 10),
      makeDoc('src/foo.ts', 12),
    ];
    // agreeing: 2 out of 4 → 50
    const result = computeL1Confidence(doc, allDocs, 4);
    expect(result).toBe(50);
  });

  it('blends reviewer 100% + agreement 100%, single-active sparse → 80 (×0.8)', () => {
    // Sparse regime (#462): only 1 active reviewer, no corroboration data.
    // Previously this returned 100 because the old logic skipped the penalty
    // when totalReviewers<3; that was an oversight — single-reviewer 100%
    // confidence is a sample-size-1 claim, not a verified one.
    const doc = makeDoc('src/foo.ts', 10, 100);
    const allDocs = [makeDoc('src/foo.ts', 10)];
    const result = computeL1Confidence(doc, allDocs, 1);
    // Math.round(100 * 0.6 + 100 * 0.4) = 100, then sparse ×0.8 = 80
    expect(result).toBe(80);
  });

  it('blends reviewer 0% + agreement 100%, single-active sparse → 32 (×0.8)', () => {
    const doc = makeDoc('src/foo.ts', 10, 0);
    const allDocs = [makeDoc('src/foo.ts', 10)];
    const result = computeL1Confidence(doc, allDocs, 1);
    // Math.round(0 * 0.6 + 100 * 0.4) = 40, then sparse ×0.8 = 32
    expect(result).toBe(32);
  });

  it('returns 50 for zero activeReviewers regardless of reviewer confidence', () => {
    const doc = makeDoc('src/foo.ts', 10, 80);
    expect(computeL1Confidence(doc, [], 0)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Corroboration scoring in computeL1Confidence (#432)
// ---------------------------------------------------------------------------

describe('computeL1Confidence — corroboration scoring (#432)', () => {
  function makeDoc(filePath: string, lineStart: number, confidence?: number): EvidenceDocument {
    return {
      issueTitle: 'Test',
      problem: 'Test problem',
      evidence: [],
      severity: 'WARNING',
      suggestion: 'Fix it',
      filePath,
      lineRange: [lineStart, lineStart + 10],
      ...(confidence !== undefined && { confidence }),
    };
  }

  it('dissent (1 agree / 5 active), small diff → confidence × 0.5', () => {
    // Dissent regime (#462): 5 reviewers active, only 1 agreed. The other 4
    // effectively disagreed (they reviewed the same diff and didn't flag it).
    const doc = makeDoc('src/foo.ts', 10, 80);
    const allDocs = [
      makeDoc('src/foo.ts', 10),   // agreeing (same file+line)
      makeDoc('src/bar.ts', 100),
      makeDoc('src/baz.ts', 200),
      makeDoc('src/qux.ts', 300),
      makeDoc('src/quux.ts', 400),
    ];
    // agreeing = 1, activeReviewers = 5, agreementRate = 20
    // base = Math.round(80 * 0.6 + 20 * 0.4) = Math.round(48 + 8) = 56
    // dissent penalty (small diff): 56 * 0.5 = 28
    const result = computeL1Confidence(doc, allDocs, 5, 100);
    expect(result).toBe(28);
  });

  it('dissent (1 agree / 5 active), large diff (>500 lines) → confidence × 0.7', () => {
    const doc = makeDoc('src/foo.ts', 10, 80);
    const allDocs = [
      makeDoc('src/foo.ts', 10),
      makeDoc('src/bar.ts', 100),
      makeDoc('src/baz.ts', 200),
      makeDoc('src/qux.ts', 300),
      makeDoc('src/quux.ts', 400),
    ];
    // agreeing = 1, totalReviewers = 5, agreementRate = 20
    // base = 56, penalty (large diff): Math.round(56 * 0.7) = 39
    const result = computeL1Confidence(doc, allDocs, 5, 600);
    expect(result).toBe(39);
  });

  it('triple corroboration (3/5) → confidence × 1.2', () => {
    const doc = makeDoc('src/foo.ts', 10, 80);
    const allDocs = [
      makeDoc('src/foo.ts', 10),
      makeDoc('src/foo.ts', 12),
      makeDoc('src/foo.ts', 14),
      makeDoc('src/bar.ts', 100),
      makeDoc('src/baz.ts', 200),
    ];
    // agreeing = 3, totalReviewers = 5, agreementRate = 60
    // base = Math.round(80 * 0.6 + 60 * 0.4) = Math.round(48 + 24) = 72
    // boost: Math.round(72 * 1.2) = 86
    const result = computeL1Confidence(doc, allDocs, 5);
    expect(result).toBe(86);
  });

  it('all reviewers agree (5/5) → confidence × 1.2 (capped at 100)', () => {
    const doc = makeDoc('src/foo.ts', 10, 100);
    const allDocs = [
      makeDoc('src/foo.ts', 10),
      makeDoc('src/foo.ts', 11),
      makeDoc('src/foo.ts', 12),
      makeDoc('src/foo.ts', 13),
      makeDoc('src/foo.ts', 14),
    ];
    // agreeing = 5, totalReviewers = 5, agreementRate = 100
    // base = Math.round(100 * 0.6 + 100 * 0.4) = 100
    // boost: Math.min(100, Math.round(100 * 1.2)) = 100 (capped)
    const result = computeL1Confidence(doc, allDocs, 5);
    expect(result).toBe(100);
  });

  it('2 reviewers agree → no penalty/boost (middle ground)', () => {
    const doc = makeDoc('src/foo.ts', 10, 80);
    const allDocs = [
      makeDoc('src/foo.ts', 10),
      makeDoc('src/foo.ts', 12),
      makeDoc('src/bar.ts', 100),
      makeDoc('src/baz.ts', 200),
      makeDoc('src/qux.ts', 300),
    ];
    // agreeing = 2, totalReviewers = 5, agreementRate = 40
    // base = Math.round(80 * 0.6 + 40 * 0.4) = Math.round(48 + 16) = 64
    // No penalty (agreeing != 1), no boost (agreeing < 3) → 64
    const result = computeL1Confidence(doc, allDocs, 5);
    expect(result).toBe(64);
  });

  it('2 active reviewers (1 agree) → no penalty (between sparse and dissent)', () => {
    const doc = makeDoc('src/foo.ts', 10, 80);
    const allDocs = [
      makeDoc('src/foo.ts', 10),
      makeDoc('src/bar.ts', 100),
    ];
    // agreeing = 1, activeReviewers = 2 — neither sparse (requires active===1)
    // nor dissent (requires active>=3). Middle ground: no penalty applied.
    // agreementRate = 50, base = Math.round(80 * 0.6 + 50 * 0.4) = 68
    const result = computeL1Confidence(doc, allDocs, 2, 100);
    expect(result).toBe(68);
  });

  // -------------------------------------------------------------------------
  // Lonely-high-severity extra penalty
  // -------------------------------------------------------------------------

  function makeCriticalDoc(filePath: string, lineStart: number, confidence?: number, severity: EvidenceDocument['severity'] = 'CRITICAL'): EvidenceDocument {
    return {
      issueTitle: 'Test',
      problem: 'Test problem',
      evidence: [],
      severity,
      suggestion: 'Fix it',
      filePath,
      lineRange: [lineStart, lineStart + 10],
      ...(confidence !== undefined && { confidence }),
    };
  }

  it('single-reviewer CRITICAL (1/5), small diff → extra ×0.75 on top of ×0.5', () => {
    const doc = makeCriticalDoc('src/foo.ts', 10, 80, 'CRITICAL');
    const allDocs = [
      makeCriticalDoc('src/foo.ts', 10, undefined, 'CRITICAL'),
      makeDoc('src/bar.ts', 100),
      makeDoc('src/baz.ts', 200),
      makeDoc('src/qux.ts', 300),
      makeDoc('src/quux.ts', 400),
    ];
    // base = Math.round(80 * 0.6 + 20 * 0.4) = 56
    // small-diff penalty 0.5, lonely-HS extra 0.75 → combined 0.375
    // Math.round(56 * 0.375) = Math.round(21) = 21
    const result = computeL1Confidence(doc, allDocs, 5, 100);
    expect(result).toBe(21);
  });

  it('single-reviewer HARSHLY_CRITICAL (1/5), small diff → same extra penalty as CRITICAL', () => {
    const doc = makeCriticalDoc('src/foo.ts', 10, 80, 'HARSHLY_CRITICAL');
    const allDocs = [
      makeCriticalDoc('src/foo.ts', 10, undefined, 'HARSHLY_CRITICAL'),
      makeDoc('src/bar.ts', 100),
      makeDoc('src/baz.ts', 200),
      makeDoc('src/qux.ts', 300),
      makeDoc('src/quux.ts', 400),
    ];
    const result = computeL1Confidence(doc, allDocs, 5, 100);
    expect(result).toBe(21);
  });

  it('single-reviewer CRITICAL (1/5), large diff → 0.7 × 0.75 = 0.525', () => {
    const doc = makeCriticalDoc('src/foo.ts', 10, 80, 'CRITICAL');
    const allDocs = [
      makeCriticalDoc('src/foo.ts', 10, undefined, 'CRITICAL'),
      makeDoc('src/bar.ts', 100),
      makeDoc('src/baz.ts', 200),
      makeDoc('src/qux.ts', 300),
      makeDoc('src/quux.ts', 400),
    ];
    // base = 56, penalty = 0.7 × 0.75 = 0.525, Math.round(56 * 0.525) = 29
    const result = computeL1Confidence(doc, allDocs, 5, 600);
    expect(result).toBe(29);
  });

  it('single-reviewer WARNING (1/5) → no extra penalty (only 0.5, unchanged)', () => {
    const doc = makeCriticalDoc('src/foo.ts', 10, 80, 'WARNING');
    const allDocs = [
      makeCriticalDoc('src/foo.ts', 10, undefined, 'WARNING'),
      makeDoc('src/bar.ts', 100),
      makeDoc('src/baz.ts', 200),
      makeDoc('src/qux.ts', 300),
      makeDoc('src/quux.ts', 400),
    ];
    // WARNING → no lonely-HS extra penalty, baseline 0.5 → 28 (matches existing behavior)
    const result = computeL1Confidence(doc, allDocs, 5, 100);
    expect(result).toBe(28);
  });

  it('single-reviewer SUGGESTION (1/5) → no extra penalty', () => {
    const doc = makeCriticalDoc('src/foo.ts', 10, 80, 'SUGGESTION');
    const allDocs = [
      makeCriticalDoc('src/foo.ts', 10, undefined, 'SUGGESTION'),
      makeDoc('src/bar.ts', 100),
      makeDoc('src/baz.ts', 200),
      makeDoc('src/qux.ts', 300),
      makeDoc('src/quux.ts', 400),
    ];
    const result = computeL1Confidence(doc, allDocs, 5, 100);
    expect(result).toBe(28);
  });

  it('corroborated CRITICAL (3/5) → no extra penalty (boost path only)', () => {
    const doc = makeCriticalDoc('src/foo.ts', 10, 80, 'CRITICAL');
    const allDocs = [
      makeCriticalDoc('src/foo.ts', 10, undefined, 'CRITICAL'),
      makeCriticalDoc('src/foo.ts', 12, undefined, 'CRITICAL'),
      makeCriticalDoc('src/foo.ts', 14, undefined, 'CRITICAL'),
      makeDoc('src/bar.ts', 100),
      makeDoc('src/baz.ts', 200),
    ];
    // agreeing = 3 → boost path, lonely-HS not triggered
    // base = 72, boost = 86 (from earlier test)
    const result = computeL1Confidence(doc, allDocs, 5);
    expect(result).toBe(86);
  });

  // -------------------------------------------------------------------------
  // Active-participants denominator — sparse regime (#462)
  // Observed scenario: 5 reviewers configured, 4 returned unparseable, only
  // 1 produced a finding. Orchestrator now passes activeReviewers=1, not 5.
  // -------------------------------------------------------------------------

  it('sparse: 1 active reviewer (4 others unparseable) → ×0.8 mild penalty', () => {
    const doc = makeDoc('src/foo.ts', 10, 80);
    const allDocs = [makeDoc('src/foo.ts', 10)];
    // agreeing=1, activeReviewers=1 → sparse branch (not dissent)
    // agreementRate = 100, base = Math.round(80 * 0.6 + 100 * 0.4) = 88
    // sparse penalty ×0.8 → Math.round(70.4) = 70
    const result = computeL1Confidence(doc, allDocs, 1, 100);
    expect(result).toBe(70);
  });

  it('sparse: CRITICAL severity does NOT get lonely-HS extra (no dissent signal)', () => {
    const doc = makeCriticalDoc('src/foo.ts', 10, 80, 'CRITICAL');
    const allDocs = [makeCriticalDoc('src/foo.ts', 10, undefined, 'CRITICAL')];
    // activeReviewers=1 → sparse branch, no extra lonely-HS multiplier
    // base = 88, ×0.8 = 70 (same as WARNING above — high severity doesn't
    // matter when we have zero dissent evidence)
    const result = computeL1Confidence(doc, allDocs, 1, 100);
    expect(result).toBe(70);
  });

  it('sparse regime preserves finding above uncertainty threshold for real bug scenario', () => {
    // Matches the #462 motivation: real bug, raw 60%, only 1 active reviewer.
    // Previously (pre-#462) this would have been 60%×0.5 = 30 (wrongly treated
    // as dissent). Now it's base × 0.8 → stays well above the 20% uncertain
    // threshold, so genuine single-reviewer finds don't get buried.
    const doc = makeDoc('src/foo.ts', 10, 60);
    const allDocs = [makeDoc('src/foo.ts', 10)];
    // base = Math.round(60 * 0.6 + 100 * 0.4) = 76, ×0.8 = Math.round(60.8) = 61
    const result = computeL1Confidence(doc, allDocs, 1, 100);
    expect(result).toBe(61);
    expect(result).toBeGreaterThan(20); // above uncertain threshold
  });
});
