import { describe, expect, it } from 'vitest';
import { aggregate, scoreCase, type ActualFinding } from '../utils/golden-bug-scorer.js';
import { compareGoldenBugReports, type BenchmarkSummaryMetadata } from '../utils/golden-bug-compare.js';
import type { GoldenBugFixture } from '../types/golden-bug.js';

const recallFixture: GoldenBugFixture = {
  id: 'auth-bug',
  title: 'Auth bug',
  source: 'unit-test',
  category: 'hotfix',
  expectedFindings: [
    {
      filePath: 'src/auth.ts',
      lineRange: [10, 10],
      minSeverity: 'WARNING',
      rationale: 'missing authz check',
      keyword: 'authz',
    },
  ],
};

const fpFixture: GoldenBugFixture = {
  id: 'docs-clean',
  title: 'Docs only',
  source: 'unit-test',
  category: 'fp-regression',
  expectedFindings: [],
};

function finding(overrides: Partial<ActualFinding> = {}): ActualFinding {
  return {
    issueTitle: 'missing authz',
    problem: 'authz is not checked',
    severity: 'CRITICAL',
    filePath: 'src/auth.ts',
    lineRange: [10, 10],
    confidence: 80,
    ...overrides,
  };
}

function summary(fixtures: BenchmarkSummaryMetadata['fixtures']): BenchmarkSummaryMetadata {
  return {
    generatedAt: '2026-04-28T00:00:00.000Z',
    resultsDir: '/tmp/results',
    config: '/tmp/config.json',
    skipHead: false,
    fixtures,
    totals: {
      fixtures: fixtures.length,
      ok: fixtures.filter((f) => f.status === 'ok').length,
      errors: fixtures.filter((f) => f.status === 'error').length,
      durationMs: fixtures.reduce((sum, f) => sum + f.durationMs, 0),
      knownCostUsd: 0.01,
      hasUnknownCost: false,
      totalTokens: 100,
    },
  };
}

describe('compareGoldenBugReports()', () => {
  it('reports metric deltas and verdict flips', () => {
    const baseline = aggregate([
      scoreCase(recallFixture, [finding()]),
      scoreCase(fpFixture, []),
    ]);
    const candidate = aggregate([
      scoreCase(recallFixture, []),
      scoreCase(fpFixture, [finding({ filePath: 'docs/readme.md', lineRange: [1, 1] })]),
    ]);

    const comparison = compareGoldenBugReports(baseline, candidate, {
      baselineSummary: summary([
        { id: 'auth-bug', status: 'ok', findings: 1, durationMs: 10, decision: 'NEEDS_HUMAN' },
        { id: 'docs-clean', status: 'ok', findings: 0, durationMs: 10, decision: 'ACCEPT' },
      ]),
      candidateSummary: summary([
        { id: 'auth-bug', status: 'ok', findings: 0, durationMs: 20, decision: 'ACCEPT' },
        { id: 'docs-clean', status: 'ok', findings: 1, durationMs: 20, decision: 'REJECT' },
      ]),
    });

    expect(comparison.deltas).toMatchObject({
      truePositives: -1,
      falsePositives: 1,
      falseNegatives: 1,
      actualFindings: 0,
      durationMs: 20,
    });
    expect(comparison.verdicts).toEqual({
      compared: 2,
      flips: 2,
      falseAccepts: 1,
      falseRejects: 1,
    });
  });
});
