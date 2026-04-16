const COMMENT_RE = /^\s*(\/\/|\/\*|\*\/|\*|#)/;
const BLANK_RE = /^\s*$/;
const IMPORT_RE = /^\s*(import |from |require\(|export .* from)/;
function matchesPattern(filePath, pattern) {
  const normalized = filePath.replace(/\\/g, "/");
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(prefix + "/");
  }
  if (pattern.startsWith("*.")) {
    const ext = pattern.slice(1);
    return normalized.endsWith(ext);
  }
  if (pattern.includes("*")) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(normalized);
  }
  return normalized === pattern;
}
function fileMatchesAnyPattern(filePath, patterns) {
  return patterns.some((p) => matchesPattern(filePath, p));
}
function parseDiff(diffContent) {
  const files = [];
  let current = null;
  for (const raw of diffContent.split("\n")) {
    if (raw.startsWith("+++ ")) {
      const path = raw.slice(4).replace(/^b\//, "");
      current = { filePath: path, changedLines: [] };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if ((raw.startsWith("+") || raw.startsWith("-")) && !raw.startsWith("+++") && !raw.startsWith("---")) {
      current.changedLines.push(raw.slice(1));
    }
  }
  return files;
}
function analyzeTrivialDiff(diffContent, config) {
  const empty = {
    isTrivial: true,
    reason: "blank-lines-only",
    stats: { totalLines: 0, codeLines: 0, commentLines: 0, blankLines: 0 }
  };
  if (!diffContent.trim()) return empty;
  const files = parseDiff(diffContent);
  if (files.length === 0) return empty;
  const allDocsOnly = files.every(
    (f) => fileMatchesAnyPattern(f.filePath, config.allowedFilePatterns)
  );
  if (allDocsOnly) {
    const allLines2 = files.flatMap((f) => f.changedLines);
    const totalLines2 = allLines2.length;
    const commentLines2 = allLines2.filter((l) => COMMENT_RE.test(l)).length;
    const blankLines2 = allLines2.filter((l) => BLANK_RE.test(l)).length;
    const codeLines = totalLines2 - commentLines2 - blankLines2;
    return {
      isTrivial: true,
      reason: "docs-only",
      stats: { totalLines: totalLines2, codeLines, commentLines: commentLines2, blankLines: blankLines2 }
    };
  }
  const nonDocsLines = files.filter((f) => !fileMatchesAnyPattern(f.filePath, config.allowedFilePatterns)).flatMap((f) => f.changedLines);
  const totalLines = nonDocsLines.length;
  const commentLines = nonDocsLines.filter((l) => COMMENT_RE.test(l)).length;
  const blankLines = nonDocsLines.filter((l) => BLANK_RE.test(l)).length;
  const importLines = nonDocsLines.filter((l) => IMPORT_RE.test(l)).length;
  const nonTrivialLines = totalLines - commentLines - blankLines - importLines;
  const allLines = files.flatMap((f) => f.changedLines);
  const statsTotal = allLines.length;
  const statsComment = allLines.filter((l) => COMMENT_RE.test(l)).length;
  const statsBlank = allLines.filter((l) => BLANK_RE.test(l)).length;
  const statsCode = statsTotal - statsComment - statsBlank;
  const stats = {
    totalLines: statsTotal,
    codeLines: statsCode,
    commentLines: statsComment,
    blankLines: statsBlank
  };
  if (nonTrivialLines === 0 && totalLines > 0) {
    if (commentLines > 0 && blankLines === 0 && importLines === 0) {
      return { isTrivial: true, reason: "comments-only", stats };
    }
    if (blankLines > 0 && commentLines === 0 && importLines === 0) {
      return { isTrivial: true, reason: "blank-lines-only", stats };
    }
    if (importLines > 0 && commentLines === 0 && blankLines === 0) {
      return { isTrivial: true, reason: "import-reorder", stats };
    }
    return { isTrivial: true, reason: "comments-only", stats };
  }
  return { isTrivial: false, stats };
}
export {
  analyzeTrivialDiff
};
