import { extractFileListFromDiff, parseDiffFileRanges } from "@codeagora/shared/utils/diff.js";
const UNCERTAINTY_THRESHOLD = 20;
const HUNK_TOLERANCE = 10;
function parseDiffChangeDirection(diffContent) {
  const result = /* @__PURE__ */ new Map();
  let currentFile = null;
  for (const line of diffContent.split("\n")) {
    if (line.startsWith("diff --git")) {
      const match = line.match(/b\/(.+)$/);
      currentFile = match?.[1] ?? null;
      if (currentFile && !result.has(currentFile)) {
        result.set(currentFile, { added: [], removed: [] });
      }
    } else if (currentFile) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        result.get(currentFile).added.push(line.slice(1));
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        result.get(currentFile).removed.push(line.slice(1));
      }
    }
  }
  return result;
}
const ADDED_SIGNALS = ["added", "introduced", "new import", "new variable", "new function"];
const REMOVED_SIGNALS = ["removed", "deleted", "missing", "no longer"];
function checkContradiction(doc, changeMap) {
  const changes = changeMap.get(doc.filePath);
  if (!changes) return 1;
  const problemLower = doc.problem.toLowerCase();
  const claimsAdded = ADDED_SIGNALS.some((s) => problemLower.includes(s));
  const claimsRemoved = REMOVED_SIGNALS.some((s) => problemLower.includes(s));
  if (claimsAdded && changes.added.length === 0 && changes.removed.length > 0) {
    return 0.5;
  }
  if (claimsRemoved && changes.removed.length === 0 && changes.added.length > 0) {
    return 0.5;
  }
  return 1;
}
function filterHallucinations(docs, diffContent) {
  const diffFiles = new Set(extractFileListFromDiff(diffContent));
  const diffRanges = parseDiffFileRanges(diffContent);
  const changeMap = parseDiffChangeDirection(diffContent);
  const hunkMap = /* @__PURE__ */ new Map();
  for (const { file, ranges } of diffRanges) {
    hunkMap.set(file, ranges);
  }
  const filtered = [];
  const removed = [];
  const uncertain = [];
  for (const doc of docs) {
    if (doc.source === "rule") {
      filtered.push(doc);
      continue;
    }
    if (doc.filePath !== "unknown" && !diffFiles.has(doc.filePath)) {
      removed.push(doc);
      continue;
    }
    if (doc.filePath !== "unknown" && doc.lineRange[0] > 0) {
      const hunks = hunkMap.get(doc.filePath);
      if (hunks && hunks.length > 0) {
        const overlaps = hunks.some(
          ([start, end]) => doc.lineRange[0] <= end + HUNK_TOLERANCE && doc.lineRange[1] >= start - HUNK_TOLERANCE
        );
        if (!overlaps) {
          removed.push(doc);
          continue;
        }
      }
    }
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
        doc.confidence = Math.round((doc.confidence ?? 50) * 0.5);
      }
    }
    const contradictionPenalty = checkContradiction(doc, changeMap);
    if (contradictionPenalty < 1) {
      doc.confidence = Math.round((doc.confidence ?? 50) * contradictionPenalty);
    }
    if ((doc.confidence ?? 50) < UNCERTAINTY_THRESHOLD) {
      uncertain.push(doc);
    } else {
      filtered.push(doc);
    }
  }
  return { filtered, removed, uncertain };
}
export {
  filterHallucinations
};
