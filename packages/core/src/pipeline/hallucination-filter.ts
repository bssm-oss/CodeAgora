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

    // Check 4: Self-contradiction — finding admits the issue is already handled
    if (detectSelfContradiction(doc)) {
      doc.confidence = Math.round((doc.confidence ?? 50) * 0.3);
    }

    filtered.push(doc);
  }

  return { filtered, removed };
}

const SELF_CONTRADICTION_PATTERNS = [
  /already\s+(?:handled|checked|validated|prevented|avoided|guarded|addressed)/i,
  /prior\s+check/i,
  /(?:is|are)\s+avoided\s+due\s+to/i,
  /not\s+a\s+concern/i,
  /already\s+returns?\s+(?:early|before|50|default)/i,
  /(?:guard|check)\s+(?:above|before|prevents?|ensures?)/i,
  /however.*(?:is|are)\s+(?:already|properly)\s+(?:handled|checked)/i,
];

/**
 * Detect findings that contradict themselves by admitting the issue is handled.
 * Example: "Division by zero possible" + evidence "avoided due to prior check"
 */
export function detectSelfContradiction(doc: EvidenceDocument): boolean {
  const text = [doc.problem, ...doc.evidence, doc.suggestion].join(' ');
  return SELF_CONTRADICTION_PATTERNS.some(p => p.test(text));
}

/**
 * Deduplicate evidence documents at the individual finding level.
 * Merges findings on the same file + overlapping line range + similar title.
 * Keeps highest confidence, combines evidence lists.
 */
export function deduplicateEvidence(docs: EvidenceDocument[]): EvidenceDocument[] {
  if (docs.length <= 1) return docs;

  const result: EvidenceDocument[] = [];
  const merged = new Set<number>();

  for (let i = 0; i < docs.length; i++) {
    if (merged.has(i)) continue;

    let primary = { ...docs[i], evidence: [...docs[i].evidence] };

    for (let j = i + 1; j < docs.length; j++) {
      if (merged.has(j)) continue;

      if (shouldMergeEvidence(primary, docs[j])) {
        // Merge: keep higher confidence, combine evidence
        if ((docs[j].confidence ?? 0) > (primary.confidence ?? 0)) {
          primary.confidence = docs[j].confidence;
        }
        // Add unique evidence items
        for (const e of docs[j].evidence) {
          if (!primary.evidence.includes(e)) {
            primary.evidence.push(e);
          }
        }
        merged.add(j);
      }
    }

    result.push(primary);
  }

  return result;
}

function shouldMergeEvidence(a: EvidenceDocument, b: EvidenceDocument): boolean {
  // Same file
  if (a.filePath !== b.filePath) return false;

  // Overlapping line ranges (within 10 lines)
  const LINE_TOLERANCE = 10;
  if (a.lineRange[0] > b.lineRange[1] + LINE_TOLERANCE ||
      b.lineRange[0] > a.lineRange[1] + LINE_TOLERANCE) return false;

  // Similar titles (Jaccard > 0.5)
  const titleSim = jaccardSimilarity(a.issueTitle, b.issueTitle);
  return titleSim > 0.5;
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}
