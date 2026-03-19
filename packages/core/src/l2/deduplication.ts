/**
 * L2 Discussion Deduplication
 * Merges duplicate discussions discovered during rounds
 */

import type { Discussion } from '../types/core.js';

// ============================================================================
// Union-Find (Disjoint Set) for transitive duplicate grouping (L-16)
// ============================================================================

class UnionFind {
  parent: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // path compression
    }
    return this.parent[x];
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent[rb] = ra; // merge b's root into a's root
    }
  }
}

/**
 * Find duplicate discussions based on file location and issue similarity.
 * Uses Union-Find so A<->B and B<->C transitively groups A, B, C together (L-16).
 */
export function findDuplicates(discussions: Discussion[]): Map<string, string[]> {
  const n = discussions.length;
  const uf = new UnionFind(n);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (areDuplicates(discussions[i], discussions[j])) {
        uf.union(i, j);
      }
    }
  }

  // Group by root representative
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  // Build result: root id -> list of duplicate ids (excluding root itself)
  const duplicates = new Map<string, string[]>();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const primaryIdx = members[0]; // lowest index = primary
    const key = discussions[primaryIdx].id;
    duplicates.set(
      key,
      members.slice(1).map((idx) => discussions[idx].id)
    );
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

  // Check issue title similarity with adaptive threshold (L-17)
  const similarity = calculateTitleSimilarity(d1.issueTitle, d2.issueTitle);
  return similarity > similarityThreshold(d1.issueTitle, d2.issueTitle);
}

/**
 * Return effective Jaccard threshold.
 * Single-word titles (< 2 tokens on either side) use 0.8 to reduce false positives (L-17).
 * Titles with 2+ tokens use the standard 0.6 threshold.
 */
function similarityThreshold(title1: string, title2: string): number {
  const tokensA = title1.toLowerCase().split(/\s+/).filter(Boolean);
  const tokensB = title2.toLowerCase().split(/\s+/).filter(Boolean);
  const minTokens = Math.min(tokensA.length, tokensB.length);
  return minTokens < 2 ? 0.8 : 0.6;
}

function calculateTitleSimilarity(title1: string, title2: string): number {
  const words1 = new Set(title1.toLowerCase().split(/\s+/).filter(Boolean));
  const words2 = new Set(title2.toLowerCase().split(/\s+/).filter(Boolean));

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
