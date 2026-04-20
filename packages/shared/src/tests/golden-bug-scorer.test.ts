import { describe, it, expect } from 'vitest';
import {
  GoldenBugFixtureSchema,
  type GoldenBugFixture,
} from '../types/golden-bug.js';
import {
  scoreCase,
  aggregate,
  type ActualFinding,
  __internal,
} from '../utils/golden-bug-scorer.js';

const { normalizePath, rangesOverlap, findingMatches } = __internal;

function fixture(over: Partial<GoldenBugFixture> = {}): GoldenBugFixture {
  return GoldenBugFixtureSchema.parse({
    id: 'demo-bug',
    title: 'Demo',
    source: 'unit-test',
    category: 'test',
    expectedFindings: [
      {
        filePath: 'src/foo.ts',
        lineRange: [10, 12],
        minSeverity: 'WARNING',
        rationale: 'off-by-one in loop',
      },
    ],
    ...over,
  });
}

function finding(over: Partial<ActualFinding> = {}): ActualFinding {
  return {
    issueTitle: 'title',
    problem: 'problem',
    severity: 'CRITICAL',
    filePath: 'src/foo.ts',
    lineRange: [11, 11],
    confidence: 70,
    ...over,
  };
}

describe('GoldenBugFixtureSchema', () => {
  it('rejects non-kebab-case id', () => {
    expect(() =>
      GoldenBugFixtureSchema.parse({
        id: 'Bad_ID',
        title: 't',
        source: 's',
        category: 'c',
        expectedFindings: [],
      }),
    ).toThrow();
  });

  it('allows empty expectedFindings (FP regression case)', () => {
    const fx = GoldenBugFixtureSchema.parse({
      id: 'fp-case',
      title: 't',
      source: 's',
      category: 'fp-regression',
      expectedFindings: [],
    });
    expect(fx.expectedFindings).toEqual([]);
  });

  it('rejects inverted lineRange (start > end)', () => {
    expect(() =>
      GoldenBugFixtureSchema.parse({
        id: 'inverted',
        title: 't',
        source: 's',
        category: 'hotfix',
        expectedFindings: [
          {
            filePath: 'a.ts',
            lineRange: [12, 10],
            minSeverity: 'WARNING',
            rationale: 'r',
          },
        ],
      }),
    ).toThrow(/non-inverted/);
  });
});

describe('matching primitives', () => {
  it('normalizePath handles backslashes and leading ./', () => {
    expect(normalizePath('.\\src\\foo.ts')).toBe('src/foo.ts');
    expect(normalizePath('./src/foo.ts')).toBe('src/foo.ts');
  });

  it('rangesOverlap honors tolerance at edges', () => {
    expect(rangesOverlap([20, 22], [10, 10], 10)).toBe(true);
    expect(rangesOverlap([21, 21], [10, 10], 10)).toBe(false);
  });

  it('findingMatches rejects mismatched file', () => {
    expect(
      findingMatches(fixture().expectedFindings[0], finding({ filePath: 'src/bar.ts' })),
    ).toBe(false);
  });

  it('findingMatches rejects below-threshold severity', () => {
    const fx = fixture({
      expectedFindings: [
        {
          filePath: 'src/foo.ts',
          lineRange: [10, 12],
          minSeverity: 'CRITICAL',
          rationale: 'r',
        },
      ],
    });
    expect(findingMatches(fx.expectedFindings[0], finding({ severity: 'WARNING' }))).toBe(false);
    expect(findingMatches(fx.expectedFindings[0], finding({ severity: 'CRITICAL' }))).toBe(true);
    expect(
      findingMatches(fx.expectedFindings[0], finding({ severity: 'HARSHLY_CRITICAL' })),
    ).toBe(true);
  });

  it('findingMatches enforces keyword when present', () => {
    const fx = fixture({
      expectedFindings: [
        {
          filePath: 'src/foo.ts',
          lineRange: [10, 12],
          minSeverity: 'WARNING',
          rationale: 'r',
          keyword: 'off-by-one',
        },
      ],
    });
    expect(
      findingMatches(fx.expectedFindings[0], finding({ issueTitle: 'unrelated', problem: 'unrelated' })),
    ).toBe(false);
    expect(
      findingMatches(fx.expectedFindings[0], finding({ issueTitle: 'OFF-BY-ONE in loop', problem: 'p' })),
    ).toBe(true);
  });
});

describe('scoreCase — recall path', () => {
  it('reports hit + recall=1 when a matching finding exists', () => {
    const fx = fixture();
    const result = scoreCase(fx, [finding()]);
    expect(result.isFpRegression).toBe(false);
    expect(result.matched).toHaveLength(1);
    expect(result.missed).toHaveLength(0);
    expect(result.recallAtK[3]).toBe(1);
    expect(result.recallAtK[5]).toBe(1);
  });

  it('misses when no finding overlaps line range within tolerance', () => {
    const fx = fixture();
    const result = scoreCase(fx, [finding({ lineRange: [100, 101] })]);
    expect(result.matched).toHaveLength(0);
    expect(result.missed).toHaveLength(1);
    expect(result.recallAtK[3]).toBe(0);
  });

  it('prefers high-severity findings when computing recall@k', () => {
    const fx = fixture();
    // 5 low-severity noise, plus one real match buried last
    const noise: ActualFinding[] = Array.from({ length: 5 }, (_, i) =>
      finding({
        filePath: `src/unrelated-${i}.ts`,
        severity: 'SUGGESTION',
        confidence: 20,
      }),
    );
    const real = finding({ severity: 'HARSHLY_CRITICAL', confidence: 90 });
    const result = scoreCase(fx, [...noise, real]);
    // Severity ranking lifts the real finding into top-1
    expect(result.recallAtK[3]).toBe(1);
  });

  it('claims each actual finding to at most one expected', () => {
    const fx = fixture({
      expectedFindings: [
        {
          filePath: 'src/foo.ts',
          lineRange: [10, 12],
          minSeverity: 'WARNING',
          rationale: 'bug A',
        },
        {
          filePath: 'src/foo.ts',
          lineRange: [11, 11],
          minSeverity: 'WARNING',
          rationale: 'bug B',
        },
      ],
    });
    // One actual finding. Should hit exactly one expected, not both.
    const result = scoreCase(fx, [finding()]);
    expect(result.matched).toHaveLength(1);
    expect(result.missed).toHaveLength(1);
    expect(result.recallAtK[3]).toBe(0.5);
  });
});

describe('scoreCase — FP regression path', () => {
  it('isFpRegression=true when expectedFindings empty', () => {
    const fx = fixture({ expectedFindings: [] });
    const result = scoreCase(fx, []);
    expect(result.isFpRegression).toBe(true);
    expect(result.falsePositives).toEqual([]);
    expect(result.recallAtK[3]).toBeNull();
  });

  it('lists all actual findings as falsePositives', () => {
    const fx = fixture({ expectedFindings: [] });
    const result = scoreCase(fx, [finding(), finding({ filePath: 'src/other.ts' })]);
    expect(result.falsePositives).toHaveLength(2);
  });
});

describe('aggregate', () => {
  it('averages recall across only recall cases', () => {
    const recall = fixture();
    const fp = fixture({ id: 'fp-case', expectedFindings: [], category: 'fp-regression' });

    const results = [
      scoreCase(recall, [finding()]),           // recall=1
      scoreCase(recall, []),                    // recall=0
      scoreCase(fp, [finding()]),               // FP triggered, no recall
    ];
    const report = aggregate(results);
    expect(report.totalCases).toBe(3);
    expect(report.recallCases).toBe(2);
    expect(report.fpRegressionCases).toBe(1);
    expect(report.meanRecallAtK[3]).toBe(0.5);
    expect(report.fpRegressionsTriggered).toBe(1);
  });

  it('returns 0 mean recall when no recall cases exist', () => {
    const fp = fixture({ id: 'fp-only', expectedFindings: [], category: 'fp-regression' });
    const report = aggregate([scoreCase(fp, [])]);
    expect(report.meanRecallAtK[3]).toBe(0);
    expect(report.fpRegressionsTriggered).toBe(0);
  });
});
