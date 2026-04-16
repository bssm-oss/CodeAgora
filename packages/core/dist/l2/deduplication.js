class UnionFind {
  parent;
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x) {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent[rb] = ra;
    }
  }
}
function findDuplicates(discussions) {
  const n = discussions.length;
  const uf = new UnionFind(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (areDuplicates(discussions[i], discussions[j])) {
        uf.union(i, j);
      }
    }
  }
  const groups = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }
  const duplicates = /* @__PURE__ */ new Map();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const primaryIdx = members[0];
    const key = discussions[primaryIdx].id;
    duplicates.set(
      key,
      members.slice(1).map((idx) => discussions[idx].id)
    );
  }
  return duplicates;
}
function areDuplicates(d1, d2) {
  if (d1.filePath !== d2.filePath) {
    return false;
  }
  const [start1, end1] = d1.lineRange;
  const [start2, end2] = d2.lineRange;
  const DEDUP_PROXIMITY = 15;
  const overlapsOrNearby = start1 <= end2 + DEDUP_PROXIMITY && start2 <= end1 + DEDUP_PROXIMITY;
  if (!overlapsOrNearby) {
    return false;
  }
  const similarity = calculateTitleSimilarity(d1.issueTitle, d2.issueTitle);
  return similarity > similarityThreshold(d1.issueTitle, d2.issueTitle);
}
function similarityThreshold(title1, title2) {
  const tokensA = title1.toLowerCase().split(/\s+/).filter(Boolean);
  const tokensB = title2.toLowerCase().split(/\s+/).filter(Boolean);
  const minTokens = Math.min(tokensA.length, tokensB.length);
  return minTokens < 2 ? 0.8 : 0.6;
}
function calculateTitleSimilarity(title1, title2) {
  const words1 = new Set(title1.toLowerCase().split(/\s+/).filter(Boolean));
  const words2 = new Set(title2.toLowerCase().split(/\s+/).filter(Boolean));
  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = /* @__PURE__ */ new Set([...words1, ...words2]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}
function mergeDiscussions(primary, duplicates) {
  const allEvidenceDocs = [
    ...primary.evidenceDocs,
    ...duplicates.flatMap((d) => d.evidenceDocs)
  ];
  const allRanges = [primary, ...duplicates].map((d) => d.lineRange);
  const minLine = Math.min(...allRanges.map((r) => r[0]));
  const maxLine = Math.max(...allRanges.map((r) => r[1]));
  const severities = {
    HARSHLY_CRITICAL: 4,
    CRITICAL: 3,
    WARNING: 2,
    SUGGESTION: 1
  };
  const allSeverities = [primary, ...duplicates].map((d) => d.severity);
  const highestSeverity = allSeverities.reduce(
    (max, s) => severities[s] > severities[max] ? s : max
  );
  return {
    ...primary,
    severity: highestSeverity,
    lineRange: [minLine, maxLine],
    evidenceDocs: Array.from(new Set(allEvidenceDocs)),
    // Remove duplicates
    issueTitle: `${primary.issueTitle} (merged with ${duplicates.length} duplicate(s))`
  };
}
function deduplicateDiscussions(discussions) {
  const duplicateMap = findDuplicates(discussions);
  const processed = /* @__PURE__ */ new Set();
  const result = [];
  for (const discussion of discussions) {
    if (processed.has(discussion.id)) {
      continue;
    }
    const duplicateIds = duplicateMap.get(discussion.id);
    if (duplicateIds && duplicateIds.length > 0) {
      const duplicateDiscussions = discussions.filter(
        (d) => duplicateIds.includes(d.id)
      );
      const merged = mergeDiscussions(discussion, duplicateDiscussions);
      result.push(merged);
      processed.add(discussion.id);
      duplicateIds.forEach((id) => processed.add(id));
    } else {
      result.push(discussion);
      processed.add(discussion.id);
    }
  }
  return {
    deduplicated: result,
    mergedCount: discussions.length - result.length
  };
}
export {
  deduplicateDiscussions,
  findDuplicates,
  mergeDiscussions
};
