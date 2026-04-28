import type { AggregateReport } from './golden-bug-scorer.js';

export type BenchmarkDecision = 'ACCEPT' | 'REJECT' | 'NEEDS_HUMAN';

export interface BenchmarkSummaryFixture {
  id: string;
  findings: number;
  status: 'ok' | 'error';
  durationMs: number;
  decision?: BenchmarkDecision;
  performance?: {
    totalCalls?: number;
    totalLatencyMs?: number;
    averageLatencyMs?: number;
    totalTokens?: number;
    totalCost?: string;
  };
  error?: string;
}

export interface BenchmarkSummaryMetadata {
  generatedAt: string;
  resultsDir: string;
  config: string;
  skipHead: boolean;
  fixtures: BenchmarkSummaryFixture[];
  totals: {
    fixtures: number;
    ok: number;
    errors: number;
    durationMs: number;
    knownCostUsd: number;
    hasUnknownCost: boolean;
    totalTokens: number;
  };
}

export interface GoldenBugComparison {
  baseline: AggregateReport;
  candidate: AggregateReport;
  deltas: {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    actualFindings: number;
    precision: number | null;
    recall: number | null;
    f1: number | null;
    fpCleanRate: number | null;
    durationMs?: number;
    totalTokens?: number;
    knownCostUsd?: number;
  };
  verdicts: {
    compared: number;
    flips: number;
    falseAccepts: number;
    falseRejects: number;
  };
  perFixture: Array<{
    fixtureId: string;
    isFpRegression: boolean;
    baselineDecision?: BenchmarkDecision;
    candidateDecision?: BenchmarkDecision;
    verdictFlip: boolean;
    falseAccept: boolean;
    falseReject: boolean;
    baseline: {
      truePositives: number;
      falsePositives: number;
      falseNegatives: number;
      actualFindings: number;
    };
    candidate: {
      truePositives: number;
      falsePositives: number;
      falseNegatives: number;
      actualFindings: number;
    };
  }>;
}

function deltaNumber(a: number, b: number): number {
  return b - a;
}

function deltaRatio(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return b - a;
}

function fixtureMap(summary?: BenchmarkSummaryMetadata): Map<string, BenchmarkSummaryFixture> {
  return new Map((summary?.fixtures ?? []).map((f) => [f.id, f]));
}

export function compareGoldenBugReports(
  baseline: AggregateReport,
  candidate: AggregateReport,
  opts: {
    baselineSummary?: BenchmarkSummaryMetadata;
    candidateSummary?: BenchmarkSummaryMetadata;
  } = {},
): GoldenBugComparison {
  const baselineFixtures = new Map(baseline.perCase.map((r) => [r.fixtureId, r]));
  const baselineSummary = fixtureMap(opts.baselineSummary);
  const candidateSummary = fixtureMap(opts.candidateSummary);

  const perFixture = candidate.perCase.map((candidateCase) => {
    const baselineCase = baselineFixtures.get(candidateCase.fixtureId);
    const baselineMeta = baselineSummary.get(candidateCase.fixtureId);
    const candidateMeta = candidateSummary.get(candidateCase.fixtureId);
    const baselineDecision = baselineMeta?.decision;
    const candidateDecision = candidateMeta?.decision;
    const verdictFlip = Boolean(
      baselineDecision &&
      candidateDecision &&
      baselineDecision !== candidateDecision,
    );
    const falseAccept = !candidateCase.isFpRegression &&
      candidateDecision === 'ACCEPT';
    const falseReject = candidateCase.isFpRegression &&
      candidateDecision === 'REJECT';

    return {
      fixtureId: candidateCase.fixtureId,
      isFpRegression: candidateCase.isFpRegression,
      baselineDecision,
      candidateDecision,
      verdictFlip,
      falseAccept,
      falseReject,
      baseline: {
        truePositives: baselineCase?.metrics.truePositives ?? 0,
        falsePositives: baselineCase?.metrics.falsePositives ?? 0,
        falseNegatives: baselineCase?.metrics.falseNegatives ?? 0,
        actualFindings: baselineCase?.metrics.actualFindings ?? 0,
      },
      candidate: {
        truePositives: candidateCase.metrics.truePositives,
        falsePositives: candidateCase.metrics.falsePositives,
        falseNegatives: candidateCase.metrics.falseNegatives,
        actualFindings: candidateCase.metrics.actualFindings,
      },
    };
  });

  const compared = perFixture.filter((f) => f.baselineDecision && f.candidateDecision).length;

  return {
    baseline,
    candidate,
    deltas: {
      truePositives: deltaNumber(baseline.metrics.truePositives, candidate.metrics.truePositives),
      falsePositives: deltaNumber(baseline.metrics.falsePositives, candidate.metrics.falsePositives),
      falseNegatives: deltaNumber(baseline.metrics.falseNegatives, candidate.metrics.falseNegatives),
      actualFindings: deltaNumber(baseline.metrics.actualFindings, candidate.metrics.actualFindings),
      precision: deltaRatio(baseline.metrics.precision, candidate.metrics.precision),
      recall: deltaRatio(baseline.metrics.recall, candidate.metrics.recall),
      f1: deltaRatio(baseline.metrics.f1, candidate.metrics.f1),
      fpCleanRate: deltaRatio(baseline.metrics.fpCleanRate, candidate.metrics.fpCleanRate),
      ...(opts.baselineSummary && opts.candidateSummary
        ? {
            durationMs: deltaNumber(opts.baselineSummary.totals.durationMs, opts.candidateSummary.totals.durationMs),
            totalTokens: deltaNumber(opts.baselineSummary.totals.totalTokens, opts.candidateSummary.totals.totalTokens),
            knownCostUsd: Number(
              deltaNumber(opts.baselineSummary.totals.knownCostUsd, opts.candidateSummary.totals.knownCostUsd)
                .toFixed(6),
            ),
          }
        : {}),
    },
    verdicts: {
      compared,
      flips: perFixture.filter((f) => f.verdictFlip).length,
      falseAccepts: perFixture.filter((f) => f.falseAccept).length,
      falseRejects: perFixture.filter((f) => f.falseReject).length,
    },
    perFixture,
  };
}
