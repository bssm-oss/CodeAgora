/**
 * Golden-bug recall@k scorer (#472)
 *
 * Matches review findings against a golden-bug fixture and emits a structured
 * result used by `scripts/bench-fn.mjs` to compute aggregate metrics.
 *
 * Matching rules (for recall cases, `fixture.expectedFindings` non-empty):
 *   - filePath must match exactly (normalized to forward slashes)
 *   - [actualStart, actualEnd] must overlap [expectedStart - tol, expectedEnd + tol]
 *   - actual severity rank >= expected.minSeverity rank
 *   - keyword (if set) must appear case-insensitively in issueTitle or problem
 *
 * FP regression cases (expectedFindings=[]) treat any actual finding as a
 * regression — `falsePositives` contains the offending findings.
 */

import type { Severity } from '../types/severity.js';
import {
  DEFAULT_LINE_TOLERANCE,
  type ExpectedFinding,
  type GoldenBugFixture,
} from '../types/golden-bug.js';

export interface ActualFinding {
  issueTitle: string;
  problem: string;
  severity: Severity;
  filePath: string;
  lineRange: [number, number];
  confidence?: number;
}

export interface CaseMatch {
  expected: ExpectedFinding;
  actual: ActualFinding;
}

export interface CaseResult {
  fixtureId: string;
  category: string;
  isFpRegression: boolean;
  matched: CaseMatch[];
  missed: ExpectedFinding[];
  falsePositives: ActualFinding[];
  metrics: {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    actualFindings: number;
    expectedFindings: number;
  };
  /** recall@k for several k values. For FP cases, recall is undefined. */
  recallAtK: Record<number, number | null>;
}

const SEVERITY_RANK: Record<Severity, number> = {
  HARSHLY_CRITICAL: 4,
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

function rangesOverlap(
  a: [number, number],
  b: [number, number],
  tolerance: number,
): boolean {
  const [aStart, aEnd] = a;
  const [bStart, bEnd] = b;
  return aStart <= bEnd + tolerance && aEnd >= bStart - tolerance;
}

function findingMatches(
  expected: ExpectedFinding,
  actual: ActualFinding,
): boolean {
  if (normalizePath(expected.filePath) !== normalizePath(actual.filePath)) {
    return false;
  }

  const tol = expected.lineTolerance ?? DEFAULT_LINE_TOLERANCE;
  if (!rangesOverlap(actual.lineRange, expected.lineRange, tol)) {
    return false;
  }

  if (SEVERITY_RANK[actual.severity] < SEVERITY_RANK[expected.minSeverity]) {
    return false;
  }

  if (expected.keyword) {
    const kw = expected.keyword.toLowerCase();
    const haystack = `${actual.issueTitle}\n${actual.problem}`.toLowerCase();
    if (!haystack.includes(kw)) return false;
  }

  return true;
}

/**
 * Rank actual findings (highest priority first) so recall@k picks the
 * review's own top candidates. Severity dominates; confidence breaks ties.
 */
function rankFindings(findings: ActualFinding[]): ActualFinding[] {
  return [...findings].sort((a, b) => {
    const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sevDiff !== 0) return sevDiff;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });
}

export interface ScoreOptions {
  /** k values to compute recall at. Defaults to [3, 5, 10]. */
  kValues?: number[];
}

export function scoreCase(
  fixture: GoldenBugFixture,
  actual: ActualFinding[],
  options: ScoreOptions = {},
): CaseResult {
  const kValues = options.kValues ?? [3, 5, 10];
  const isFpRegression = fixture.expectedFindings.length === 0;

  if (isFpRegression) {
    return {
      fixtureId: fixture.id,
      category: fixture.category,
      isFpRegression: true,
      matched: [],
      missed: [],
      falsePositives: [...actual],
      metrics: {
        truePositives: 0,
        falsePositives: actual.length,
        falseNegatives: 0,
        actualFindings: actual.length,
        expectedFindings: 0,
      },
      recallAtK: Object.fromEntries(kValues.map((k) => [k, null])),
    };
  }

  const ranked = rankFindings(actual);
  const matched: CaseMatch[] = [];
  const claimedActualIdx = new Set<number>();

  for (const expected of fixture.expectedFindings) {
    for (let i = 0; i < ranked.length; i++) {
      if (claimedActualIdx.has(i)) continue;
      if (findingMatches(expected, ranked[i])) {
        matched.push({ expected, actual: ranked[i] });
        claimedActualIdx.add(i);
        break;
      }
    }
  }

  const matchedExpected = new Set(matched.map((m) => m.expected));
  const missed = fixture.expectedFindings.filter((e) => !matchedExpected.has(e));
  const falsePositives = ranked.filter((_, i) => !claimedActualIdx.has(i));

  const recallAtK: Record<number, number | null> = {};
  for (const k of kValues) {
    const topK = ranked.slice(0, k);
    let hits = 0;
    const claimedInK = new Set<number>();
    for (const expected of fixture.expectedFindings) {
      for (let i = 0; i < topK.length; i++) {
        if (claimedInK.has(i)) continue;
        if (findingMatches(expected, topK[i])) {
          hits += 1;
          claimedInK.add(i);
          break;
        }
      }
    }
    recallAtK[k] = hits / fixture.expectedFindings.length;
  }

  return {
    fixtureId: fixture.id,
    category: fixture.category,
    isFpRegression: false,
    matched,
    missed,
    falsePositives,
    metrics: {
      truePositives: matched.length,
      falsePositives: falsePositives.length,
      falseNegatives: missed.length,
      actualFindings: actual.length,
      expectedFindings: fixture.expectedFindings.length,
    },
    recallAtK,
  };
}

export interface AggregateReport {
  totalCases: number;
  recallCases: number;
  fpRegressionCases: number;
  meanRecallAtK: Record<number, number>;
  fpRegressionsTriggered: number;
  metrics: {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    actualFindings: number;
    expectedFindings: number;
    precision: number | null;
    recall: number | null;
    f1: number | null;
    fpCleanRate: number | null;
  };
  perCase: CaseResult[];
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function aggregate(
  results: CaseResult[],
  kValues: number[] = [3, 5, 10],
): AggregateReport {
  const recallCases = results.filter((r) => !r.isFpRegression);
  const fpCases = results.filter((r) => r.isFpRegression);

  const meanRecallAtK: Record<number, number> = {};
  for (const k of kValues) {
    if (recallCases.length === 0) {
      meanRecallAtK[k] = 0;
      continue;
    }
    const sum = recallCases.reduce((acc, r) => acc + (r.recallAtK[k] ?? 0), 0);
    meanRecallAtK[k] = sum / recallCases.length;
  }

  return {
    totalCases: results.length,
    recallCases: recallCases.length,
    fpRegressionCases: fpCases.length,
    meanRecallAtK,
    fpRegressionsTriggered: fpCases.filter((r) => r.falsePositives.length > 0).length,
    metrics: aggregateMetrics(results, fpCases),
    perCase: results,
  };
}

function aggregateMetrics(
  results: CaseResult[],
  fpCases: CaseResult[],
): AggregateReport['metrics'] {
  const truePositives = results.reduce((sum, r) => sum + r.metrics.truePositives, 0);
  const falsePositives = results.reduce((sum, r) => sum + r.metrics.falsePositives, 0);
  const falseNegatives = results.reduce((sum, r) => sum + r.metrics.falseNegatives, 0);
  const actualFindings = results.reduce((sum, r) => sum + r.metrics.actualFindings, 0);
  const expectedFindings = results.reduce((sum, r) => sum + r.metrics.expectedFindings, 0);
  const precision = ratio(truePositives, truePositives + falsePositives);
  const recall = ratio(truePositives, truePositives + falseNegatives);
  const f1 = precision === null || recall === null || precision + recall === 0
    ? null
    : (2 * precision * recall) / (precision + recall);
  const cleanFpCases = fpCases.filter((r) => r.metrics.falsePositives === 0).length;

  return {
    truePositives,
    falsePositives,
    falseNegatives,
    actualFindings,
    expectedFindings,
    precision,
    recall,
    f1,
    fpCleanRate: ratio(cleanFpCases, fpCases.length),
  };
}

export const __internal = { SEVERITY_RANK, normalizePath, rangesOverlap, findingMatches };
