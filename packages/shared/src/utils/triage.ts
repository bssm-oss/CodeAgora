/**
 * Triage Classification
 * Shared logic for classifying evidence documents into must-fix / verify / ignore.
 * Used by CLI output, GitHub PR comments, desktop summaries, and MCP responses.
 */

import type { EvidenceDocument } from '../types/evidence.js';

// ============================================================================
// Types
// ============================================================================

export type TriageCategory = 'must-fix' | 'verify' | 'ignore';

export interface TriageResult {
  category: TriageCategory;
  doc: EvidenceDocument;
}

export interface TriageSummary {
  mustFix: EvidenceDocument[];
  verify: EvidenceDocument[];
  ignore: EvidenceDocument[];
  counts: { mustFix: number; verify: number; ignore: number };
}

// ============================================================================
// Classification
// ============================================================================

/**
 * Classify a single evidence document into a triage category.
 *
 * - must-fix: CRITICAL+ with confidence >50%
 * - verify:   CRITICAL+ with confidence ≤50%, or WARNING with confidence >50%
 * - ignore:   SUGGESTION, or confidence <20%
 */
export function classifyTriage(doc: EvidenceDocument): TriageCategory {
  const conf = doc.confidenceTrace?.final ?? doc.confidence ?? 50;

  if (conf < 20) return 'ignore';

  const isCritical = doc.severity === 'CRITICAL' || doc.severity === 'HARSHLY_CRITICAL';
  const isWarning = doc.severity === 'WARNING';

  if (isCritical && conf > 50) return 'must-fix';
  if ((isCritical && conf <= 50) || (isWarning && conf > 50)) return 'verify';
  return 'ignore';
}

/**
 * Classify all evidence documents and return grouped results.
 */
export function triageDocs(docs: EvidenceDocument[]): TriageSummary {
  const mustFix: EvidenceDocument[] = [];
  const verify: EvidenceDocument[] = [];
  const ignore: EvidenceDocument[] = [];

  for (const doc of docs) {
    const cat = classifyTriage(doc);
    if (cat === 'must-fix') mustFix.push(doc);
    else if (cat === 'verify') verify.push(doc);
    else ignore.push(doc);
  }

  return {
    mustFix,
    verify,
    ignore,
    counts: { mustFix: mustFix.length, verify: verify.length, ignore: ignore.length },
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format triage counts as a compact string.
 * Example: "2 must-fix · 1 verify · 3 ignore"
 */
export function formatTriageCounts(counts: TriageSummary['counts']): string {
  const parts: string[] = [];
  if (counts.mustFix > 0) parts.push(`${counts.mustFix} must-fix`);
  if (counts.verify > 0) parts.push(`${counts.verify} verify`);
  if (counts.ignore > 0) parts.push(`${counts.ignore} ignore`);
  return parts.join(' \u00B7 ') || 'no issues';
}
