import { describe, it, expect } from 'vitest';
import {
  computeL1Confidence,
  adjustConfidenceFromDiscussion,
  getConfidenceBadge,
} from '@codeagora/core/pipeline/confidence.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';

const makeDoc = (overrides?: Partial<EvidenceDocument>): EvidenceDocument => ({
  issueTitle: 'Test issue',
  problem: 'A problem',
  evidence: [],
  severity: 'WARNING',
  suggestion: 'Fix it',
  filePath: 'src/foo.ts',
  lineRange: [10, 12],
  ...overrides,
});

describe('computeL1Confidence', () => {
  it('returns 60 when 3/5 reviewers flag same location', () => {
    const doc = makeDoc({ filePath: 'src/foo.ts', lineRange: [10, 12] });
    const allDocs = [
      makeDoc({ filePath: 'src/foo.ts', lineRange: [10, 12] }),
      makeDoc({ filePath: 'src/foo.ts', lineRange: [10, 12] }),
      makeDoc({ filePath: 'src/foo.ts', lineRange: [10, 12] }),
      makeDoc({ filePath: 'src/bar.ts', lineRange: [10, 12] }), // different file
      makeDoc({ filePath: 'src/foo.ts', lineRange: [50, 55] }), // different line
    ];
    expect(computeL1Confidence(doc, allDocs, 5)).toBe(60);
  });

  it('returns 100 when all reviewers flag same location', () => {
    const doc = makeDoc({ filePath: 'src/foo.ts', lineRange: [10, 12] });
    const allDocs = [
      makeDoc({ filePath: 'src/foo.ts', lineRange: [10, 12] }),
      makeDoc({ filePath: 'src/foo.ts', lineRange: [10, 12] }),
      makeDoc({ filePath: 'src/foo.ts', lineRange: [10, 12] }),
    ];
    expect(computeL1Confidence(doc, allDocs, 3)).toBe(100);
  });

  it('returns 20 when 1/5 reviewers flag location', () => {
    const doc = makeDoc({ filePath: 'src/foo.ts', lineRange: [10, 12] });
    const allDocs = [
      makeDoc({ filePath: 'src/foo.ts', lineRange: [10, 12] }),
      makeDoc({ filePath: 'src/bar.ts', lineRange: [10, 12] }),
      makeDoc({ filePath: 'src/baz.ts', lineRange: [10, 12] }),
      makeDoc({ filePath: 'src/qux.ts', lineRange: [10, 12] }),
    ];
    expect(computeL1Confidence(doc, allDocs, 5)).toBe(20);
  });

  it('returns 50 when totalReviewers is 0', () => {
    const doc = makeDoc();
    expect(computeL1Confidence(doc, [doc], 0)).toBe(50);
  });

  it('matches docs within ±5 line range', () => {
    const doc = makeDoc({ filePath: 'src/foo.ts', lineRange: [10, 12] });
    const allDocs = [
      makeDoc({ filePath: 'src/foo.ts', lineRange: [10, 12] }), // exact
      makeDoc({ filePath: 'src/foo.ts', lineRange: [15, 17] }), // +5 → in range
      makeDoc({ filePath: 'src/foo.ts', lineRange: [5, 7] }),   // -5 → in range
      makeDoc({ filePath: 'src/foo.ts', lineRange: [16, 18] }), // +6 → out of range
    ];
    // 3 agree (10, 15, 5 all within ±5 of 10)
    expect(computeL1Confidence(doc, allDocs, 4)).toBe(75);
  });
});

describe('adjustConfidenceFromDiscussion', () => {
  it('boosts by +15 on consensus reached', () => {
    const verdict = {
      filePath: 'src/foo.ts',
      lineRange: [10, 12] as [number, number],
      consensusReached: true,
      finalSeverity: 'CRITICAL',
      rounds: 0,
    };
    expect(adjustConfidenceFromDiscussion(50, verdict)).toBe(65);
  });

  it('sets to 0 on consensus with DISMISSED', () => {
    const verdict = {
      filePath: 'src/foo.ts',
      lineRange: [10, 12] as [number, number],
      consensusReached: true,
      finalSeverity: 'DISMISSED',
      rounds: 2,
    };
    expect(adjustConfidenceFromDiscussion(80, verdict)).toBe(0);
  });

  it('penalizes by -10 on no consensus', () => {
    const verdict = {
      filePath: 'src/foo.ts',
      lineRange: [10, 12] as [number, number],
      consensusReached: false,
      finalSeverity: 'WARNING',
      rounds: 1,
    };
    expect(adjustConfidenceFromDiscussion(50, verdict)).toBe(40);
  });

  it('adds +5 per round with consensus (max 3 rounds bonus)', () => {
    const verdict = {
      filePath: 'src/foo.ts',
      lineRange: [10, 12] as [number, number],
      consensusReached: true,
      finalSeverity: 'CRITICAL',
      rounds: 3,
    };
    // base 50 + 15 + (min(3,3)*5 = 15) = 80
    expect(adjustConfidenceFromDiscussion(50, verdict)).toBe(80);

    // rounds > 3 still capped at 3 bonus rounds
    const verdict4 = { ...verdict, rounds: 10 };
    expect(adjustConfidenceFromDiscussion(50, verdict4)).toBe(80);
  });

  it('clamps between 0 and 100', () => {
    const verdictHigh = {
      filePath: 'src/foo.ts',
      lineRange: [10, 12] as [number, number],
      consensusReached: true,
      finalSeverity: 'CRITICAL',
      rounds: 3,
    };
    expect(adjustConfidenceFromDiscussion(100, verdictHigh)).toBe(100);

    const verdictLow = {
      filePath: 'src/foo.ts',
      lineRange: [10, 12] as [number, number],
      consensusReached: false,
      finalSeverity: 'WARNING',
      rounds: 0,
    };
    expect(adjustConfidenceFromDiscussion(5, verdictLow)).toBe(0);
  });
});

describe('getConfidenceBadge', () => {
  it('returns green for 80+', () => {
    expect(getConfidenceBadge(80)).toBe('🟢 80%');
    expect(getConfidenceBadge(100)).toBe('🟢 100%');
  });

  it('returns yellow for 40-79', () => {
    expect(getConfidenceBadge(40)).toBe('🟡 40%');
    expect(getConfidenceBadge(79)).toBe('🟡 79%');
  });

  it('returns red for 0-39', () => {
    expect(getConfidenceBadge(0)).toBe('🔴 0%');
    expect(getConfidenceBadge(39)).toBe('🔴 39%');
  });

  it('returns empty string for undefined', () => {
    expect(getConfidenceBadge(undefined)).toBe('');
    expect(getConfidenceBadge()).toBe('');
  });
});
