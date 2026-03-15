/**
 * L2 Discussion Deduplication
 * Merges duplicate discussions discovered during rounds
 */

import type { Discussion } from '../types/core.js';

/**
 * Find duplicate discussions based on file location and issue similarity
 */
export function findDuplicates(discussions: Discussion[]): Map<string, string[]> {
  const duplicates = new Map<string, string[]>();

  for (let i = 0; i < discussions.length; i++) {
    for (let j = i + 1; j < discussions.length; j++) {
      const d1 = discussions[i];
      const d2 = discussions[j];

      if (areDuplicates(d1, d2)) {
        const key = d1.id; // Keep first as primary
        if (!duplicates.has(key)) {
          duplicates.set(key, []);
        }
        duplicates.get(key)!.push(d2.id);
      }
    }
  }

  return duplicates;
}

/**
 * Check if two discussions are duplicates
 */
function areDuplicates(d1: Discussion, d2: Discussion): boolean {
  // Same file and overlapping line ranges
  if (d1.filePath !== d2.filePath) {
    return false;
  }

  const [start1, end1] = d1.lineRange;
  const [start2, end2] = d2.lineRange;

  // Check for overlap
  const overlaps = start1 <= end2 && start2 <= end1;
  if (!overlaps) {
    return false;
  }

  // Check issue title similarity (Jaccard similarity)
  const similarity = calculateTitleSimilarity(d1.issueTitle, d2.issueTitle);
  return similarity > 0.6; // 60% similarity threshold
}

function calculateTitleSimilarity(title1: string, title2: string): number {
  const words1 = new Set(title1.toLowerCase().split(/\s+/));
  const words2 = new Set(title2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Merge duplicate discussions
 */
export function mergeDiscussions(
  primary: Discussion,
  duplicates: Discussion[]
): Discussion {
  // Combine evidence documents
  const allEvidenceDocs = [
    ...primary.evidenceDocs,
    ...duplicates.flatMap((d) => d.evidenceDocs),
  ];

  // Expand line range to cover all duplicates
  const allRanges = [primary, ...duplicates].map((d) => d.lineRange);
  const minLine = Math.min(...allRanges.map((r) => r[0]));
  const maxLine = Math.max(...allRanges.map((r) => r[1]));

  // Use highest severity
  const severities: Record<string, number> = {
    HARSHLY_CRITICAL: 4,
    CRITICAL: 3,
    WARNING: 2,
    SUGGESTION: 1,
  };

  const allSeverities = [primary, ...duplicates].map((d) => d.severity);
  const highestSeverity = allSeverities.reduce((max, s) =>
    severities[s] > severities[max] ? s : max
  );

  return {
    ...primary,
    severity: highestSeverity,
    lineRange: [minLine, maxLine],
    evidenceDocs: Array.from(new Set(allEvidenceDocs)), // Remove duplicates
    issueTitle: `${primary.issueTitle} (merged with ${duplicates.length} duplicate(s))`,
  };
}

/**
 * Apply deduplication to discussion list
 */
export function deduplicateDiscussions(discussions: Discussion[]): {
  deduplicated: Discussion[];
  mergedCount: number;
} {
  const duplicateMap = findDuplicates(discussions);
  const processed = new Set<string>();
  const result: Discussion[] = [];

  for (const discussion of discussions) {
    if (processed.has(discussion.id)) {
      continue;
    }

    const duplicateIds = duplicateMap.get(discussion.id);

    if (duplicateIds && duplicateIds.length > 0) {
      // This is a primary with duplicates
      const duplicateDiscussions = discussions.filter((d) =>
        duplicateIds.includes(d.id)
      );

      const merged = mergeDiscussions(discussion, duplicateDiscussions);
      result.push(merged);

      // Mark all as processed
      processed.add(discussion.id);
      duplicateIds.forEach((id) => processed.add(id));
    } else {
      // No duplicates, add as-is
      result.push(discussion);
      processed.add(discussion.id);
    }
  }

  return {
    deduplicated: result,
    mergedCount: discussions.length - result.length,
  };
}
