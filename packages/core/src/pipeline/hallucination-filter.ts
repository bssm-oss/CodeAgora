/**
 * Pre-Debate Hallucination Filter (#428)
 * Validates evidence documents against the actual diff before L2 debate.
 *
 * 6 checks (zero model cost):
 * 1. File existence — filePath must be in diff file list
 * 2. Line range — lineRange must overlap at least one diff hunk
 * 3. Code quote — inline code quotes must exist in diff content
 * 4. Self-contradiction — finding must not contradict observed change direction
 * 5. Speculative language — hedge markers in problem/suggestion dampen confidence
 * 6. Evidence quality (#468) — vague/short evidence dampens confidence
 *
 * Findings that fail checks 1-2 are hard-removed.
 * Checks 3-6 apply confidence penalties (soft) and may flag as uncertain.
 */

import type { EvidenceDocument } from '../types/core.js';
import { extractFileListFromDiff, parseDiffFileRanges } from '@codeagora/shared/utils/diff.js';
import { scoreEvidence, evidenceMultiplier } from './evidence-scorer.js';

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
 * Hedge / speculative-language markers (Check 5).
 *
 * Reviewers often flag concerns they can't verify from the diff alone
 * (e.g. "model may not exist on provider", "could fail at runtime"). The
 * severity label may still be CRITICAL while the wording signals low
 * conviction. Dampening confidence on these markers nudges such findings
 * toward the verify/uncertain bucket instead of must-fix.
 *
 * Kept conservative: each pattern requires a specific speculative
 * collocation (not just the word "may") to avoid false matches on
 * legitimate hedged descriptions of diff-local bugs.
 */
const SPECULATIVE_MARKERS: RegExp[] = [
  /\b(?:may|might|could)\b\s+(?:\w+\s+){0,2}(?:not|fail|break|cause|lead|be|exist|return|throw|work|support|allow|have|leak|crash)\b/i,
  /\bpotentially\s+(?:unsupported|broken|incorrect|missing|invalid|unavailable|unsafe|insecure)\b/i,
  /\bpossibly\b/i,
  /\bperhaps\b/i,
  /\bunverifi(?:ed|able)\b/i,
  /\bappears?\s+to\b/i,
  /\bseems?\s+to\b/i,
  /\bassum(?:e|ed|ing)\b/i,
  /\bunclear\b/i,
  /\bnot\s+(?:sure|certain|confirmed|verified)\b/i,
  /\bcan'?t\s+(?:verify|confirm)\b/i,
];

const SPECULATION_PENALTY = 0.7;

/**
 * Check 5: Detect speculative/hedge language signaling low reviewer conviction.
 * Returns a penalty multiplier (0.7 on hit, 1.0 otherwise).
 */
function checkSpeculation(doc: EvidenceDocument): number {
  const haystack = `${doc.problem}\n${doc.suggestion ?? ''}`;
  return SPECULATIVE_MARKERS.some((p) => p.test(haystack)) ? SPECULATION_PENALTY : 1.0;
}

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

    // Check 5: Speculative language penalty — hedge words dampen confidence
    const speculationPenalty = checkSpeculation(doc);
    if (speculationPenalty < 1.0) {
      const penalized = Math.round((doc.confidence ?? 50) * speculationPenalty);
      doc.confidence = penalized; // BC: legacy single-field confidence
    }

    // Check 6 (#468): Evidence quality penalty — vague/short evidence
    // dampens confidence. The FP class exposed by the #472 baseline
    // (short template-style problem text, no file:line citations, no
    // backtick identifiers) scores low here and gets the full ×0.7.
    const evScore = scoreEvidence(doc);
    const evMultiplier = evidenceMultiplier(evScore);
    if (evMultiplier < 1.0) {
      const penalized = Math.round((doc.confidence ?? 50) * evMultiplier);
      doc.confidence = penalized; // BC: legacy single-field confidence
    }

    // ConfidenceTrace: record post-filter confidence + evidence quality.
    // Always set before routing so uncertain-bucket docs also carry the
    // trace. Pass-through (no penalties) → filtered === raw.
    if (doc.confidence !== undefined) {
      doc.confidenceTrace = {
        ...(doc.confidenceTrace ?? {}),
        filtered: doc.confidence,
        evidence: evScore,
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
