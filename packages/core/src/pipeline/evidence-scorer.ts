/**
 * Evidence quality scorer (#468).
 *
 * Produces a 0–1 score describing how *specific* and *verifiable* a
 * reviewer's evidence is. Used as hallucination-filter check 6 to
 * dampen confidence on vague, pattern-match-style findings (the FP
 * class the n=3 baseline exposed on `benchmarks/golden-bugs/fp-moderator-regex`).
 *
 * The scorer intentionally does not judge correctness — that is the
 * other checks' job. It measures surface features only: list length,
 * text length, and specificity-marker density.
 *
 * Three equally weighted sub-scores:
 *
 *   1. evidence list length (doc.evidence[]) — reviewers who can cite
 *      multiple corroborating lines tend to be grounded in the diff.
 *   2. problem text length — detailed failure narratives correlate
 *      with real understanding; one-liner problems correlate with
 *      template regurgitation.
 *   3. specificity-marker density in `problem` — file:line citations,
 *      backtick-wrapped identifiers, function/variable tokens. These
 *      are the lexical footprint of someone reading the diff rather
 *      than pattern-matching.
 *
 * Final score = (length + problemLength + specificity) / 3.
 *
 * Downstream multiplier (applied in hallucination-filter):
 *     conf × (0.7 + 0.3 × score)
 * giving a penalty range of [×0.7 (lowest quality), ×1.0 (highest)].
 *
 * Rule-based findings (`source === 'rule'`) should be excluded before
 * this scorer runs — static analysis evidence lives in a different
 * structural regime.
 */

import type { EvidenceDocument } from '../types/core.js';

// Sub-score 1: evidence[] length.
// 0 items → 0, 1 → 0.33, 2 → 0.67, ≥3 → 1.0
function scoreEvidenceCount(doc: EvidenceDocument): number {
  const n = doc.evidence?.length ?? 0;
  if (n === 0) return 0;
  if (n === 1) return 0.33;
  if (n === 2) return 0.67;
  return 1.0;
}

// Sub-score 2: problem text length.
// Piecewise: <50ch → 0, <100 → 0.5, <300 → 0.8, ≥300 → 1.0
function scoreProblemLength(doc: EvidenceDocument): number {
  const len = doc.problem?.length ?? 0;
  if (len < 50) return 0;
  if (len < 100) return 0.5;
  if (len < 300) return 0.8;
  return 1.0;
}

/**
 * Sub-score 3: specificity markers in the problem text.
 *
 * Each matcher contributes at most one hit (not multiple overlaps) to
 * keep the scale bounded and insensitive to padding. Five markers map
 * to five hit buckets: 0 → 0, 1 → 0.2, 2 → 0.5, 3 → 0.7, ≥4 → 1.0.
 *
 * Designed conservatively — markers must look like code or citations,
 * not just any capitalised word. Generic English should score 0.
 */
const SPECIFICITY_MATCHERS: RegExp[] = [
  // file:line or path:line citations, e.g. `moderator.ts:755`
  /\b[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cpp|c|h)\b(?::\d+)?/i,
  // backtick-wrapped identifiers or code, e.g. `parseForcedDecisionJson`
  /`[A-Za-z_$][\w$.]*(?:\([^)]*\))?`/,
  // explicit line citation ("line 755" / "lines 12-18")
  /\bline(?:s)?\s+\d+(?:\s*[-–]\s*\d+)?\b/i,
  // camelCase or snake_case identifier (at least one separator)
  /\b(?:[a-z]+[A-Z][A-Za-z0-9]+|[a-z]+_[a-z]+[\w_]*)\b/,
  // function invocation pattern, e.g. `foo(bar)` outside backticks
  /\b[A-Za-z_$][\w$]*\s*\(\s*[^)]{0,40}\)/,
];

function scoreSpecificity(doc: EvidenceDocument): number {
  const text = doc.problem ?? '';
  let hits = 0;
  for (const rx of SPECIFICITY_MATCHERS) {
    if (rx.test(text)) hits++;
  }
  if (hits === 0) return 0;
  if (hits === 1) return 0.2;
  if (hits === 2) return 0.5;
  if (hits === 3) return 0.7;
  return 1.0;
}

/**
 * Compute the evidence quality score for a single document.
 * Returns a value in [0, 1], rounded to three decimals for stable
 * serialisation.
 */
export function scoreEvidence(doc: EvidenceDocument): number {
  const a = scoreEvidenceCount(doc);
  const b = scoreProblemLength(doc);
  const c = scoreSpecificity(doc);
  const raw = (a + b + c) / 3;
  return Math.round(raw * 1000) / 1000;
}

/** Multiplier derived from the score: 0.7 + 0.3 × score. */
export function evidenceMultiplier(score: number): number {
  const clamped = Math.max(0, Math.min(1, score));
  return 0.7 + 0.3 * clamped;
}

export const __internal = {
  scoreEvidenceCount,
  scoreProblemLength,
  scoreSpecificity,
  SPECIFICITY_MATCHERS,
};
