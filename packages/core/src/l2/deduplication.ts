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

  // Check for overlap or proximity (within 15 lines, matching threshold.ts)
  const DEDUP_PROXIMITY = 15;
  const overlapsOrNearby = start1 <= end2 + DEDUP_PROXIMITY && start2 <= end1 + DEDUP_PROXIMITY;
  if (!overlapsOrNearby) {
    return false;
  }

  if (hasSameRootCauseSignal(d1, d2)) {
    return true;
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

const ROOT_CAUSE_CLASSES: Array<[string, RegExp]> = [
  ['authz', /\b(authz|authori[sz]ation|permission|privilege|role|rbac|admin|access control|bypass)\b/i],
  ['authn', /\b(authn|authentication|login|session|token|jwt|cookie|credential)\b/i],
  ['secret', /\b(secret|api[_ -]?key|private[_ -]?key|credential|password|env|fallback)\b/i],
  ['injection', /\b(sql|command|shell|template|ldap|xpath|injection|sanitize|escape)\b/i],
  ['xss', /\b(xss|cross-site|html injection|innerhtml|script)\b/i],
  ['race', /\b(race|concurren|stale|cache|async|await|promise|timing)\b/i],
  ['null', /\b(null|undefined|nil|none|optional|dereference)\b/i],
  ['path', /\b(path traversal|directory traversal|\.\.\/|filepath|filename)\b/i],
  ['crypto', /\b(crypto|encrypt|decrypt|hash|random|nonce|iv|cipher)\b/i],
  ['resource', /\b(leak|resource|close|dispose|connection|handle)\b/i],
];

const GENERIC_REVIEW_WORDS = new Set([
  'bug',
  'issue',
  'problem',
  'risk',
  'missing',
  'possible',
  'potential',
  'critical',
  'warning',
  'suggestion',
  'allows',
  'allow',
  'could',
  'should',
  'may',
  'review',
  'code',
]);

function discussionText(discussion: Discussion): string {
  return [
    discussionIssueText(discussion),
    discussion.codeSnippet,
  ].join(' ');
}

function discussionIssueText(discussion: Discussion): string {
  const evidenceText = discussion.evidenceContent
    ?.flatMap((doc) => [
      doc.issueTitle,
      doc.problem,
      doc.suggestion,
      ...doc.evidence,
    ])
    .join(' ') ?? '';

  return [
    discussion.issueTitle,
    evidenceText,
  ].join(' ');
}

function rootCauseClasses(discussion: Discussion): Set<string> {
  const text = discussionIssueText(discussion);
  return new Set(
    ROOT_CAUSE_CLASSES
      .filter(([, pattern]) => pattern.test(text))
      .map(([name]) => name)
  );
}

function normalizedSignalTokens(discussion: Discussion): Set<string> {
  const tokens = discussionText(discussion)
    .toLowerCase()
    .match(/[a-z0-9_$]{3,}/g) ?? [];

  return new Set(
    tokens.filter((token) => !GENERIC_REVIEW_WORDS.has(token))
  );
}

function tokenOverlapScore(a: Set<string>, b: Set<string>): number {
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  if (smaller.size === 0) return 0;

  let overlap = 0;
  for (const token of smaller) {
    if (larger.has(token)) overlap++;
  }
  return overlap / smaller.size;
}

function hasSameRootCauseSignal(d1: Discussion, d2: Discussion): boolean {
  const classes1 = rootCauseClasses(d1);
  const classes2 = rootCauseClasses(d2);
  const sharedClass = [...classes1].some((className) => classes2.has(className));
  if (!sharedClass) {
    return false;
  }

  const tokens1 = normalizedSignalTokens(d1);
  const tokens2 = normalizedSignalTokens(d2);
  return tokenOverlapScore(tokens1, tokens2) >= 0.35;
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
