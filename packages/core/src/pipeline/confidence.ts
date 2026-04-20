import type { EvidenceDocument } from '../types/core.js';

export interface DiscussionVerdictLike {
  filePath: string;
  lineRange: [number, number];
  consensusReached: boolean;
  finalSeverity: string;
  rounds: number;
}

/**
 * L1 confidence: (agreeing reviewers / active reviewers) * 100
 *
 * "Agreeing" = docs at same filePath + similar lineRange (within ±5 lines).
 * "Active" = reviewers whose output was usable: either produced evidence doc(s)
 * or explicitly said "no issues". Reviewers that returned unparseable output
 * or forfeited (timeout / 5xx / auth error) are NOT counted toward the
 * denominator — they didn't effectively cast a vote.
 *
 * This corrects a false-positive-amplifier present in #432: when 4 of 5
 * reviewers failed to produce parseable output, the single surviving finding
 * was penalized as 1/5 "disagreement" even though 4 reviewers had simply
 * been silent. See #462 for context.
 */
export function computeL1Confidence(
  doc: EvidenceDocument,
  allDocs: EvidenceDocument[],
  activeReviewers: number,
  totalDiffLines?: number,
): number {
  if (activeReviewers <= 0) return 50;
  // Count LLM-source docs that flagged approximately the same location.
  // - Exclude `source === 'rule'`: static-analysis findings come from linters,
  //   not from the reviewer pool, so they should not inflate reviewer agreement.
  // - Clamp the rate at 100: a single reviewer can emit multiple docs at the
  //   same location (e.g. duplicate findings in one chunk), which would
  //   otherwise push agreeing > activeReviewers and yield a nonsensical rate.
  const agreeing = allDocs.filter(d =>
    d.source !== 'rule' &&
    d.filePath === doc.filePath &&
    Math.abs(d.lineRange[0] - doc.lineRange[0]) <= 5
  ).length;
  const agreementRate = Math.min(100, Math.round((agreeing / activeReviewers) * 100));

  let base: number;
  if (doc.confidence !== undefined && doc.confidence >= 0 && doc.confidence <= 100) {
    base = Math.round(doc.confidence * 0.6 + agreementRate * 0.4);
  } else {
    base = agreementRate;
  }

  // Corroboration scoring (#432, revised in #462)
  // Two distinct low-corroboration regimes require different treatment:
  //
  //   Dissent:  3+ reviewers active but only 1 agreed → strong FP signal,
  //             the others actively disagreed. Apply the original ×0.5
  //             penalty (or ×0.7 on large diffs to tolerate legitimate
  //             single-find discoveries in a wide-surface PR).
  //
  //   Sparse:   Only 1 reviewer active total (others were unparseable /
  //             forfeited). This is low sample size, not dissent. Mild
  //             ×0.8 penalty reflects uncertainty without punishing the
  //             finding for information we simply don't have.
  //
  // Lonely-high-severity extra penalty only applies to the dissent regime
  // — in sparse cases we cannot infer that other reviewers disagreed with
  // a CRITICAL claim; we just don't know what they would have said.
  if (agreeing === 1 && activeReviewers >= 3) {
    const isLargeDiff = (totalDiffLines ?? 0) > 500;
    let penalty = isLargeDiff ? 0.7 : 0.5;
    const isHighSeverity = doc.severity === 'CRITICAL' || doc.severity === 'HARSHLY_CRITICAL';
    if (isHighSeverity) penalty *= 0.75;
    base = Math.round(base * penalty);
  } else if (agreeing === 1 && activeReviewers === 1) {
    // Sparse regime: only one active reviewer, so we have no corroboration
    // signal at all (neither agreement nor disagreement). Apply a mild
    // penalty to reflect sample-size uncertainty.
    base = Math.round(base * 0.8);
  } else if (agreeing >= 3) {
    // Strong corroboration boost (capped at 100)
    base = Math.min(100, Math.round(base * 1.2));
  }

  return Math.max(0, Math.min(100, base));
}

/**
 * Adjust confidence after L2 discussion.
 * - consensus reached + not dismissed: +15
 * - consensus reached + dismissed: set to 0
 * - no consensus: -10
 * - bonus: +5 per round with consensus (cap 100)
 */
export function adjustConfidenceFromDiscussion(
  baseConfidence: number,
  verdict: DiscussionVerdictLike
): number {
  let adjusted = baseConfidence;
  if (verdict.consensusReached) {
    if (verdict.finalSeverity === 'DISMISSED') {
      return 0;
    }
    adjusted += 15;
    adjusted += Math.min(verdict.rounds, 3) * 5;
  } else {
    adjusted -= 10;
  }
  return Math.max(0, Math.min(100, adjusted));
}

/**
 * Returns confidence badge string for GitHub comments.
 */
export function getConfidenceBadge(confidence?: number): string {
  if (confidence == null) return '';
  if (confidence >= 80) return `🟢 ${confidence}%`;
  if (confidence >= 40) return `🟡 ${confidence}%`;
  return `🔴 ${confidence}%`;
}
