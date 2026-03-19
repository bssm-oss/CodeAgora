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
  totalReviewers: number
): number {
  if (totalReviewers <= 0) return 50;
  const agreeing = allDocs.filter(d =>
    d.filePath === doc.filePath &&
    Math.abs(d.lineRange[0] - doc.lineRange[0]) <= 5
  ).length;
  return Math.round((agreeing / totalReviewers) * 100);
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
