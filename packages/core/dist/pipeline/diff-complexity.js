const SECURITY_PATTERNS = [
  /auth/i,
  /crypto/i,
  /secret/i,
  /password/i,
  /token/i,
  /session/i,
  /permission/i,
  /credential/i,
  /security/i,
  /\.env/,
  /config\/.*key/i
];
function estimateDiffComplexity(diffContent) {
  const lines = diffContent.split("\n");
  let addedLines = 0;
  let removedLines = 0;
  const files = /* @__PURE__ */ new Set();
  const securityFiles = /* @__PURE__ */ new Set();
  let currentFile = "";
  for (const line of lines) {
    const fileMatch = /^(?:diff --git a\/|[+]{3} b\/)(.+)/.exec(line);
    if (fileMatch) {
      currentFile = fileMatch[1];
      files.add(currentFile);
      if (SECURITY_PATTERNS.some((p) => p.test(currentFile))) {
        securityFiles.add(currentFile);
      }
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      addedLines++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removedLines++;
    }
  }
  const totalLines = addedLines + removedLines;
  const fileCount = files.size;
  let level;
  if (totalLines <= 50 && fileCount <= 3) level = "LOW";
  else if (totalLines <= 200 && fileCount <= 10) level = "MEDIUM";
  else if (totalLines <= 500 && fileCount <= 25) level = "HIGH";
  else level = "VERY_HIGH";
  if (securityFiles.size > 0 && level === "LOW") level = "MEDIUM";
  if (securityFiles.size > 2 && level === "MEDIUM") level = "HIGH";
  const estimatedTokens = Math.ceil(diffContent.length / 4);
  const estimatedCost = `~$${(estimatedTokens * 3e-4).toFixed(2)}`;
  return {
    level,
    fileCount,
    totalLines,
    addedLines,
    removedLines,
    securitySensitiveFiles: [...securityFiles],
    estimatedReviewCost: estimatedCost
  };
}
function formatDiffComplexity(c) {
  const lines = [];
  lines.push(`Diff Complexity: ${c.level}`);
  lines.push(`  ${c.fileCount} files changed, ${c.totalLines} lines (+${c.addedLines}, -${c.removedLines})`);
  if (c.securitySensitiveFiles.length > 0) {
    lines.push(`  Security-sensitive: ${c.securitySensitiveFiles.join(", ")} (${c.securitySensitiveFiles.length} files)`);
  }
  lines.push(`  Estimated review cost: ${c.estimatedReviewCost}`);
  return lines.join("\n");
}
export {
  estimateDiffComplexity,
  formatDiffComplexity
};
