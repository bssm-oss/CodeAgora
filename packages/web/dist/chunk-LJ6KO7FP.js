// ../shared/src/utils/diff.ts
import fsPromises from "fs/promises";
import path from "path";
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function parseDiffFileRanges(diffContent) {
  const result = [];
  const sections = diffContent.split(/(?=diff --git )/);
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed.startsWith("diff --git ")) continue;
    const plusMatch = trimmed.match(/^\+\+\+ b\/(.+)$/m);
    if (!plusMatch) {
      continue;
    }
    const filePath = plusMatch[1];
    const ranges = [];
    const hunkRegex = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
    let match;
    while ((match = hunkRegex.exec(trimmed)) !== null) {
      const start = parseInt(match[1], 10);
      const count = match[2] !== void 0 ? parseInt(match[2], 10) : 1;
      const end = start + Math.max(count - 1, 0);
      ranges.push([start, end]);
    }
    if (ranges.length > 0) {
      const existing = result.find((r) => r.file === filePath);
      if (existing) {
        existing.ranges.push(...ranges);
      } else {
        result.push({ file: filePath, ranges });
      }
    }
  }
  return result;
}
function mergeRanges(ranges) {
  if (ranges.length <= 1) return [...ranges];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];
    if (current[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push(current);
    }
  }
  return merged;
}
async function readSurroundingContext(repoPath, file, ranges, contextLines) {
  if (ranges.length === 0 || contextLines <= 0) return "";
  const filePath = path.join(repoPath, file);
  const resolvedRepo = path.resolve(repoPath);
  const resolvedFile = path.resolve(filePath);
  if (!resolvedFile.startsWith(resolvedRepo + path.sep) && resolvedFile !== resolvedRepo) {
    console.warn(`[Context] Path traversal blocked: ${file} escapes ${repoPath}`);
    return "";
  }
  let fileContent;
  try {
    fileContent = await fsPromises.readFile(filePath, "utf-8");
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code !== "ENOENT") {
      console.warn(`[Context] Failed to read ${filePath}: ${err.message}`);
    }
    return "";
  }
  const lines = fileContent.split("\n");
  const totalLines = lines.length;
  const expandedRanges = ranges.map(([start, end]) => [
    Math.max(1, start - contextLines),
    Math.min(totalLines, end + contextLines)
  ]);
  const merged = mergeRanges(expandedRanges);
  const outputSections = [];
  for (const [start, end] of merged) {
    const snippetLines = [];
    for (let i = start; i <= end && i <= totalLines; i++) {
      const lineNum = String(i).padStart(4, " ");
      snippetLines.push(`${lineNum} | ${lines[i - 1]}`);
    }
    if (snippetLines.length > 0) {
      outputSections.push(snippetLines.join("\n"));
    }
  }
  if (outputSections.length === 0) return "";
  return `### ${file}
\`\`\`
${outputSections.join("\n...\n")}
\`\`\``;
}
function extractFileListFromDiff(diffContent) {
  const files = [];
  const sections = diffContent.split(/(?=diff --git)/);
  for (const section of sections) {
    const match = section.match(/diff --git a\/(.+?) b\//);
    if (match) {
      files.push(match[1]);
    }
  }
  if (files.length === 0) {
    const plusMatches = diffContent.matchAll(/^\+\+\+ b\/(.+)$/gm);
    for (const m of plusMatches) {
      files.push(m[1]);
    }
  }
  return files;
}
function fuzzyMatchFilePath(query, filePaths) {
  if (filePaths.length === 0) return null;
  const filenamePattern = /([a-zA-Z0-9_-]+\.[a-z]+)/gi;
  const matches = query.match(filenamePattern);
  if (!matches || matches.length === 0) return null;
  for (const filename of matches) {
    const exact = filePaths.find((path2) => path2.endsWith(filename));
    if (exact) return exact;
  }
  for (const filename of matches) {
    const nameWithoutExt = filename.replace(/\.[^.]+$/, "");
    const segmentRegex = new RegExp(
      `(?:^|/)${escapeRegExp(nameWithoutExt)}(?:\\.[^/]*)?$`,
      "i"
    );
    const candidates = filePaths.filter((p) => segmentRegex.test(p));
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}
function extractCodeSnippet(diffContent, filePath, lineRange, contextLines = 10) {
  const fileSection = extractFileSection(diffContent, filePath);
  if (!fileSection) {
    return null;
  }
  const lines = fileSection.split("\n");
  const snippetLines = [];
  let currentLine = 0;
  let foundStart = false;
  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = line.match(/@@ -\d+,?\d* \+(\d+),?\d* @@/);
      if (match) {
        currentLine = parseInt(match[1], 10) - 1;
      }
      continue;
    }
    if (line.startsWith("-")) {
      continue;
    }
    if (line.startsWith("+") || line.startsWith(" ")) {
      currentLine++;
    }
    const [startLine, endLine] = lineRange;
    const inRange = currentLine >= startLine - contextLines && currentLine <= endLine + contextLines;
    if (inRange) {
      foundStart = true;
      const lineNumber = String(currentLine).padStart(4, " ");
      const content = line.substring(1);
      snippetLines.push(`${lineNumber} | ${content}`);
    } else if (foundStart) {
      break;
    }
  }
  if (snippetLines.length === 0) {
    return null;
  }
  return {
    filePath,
    lineRange,
    code: snippetLines.join("\n"),
    context: `File: ${filePath} (lines ${lineRange[0]}-${lineRange[1]})`
  };
}
function extractFileSection(diffContent, filePath) {
  const sections = diffContent.split(/(?=diff --git)/);
  for (const section of sections) {
    if (section.includes(`b/${filePath}`)) {
      return section;
    }
  }
  return null;
}
function extractMultipleSnippets(diffContent, issues, contextLines = 10) {
  const snippets = /* @__PURE__ */ new Map();
  for (const issue of issues) {
    const key = `${issue.filePath}:${issue.lineRange[0]}-${issue.lineRange[1]}`;
    const snippet = extractCodeSnippet(
      diffContent,
      issue.filePath,
      issue.lineRange,
      contextLines
    );
    if (snippet) {
      snippets.set(key, snippet);
    }
  }
  return snippets;
}

export {
  parseDiffFileRanges,
  mergeRanges,
  readSurroundingContext,
  extractFileListFromDiff,
  fuzzyMatchFilePath,
  extractCodeSnippet,
  extractMultipleSnippets
};
