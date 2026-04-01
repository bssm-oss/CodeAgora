function parseDiffFiles(diffContent) {
  const files = [];
  const sections = diffContent.split(/(?=diff --git )/);
  for (const section of sections) {
    if (!section.trim()) continue;
    const headerMatch = section.match(/diff --git a\/.+ b\/(.+)/);
    if (!headerMatch) continue;
    const filePath = headerMatch[1].trim();
    const addedLines = [];
    let currentNewLine = 0;
    const lines = section.split("\n");
    for (const line of lines) {
      if (line.startsWith("@@")) {
        const hunkMatch = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (hunkMatch) {
          currentNewLine = parseInt(hunkMatch[1], 10) - 1;
        }
        continue;
      }
      if (line.startsWith("+") && !line.startsWith("+++")) {
        currentNewLine++;
        addedLines.push({ content: line.slice(1), lineNum: currentNewLine });
      } else if (line.startsWith(" ")) {
        currentNewLine++;
      }
    }
    files.push({ filePath, addedLines });
  }
  return files;
}
function matchGlob(filePath, pattern) {
  const regexStr = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\x00/g, ".*");
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(filePath) || regex.test(filePath.split("/").pop() ?? filePath);
}
function matchRules(diffContent, rules) {
  const diffFiles = parseDiffFiles(diffContent);
  const results = [];
  for (const { filePath, addedLines } of diffFiles) {
    for (const rule of rules) {
      if (rule.filePatterns && rule.filePatterns.length > 0) {
        const matchesAny = rule.filePatterns.some((p) => matchGlob(filePath, p));
        if (!matchesAny) continue;
      }
      for (const { content, lineNum } of addedLines) {
        if (rule.regex.test(content)) {
          results.push({
            issueTitle: `Rule: ${rule.id}`,
            problem: rule.message,
            evidence: [
              `Pattern matched: \`${rule.pattern}\``,
              `Line: ${content.trim()}`
            ],
            severity: rule.severity,
            suggestion: `Fix the ${rule.id} violation`,
            filePath,
            lineRange: [lineNum, lineNum],
            source: "rule"
          });
        }
      }
    }
  }
  return results;
}
export {
  matchRules
};
