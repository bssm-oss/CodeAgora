/**
 * Specificity Scorer
 * Scores review evidence quality immediately after L1 output.
 * Each criterion contributes 0.0–0.2, total range 0.0–1.0.
 */

import type { EvidenceDocument } from '../types/core.js';

// ============================================================================
// Patterns
// ============================================================================

const LINE_REF_PATTERN = /(?:line\s*\d+|:\d+[-–]\d+|L\d+)/i;
const CODE_TOKEN_PATTERN = /`[^`]+`|[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*|\b[a-z_]+_[a-z_]+\b/;
const ACTION_VERB_PATTERN = /\b(replace|change|use|add|remove|fix|refactor|implement|wrap|extract|rename|move|update|convert|validate|sanitize|escape|avoid|ensure|check|handle)\b/i;

// ============================================================================
// Types
// ============================================================================

export interface SpecificityBreakdown {
  hasLineRef: number;
  hasCodeToken: number;
  hasActionVerb: number;
  wordCount: number;
  hasSeverityRationale: number;
}

export interface SpecificityResult {
  score: number;
  breakdown: SpecificityBreakdown;
}

// ============================================================================
// Scoring
// ============================================================================

/**
 * Score a single evidence document for specificity.
 */
export function scoreSpecificity(doc: EvidenceDocument): SpecificityResult {
  const evidenceText = doc.evidence.join(' ');
  const allText = `${doc.problem} ${evidenceText}`;

  // 1. Line reference in evidence (+0.2)
  const hasLineRef = LINE_REF_PATTERN.test(allText) ? 0.2 : 0;

  // 2. Code token in evidence (+0.2)
  const hasCodeToken = CODE_TOKEN_PATTERN.test(allText) ? 0.2 : 0;

  // 3. Action verb in suggestion (+0.2)
  const hasActionVerb = ACTION_VERB_PATTERN.test(doc.suggestion) ? 0.2 : 0;

  // 4. Word count log-scaled (+0.0~0.2)
  const totalWords = allText.split(/\s+/).filter((w) => w.length > 0).length;
  const wordCountScore = Math.min(
    0.2,
    (Math.log2(totalWords + 1) / Math.log2(200)) * 0.2
  );

  // 5. Severity rationale: evidence has 2+ points and substantial problem text (+0.2)
  const hasSeverityRationale =
    doc.evidence.length >= 2 && doc.problem.length > 30 ? 0.2 : 0;

  const score =
    hasLineRef + hasCodeToken + hasActionVerb + wordCountScore + hasSeverityRationale;

  return {
    score: Math.round(score * 100) / 100,
    breakdown: {
      hasLineRef,
      hasCodeToken,
      hasActionVerb,
      wordCount: Math.round(wordCountScore * 100) / 100,
      hasSeverityRationale,
    },
  };
}

/**
 * Average specificity score across all evidence documents from a reviewer.
 */
export function scoreReviewerSpecificity(docs: EvidenceDocument[]): number {
  if (docs.length === 0) return 0;
  const scores = docs.map((doc) => scoreSpecificity(doc).score);
  return Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 100) / 100;
}
