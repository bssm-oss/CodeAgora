/**
 * Pre-Debate Hallucination Filter (#428)
 * Validates evidence documents against the actual diff before L2 debate.
 *
 * 4 checks (zero model cost):
 * 1. File existence — filePath must be in diff file list
 * 2. Line range — lineRange must overlap at least one diff hunk
 * 3. Code quote — inline code quotes must exist in diff content
 * 4. Self-contradiction — finding must not contradict observed change direction
 *
 * Findings that fail checks 1-2 are hard-removed.
 * Checks 3-4 apply confidence penalties (soft) and may flag as uncertain.
 */

import type { EvidenceDocument } from '../types/core.js';
import { extractFileListFromDiff, parseDiffFileRanges } from '@codeagora/shared/utils/diff.js';

export interface FilterResult {
  filtered: EvidenceDocument[];
  removed: EvidenceDocument[];
  /** Findings removed with low confidence — available for human review. */
  uncertain: EvidenceDocument[];
}

/** Threshold below which a penalized finding becomes "uncertain" instead of filtered. */
const UNCERTAINTY_THRESHOLD = 20;

const HUNK_TOLERANCE = 10;

// ============================================================================
// Diff Analysis Helpers
// ============================================================================

/** Extract added (+) and removed (-) lines per file from unified diff. */
function parseDiffChangeDirection(diffContent: string): Map<string, { added: string[]; removed: string[] }> {
  const result = new Map<string, { added: string[]; removed: string[] }>();
  let currentFile: string | null = null;

  for (const line of diffContent.split('\n')) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/);
      currentFile = match?.[1] ?? null;
      if (currentFile && !result.has(currentFile)) {
        result.set(currentFile, { added: [], removed: [] });
      }
    } else if (currentFile) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        result.get(currentFile)!.added.push(line.slice(1));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        result.get(currentFile)!.removed.push(line.slice(1));
      }
    }
  }

  return result;
}

// Contradiction signal keywords
const ADDED_SIGNALS = ['added', 'introduced', 'new import', 'new variable', 'new function'];
const REMOVED_SIGNALS = ['removed', 'deleted', 'missing', 'no longer'];

/**
 * Check 4: Detect self-contradiction between finding description and diff.
 * Returns a penalty multiplier (0.5 for contradiction, 1.0 for no issue).
 */
function checkContradiction(
  doc: EvidenceDocument,
  changeMap: Map<string, { added: string[]; removed: string[] }>,
): number {
  const changes = changeMap.get(doc.filePath);
  if (!changes) return 1.0;

  const problemLower = doc.problem.toLowerCase();

  // Finding claims something was "added" but the file only has removals in that area
  const claimsAdded = ADDED_SIGNALS.some((s) => problemLower.includes(s));
  const claimsRemoved = REMOVED_SIGNALS.some((s) => problemLower.includes(s));

  if (claimsAdded && changes.added.length === 0 && changes.removed.length > 0) {
    return 0.5; // Contradicts: claims addition but only removals exist
  }
  if (claimsRemoved && changes.removed.length === 0 && changes.added.length > 0) {
    return 0.5; // Contradicts: claims removal but only additions exist
  }

  return 1.0;
}

// ============================================================================
// Main Filter
// ============================================================================

export function filterHallucinations(
  docs: EvidenceDocument[],
  diffContent: string,
): FilterResult {
  const diffFiles = new Set(extractFileListFromDiff(diffContent));
  const diffRanges = parseDiffFileRanges(diffContent);
  const changeMap = parseDiffChangeDirection(diffContent);

  // Build a map of file -> hunk ranges for quick lookup
  const hunkMap = new Map<string, Array<[number, number]>>();
  for (const { file, ranges } of diffRanges) {
    hunkMap.set(file, ranges);
  }

  const filtered: EvidenceDocument[] = [];
  const removed: EvidenceDocument[] = [];
  const uncertain: EvidenceDocument[] = [];

  for (const doc of docs) {
    // Skip rule-based findings (they come from static analysis, not LLM)
    if (doc.source === 'rule') {
      filtered.push(doc);
      continue;
    }

    // Check 1: File exists in diff
    if (doc.filePath !== 'unknown' && !diffFiles.has(doc.filePath)) {
      removed.push(doc);
      continue;
    }

    // Check 2: Line range overlaps with diff hunks
    if (doc.filePath !== 'unknown' && doc.lineRange[0] > 0) {
      const hunks = hunkMap.get(doc.filePath);
      if (hunks && hunks.length > 0) {
        const overlaps = hunks.some(([start, end]) =>
          doc.lineRange[0] <= end + HUNK_TOLERANCE &&
          doc.lineRange[1] >= start - HUNK_TOLERANCE
        );
        if (!overlaps) {
          removed.push(doc);
          continue;
        }
      }
    }

    // Check 3: Code quote verification
    const codeQuotes = doc.problem.match(/`([^`]{10,})`/g);
    if (codeQuotes && codeQuotes.length > 0) {
      let fabricatedCount = 0;
      for (const quote of codeQuotes) {
        const code = quote.slice(1, -1);
        if (!diffContent.includes(code)) {
          fabricatedCount++;
        }
      }
      if (fabricatedCount > codeQuotes.length / 2) {
        const penalized = Math.round((doc.confidence ?? 50) * 0.5);
        doc.confidence = penalized; // BC: legacy single-field confidence
      }
    }

    // Check 4: Self-contradiction detection
    const contradictionPenalty = checkContradiction(doc, changeMap);
    if (contradictionPenalty < 1.0) {
      const penalized = Math.round((doc.confidence ?? 50) * contradictionPenalty);
      doc.confidence = penalized; // BC: legacy single-field confidence
    }

    // ConfidenceTrace: record post-filter confidence (stage 2 of 5).
    // Always set before routing so uncertain-bucket docs also carry the trace.
    // Pass-through (no penalties applied) → filtered === raw.
    if (doc.confidence !== undefined) {
      doc.confidenceTrace = {
        ...(doc.confidenceTrace ?? {}),
        filtered: doc.confidence,
      };
    }

    // Route low-confidence findings to uncertain instead of filtered
    if ((doc.confidence ?? 50) < UNCERTAINTY_THRESHOLD) {
      uncertain.push(doc);
    } else {
      filtered.push(doc);
    }
  }

  return { filtered, removed, uncertain };
}
