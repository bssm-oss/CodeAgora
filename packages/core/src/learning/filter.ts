/**
 * Pattern Filter
 * Applies learned dismissed patterns to evidence documents,
 * suppressing or downgrading severity based on past dismissals.
 */

import type { EvidenceDocument } from '../types/core.js';
import { SEVERITY_ORDER } from '../types/core.js';
import type { DismissedPattern } from './store.js';

export interface FilterResult {
  filtered: EvidenceDocument[];
  downgraded: EvidenceDocument[];
  suppressed: EvidenceDocument[];
}

/**
 * Apply learned patterns to evidence docs.
 * - dismissCount >= threshold + action 'suppress' → remove from output
 * - dismissCount >= threshold + action 'downgrade' → reduce severity by one level
 * Docs that do not match any qualifying pattern pass through unchanged.
 */
export function applyLearnedPatterns(
  evidenceDocs: EvidenceDocument[],
  patterns: DismissedPattern[],
  threshold: number = 3,
): FilterResult {
  const filtered: EvidenceDocument[] = [];
  const downgraded: EvidenceDocument[] = [];
  const suppressed: EvidenceDocument[] = [];

  for (const doc of evidenceDocs) {
    const matchingPattern = patterns.find(
      (p) =>
        p.dismissCount >= threshold &&
        doc.issueTitle.toLowerCase().includes(p.pattern.toLowerCase()),
    );

    if (!matchingPattern) {
      filtered.push(doc);
      continue;
    }

    if (matchingPattern.action === 'suppress') {
      suppressed.push(doc);
    } else {
      // Downgrade severity by one level; stay at last level if already lowest
      const currentIdx = SEVERITY_ORDER.indexOf(doc.severity);
      const newSeverity =
        currentIdx < SEVERITY_ORDER.length - 1
          ? SEVERITY_ORDER[currentIdx + 1]!
          : doc.severity;
      downgraded.push({ ...doc, severity: newSeverity });
    }
  }

  return { filtered: [...filtered, ...downgraded], downgraded, suppressed };
}
