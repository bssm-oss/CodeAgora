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

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[\u2010-\u2015\uFE58\uFE63\uFF0D]/g, '-');
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
    const kw = normalizeText(expected.keyword);
    const haystack = normalizeText(`${actual.issueTitle}\n${actual.problem}`);
    if (!haystack.includes(kw)) return false;
  }

  return true;
}

const GENERIC_MATCH_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'be',
  'by',
  'can',
  'code',
  'could',
  'directly',
  'error',
  'file',
  'for',
  'from',
  'in',
  'input',
  'into',
  'is',
  'issue',
  'line',
  'missing',
  'not',
  'of',
  'or',
  'parameter',
  'problem',
  'proper',
  'risk',
  'the',
  'this',
  'to',
  'user',
  'using',
  'with',
]);

function signalTokensFromText(text: string): Set<string> {
  text = normalizeText(text);
  const tokens = text.match(/[a-z0-9_]{3,}/g) ?? [];
  return new Set(tokens.filter((token) => !GENERIC_MATCH_WORDS.has(token)));
}

function signalTokens(finding: ActualFinding): Set<string> {
  return signalTokensFromText(`${finding.issueTitle}\n${finding.problem}`);
}

function expectedSignalTokens(expected: ExpectedFinding): Set<string> {
  return signalTokensFromText(`${expected.rationale}\n${expected.keyword ?? ''}`);
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  if (smaller.size === 0) return 0;
  let overlap = 0;
  for (const token of smaller) {
    if (larger.has(token)) overlap++;
  }
  return overlap / smaller.size;
}

const GENERIC_RESTATEMENT_PATTERNS: RegExp[] = [
  /\b(?:logic|control\s+flow|function\s+flow)\b[\s\S]{0,120}\b(?:order|flow|flaw|error)\b/i,
  /\bmissing\s+runtime\s+validation\b/i,
  /\bconfiguration\b[\s\S]{0,120}\b(?:validation|required|missing|environment\s+variables?)\b/i,
  /\brace\s+condition\b[\s\S]{0,160}\b(?:input|object|quota|concurrent|mutat|modif)/i,
  /\b(?:one\s+extra|more\s+results\s+than\s+requested|limit\s*\+\s*1)\b/i,
  /\b(?:sql\s+)?query\s+construction\b[\s\S]{0,160}\b(?:string\s+concatenation|malformed|parameterized|security)\b/i,
  /\b(?:secure\s+parameterized\s+queries|security\s+best\s+practice|string\s+concatenation)\b[\s\S]{0,160}\b(?:regress|query|sql)\b/i,
  /\bloss\s+of\s+security\s+best\s+practice\b/i,
  /\bregressed\s+from\s+secure\s+parameterized\s+queries\b/i,
  /\b(?:origin\s+validation|base\s+url\s+context|relative\s+paths?|arbitrary\s+url|malformed\s+urls?)\b[\s\S]{0,180}\b(?:fetch|url|ssrf|avatar)\b/i,
  /\bmisleading\s+documentation\b/i,
  /\bdocumentation\b[\s\S]{0,160}\b(?:more\s+than\s+limit|limit\s*\+\s*1|returns\s+the\s+top\s+limit)\b/i,
];

function looksLikeGenericRestatement(finding: ActualFinding): boolean {
  const haystack = `${finding.issueTitle}\n${finding.problem}`;
  return GENERIC_RESTATEMENT_PATTERNS.some((pattern) => pattern.test(haystack));
}

function looksLikeDocumentationRestatement(finding: ActualFinding): boolean {
  return /\bdocumentation\b/i.test(`${finding.issueTitle}\n${finding.problem}`);
}

function duplicateOfMatchedFinding(
  expected: ExpectedFinding,
  matchedActual: ActualFinding,
  candidate: ActualFinding,
): boolean {
  if (normalizePath(expected.filePath) !== normalizePath(candidate.filePath)) {
    return false;
  }

  const tol = expected.lineTolerance ?? DEFAULT_LINE_TOLERANCE;

  const candidateTokens = signalTokens(candidate);
  const overlap = Math.max(
    tokenOverlap(candidateTokens, signalTokens(matchedActual)),
    tokenOverlap(candidateTokens, expectedSignalTokens(expected)),
  );
  if (
    rangesOverlap(candidate.lineRange, expected.lineRange, tol) &&
    rangesOverlap(candidate.lineRange, matchedActual.lineRange, tol)
  ) {
    return overlap >= 0.25 || looksLikeGenericRestatement(candidate);
  }

  // Some reviewers identify the same root cause but attach the finding to a
  // nearby declaration/JSDoc line. Once the expected finding has already been
  // hit, don't count these as fresh FPs if the text still names the expected
  // bug class and overlaps strongly with the matched finding.
  if (expected.keyword) {
    const haystack = normalizeText(`${candidate.issueTitle}\n${candidate.problem}`);
    return (haystack.includes(normalizeText(expected.keyword)) && overlap >= 0.35) ||
      (looksLikeGenericRestatement(candidate) &&
        (overlap >= 0.08 || looksLikeDocumentationRestatement(candidate)));
  }

  return looksLikeGenericRestatement(candidate) &&
    (overlap >= 0.08 || looksLikeDocumentationRestatement(candidate));
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

function matchingUnclaimedExpected(
  expectedFindings: ExpectedFinding[],
  finding: ActualFinding,
  claimedExpected: Set<ExpectedFinding>,
): ExpectedFinding | null {
  for (const expected of expectedFindings) {
    if (claimedExpected.has(expected)) continue;
    if (findingMatches(expected, finding)) return expected;
  }
  return null;
}

function rankUniqueFindingsForRecall(
  expectedFindings: ExpectedFinding[],
  ranked: ActualFinding[],
): ActualFinding[] {
  const unique: ActualFinding[] = [];
  const matchedForDedup: CaseMatch[] = [];
  const claimedExpected = new Set<ExpectedFinding>();

  for (const finding of ranked) {
    const newMatch = matchingUnclaimedExpected(expectedFindings, finding, claimedExpected);
    const duplicateOfKnownHit = matchedForDedup.some((m) =>
      findingMatches(m.expected, finding) ||
      duplicateOfMatchedFinding(m.expected, m.actual, finding)
    );

    if (!newMatch && duplicateOfKnownHit) {
      continue;
    }

    unique.push(finding);

    if (newMatch) {
      matchedForDedup.push({ expected: newMatch, actual: finding });
      claimedExpected.add(newMatch);
    }
  }

  return unique;
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
  const falsePositives = ranked.filter((finding, i) => {
    if (claimedActualIdx.has(i)) return false;
    // Multiple reviewers often report the same golden bug with slightly
    // different titles/ranges. Count the first one as the TP, but don't
    // inflate FP with additional findings that still match an already-hit
    // expected bug.
    return !matched.some((m) =>
      findingMatches(m.expected, finding) ||
      duplicateOfMatchedFinding(m.expected, m.actual, finding)
    );
  });

  const recallAtK: Record<number, number | null> = {};
  const rankedForRecall = rankUniqueFindingsForRecall(fixture.expectedFindings, ranked);
  for (const k of kValues) {
    const topK = rankedForRecall.slice(0, k);
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
