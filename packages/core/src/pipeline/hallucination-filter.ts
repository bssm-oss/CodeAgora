/**
 * Pre-Debate Hallucination Filter (#428)
 * Validates evidence documents against the actual diff before L2 debate.
 * Removes findings that reference non-existent files, lines outside diff
 * hunks, or fabricated code quotes. Zero model cost.
 */

import type { EvidenceDocument } from '../types/core.js';
import { extractFileListFromDiff, parseDiffFileRanges } from '@codeagora/shared/utils/diff.js';

export interface FilterResult {
  filtered: EvidenceDocument[];
  removed: EvidenceDocument[];
}

/**
 * Filter out hallucinated evidence documents.
 *
 * Checks:
 * 1. File existence: filePath must be in diff file list
 * 2. Line range: lineRange must overlap with at least one diff hunk for that file
 * 3. Code quote: inline code in problem text should exist in diff
 */
export function filterHallucinations(
  docs: EvidenceDocument[],
  diffContent: string,
): FilterResult {
  const diffFiles = new Set(extractFileListFromDiff(diffContent));
  const diffRanges = parseDiffFileRanges(diffContent);

  // Build a map of file -> hunk ranges for quick lookup
  const hunkMap = new Map<string, Array<[number, number]>>();
  for (const { file, ranges } of diffRanges) {
    hunkMap.set(file, ranges);
  }

  const filtered: EvidenceDocument[] = [];
  const removed: EvidenceDocument[] = [];

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
        const HUNK_TOLERANCE = 10; // Allow some tolerance for context lines
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
    // Extract inline code from problem text (backtick-wrapped)
    const codeQuotes = doc.problem.match(/`([^`]{10,})`/g);
    if (codeQuotes && codeQuotes.length > 0) {
      let fabricatedCount = 0;
      for (const quote of codeQuotes) {
        const code = quote.slice(1, -1); // Remove backticks
        if (!diffContent.includes(code)) {
          fabricatedCount++;
        }
      }
      // If majority of code quotes are fabricated, penalize confidence
      if (fabricatedCount > codeQuotes.length / 2) {
        doc.confidence = Math.round((doc.confidence ?? 50) * 0.5);
      }
    }

    filtered.push(doc);
  }

  return { filtered, removed };
}
