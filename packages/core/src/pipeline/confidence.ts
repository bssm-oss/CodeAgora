import type { EvidenceDocument } from '../types/core.js';

export interface DiscussionVerdictLike {
  filePath: string;
  lineRange: [number, number];
  consensusReached: boolean;
  finalSeverity: string;
  rounds: number;
}

/**
 * L1 confidence: (agreeing reviewers / total reviewers) * 100
 * "Agreeing" = docs at same filePath + similar lineRange (within ±5 lines)
 */
export function computeL1Confidence(
  doc: EvidenceDocument,
  allDocs: EvidenceDocument[],
  totalReviewers: number,
  totalDiffLines?: number,
): number {
  if (totalReviewers <= 0) return 50;
  const agreeing = allDocs.filter(d =>
    d.filePath === doc.filePath &&
    Math.abs(d.lineRange[0] - doc.lineRange[0]) <= 5
  ).length;
  const agreementRate = Math.round((agreeing / totalReviewers) * 100);

  let base: number;
  if (doc.confidence !== undefined && doc.confidence >= 0 && doc.confidence <= 100) {
    base = Math.round(doc.confidence * 0.6 + agreementRate * 0.4);
  } else {
    base = agreementRate;
  }

  // Corroboration scoring (#432)
  // Single-reviewer findings are more likely hallucinations
  if (agreeing === 1 && totalReviewers >= 3) {
    // Diff-size correction: large diffs may have legitimate single-reviewer finds
    const isLargeDiff = (totalDiffLines ?? 0) > 500;
    let penalty = isLargeDiff ? 0.7 : 0.5;
    // Lonely-high-severity correction: a single reviewer declaring
    // CRITICAL/HARSHLY_CRITICAL with no independent corroboration is a
    // common false-positive mode — they may be pattern-matching on
    // security keywords without verifying the actual impact. Apply an
    // additional dampener so such claims land in verify/suggestion rather
    // than must-fix before L2 discussion has a chance to downgrade them.
    const isHighSeverity = doc.severity === 'CRITICAL' || doc.severity === 'HARSHLY_CRITICAL';
    if (isHighSeverity) penalty *= 0.75;
    base = Math.round(base * penalty);
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
