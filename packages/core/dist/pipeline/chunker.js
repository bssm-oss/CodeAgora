import { readFile, stat } from "fs/promises";
import path from "path";
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function parseDiffFiles(diff) {
  if (!diff.trim()) return [];
  const sections = diff.split(/(?=diff --git )/);
  const files = [];
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed.startsWith("diff --git ")) continue;
    const match = trimmed.match(/diff --git a\/(.+?) b\/(.+)/);
    if (!match) continue;
    const filePath = match[2];
    const hunkMatches = trimmed.split(/(?=^@@)/m);
    const hunks = [];
    for (const h of hunkMatches) {
      if (h.trimStart().startsWith("@@")) {
        hunks.push(h);
      }
    }
    files.push({
      filePath,
      content: trimmed,
      hunks
    });
  }
  return files;
}
function extractDiffHeader(content) {
  const idx = content.search(/^@@/m);
  if (idx === -1) return content;
  return content.slice(0, idx);
}
function splitLargeFile(file, maxTokens) {
  if (estimateTokens(file.content) <= maxTokens) {
    return [{ filePath: file.filePath, content: file.content }];
  }
  if (file.hunks.length <= 1) {
    return [{ filePath: file.filePath, content: file.content }];
  }
  const header = extractDiffHeader(file.content);
  const headerTokens = estimateTokens(header);
  const results = [];
  let currentHunks = [];
  let currentTokens = headerTokens;
  for (const hunk of file.hunks) {
    const hunkTokens = estimateTokens(hunk);
    if (currentHunks.length > 0 && currentTokens + hunkTokens > maxTokens) {
      results.push({
        filePath: file.filePath,
        content: header + currentHunks.join("")
      });
      currentHunks = [];
      currentTokens = headerTokens;
    }
    currentHunks.push(hunk);
    currentTokens += hunkTokens;
  }
  if (currentHunks.length > 0) {
    results.push({
      filePath: file.filePath,
      content: header + currentHunks.join("")
    });
  }
  return results;
}
function getFileDir(filePath) {
  const parts = filePath.split("/");
  return parts.slice(0, Math.min(2, parts.length - 1)).join("/") || "root";
}
function chunkDiffFiles(files, maxTokens) {
  if (files.length === 0) return [];
  const dirMap = /* @__PURE__ */ new Map();
  for (const file of files) {
    const dir = getFileDir(file.filePath);
    if (!dirMap.has(dir)) {
      dirMap.set(dir, []);
    }
    dirMap.get(dir).push(file);
  }
  const rawChunks = [];
  for (const [, dirFiles] of dirMap) {
    let currentChunk = { files: [], contents: [], tokens: 0 };
    for (const file of dirFiles) {
      const fileTokens = estimateTokens(file.content);
      if (currentChunk.files.length > 0 && currentChunk.tokens + fileTokens > maxTokens) {
        rawChunks.push(currentChunk);
        currentChunk = { files: [], contents: [], tokens: 0 };
      }
      currentChunk.files.push(file.filePath);
      currentChunk.contents.push(file.content);
      currentChunk.tokens += fileTokens;
    }
    if (currentChunk.files.length > 0) {
      rawChunks.push(currentChunk);
    }
  }
  const mergedChunks = [];
  const smallThreshold = maxTokens * 0.3;
  for (const chunk of rawChunks) {
    if (mergedChunks.length > 0 && chunk.tokens < smallThreshold && mergedChunks[mergedChunks.length - 1].tokens + chunk.tokens <= maxTokens) {
      const last = mergedChunks[mergedChunks.length - 1];
      last.files.push(...chunk.files);
      last.contents.push(...chunk.contents);
      last.tokens += chunk.tokens;
    } else if (mergedChunks.length > 0 && mergedChunks[mergedChunks.length - 1].tokens < smallThreshold && mergedChunks[mergedChunks.length - 1].tokens + chunk.tokens <= maxTokens) {
      const last = mergedChunks[mergedChunks.length - 1];
      last.files.push(...chunk.files);
      last.contents.push(...chunk.contents);
      last.tokens += chunk.tokens;
    } else {
      mergedChunks.push({ ...chunk });
    }
  }
  return mergedChunks.map((chunk, index) => {
    const joined = chunk.contents.join("\n");
    return {
      index,
      files: chunk.files,
      diffContent: joined,
      estimatedTokens: estimateTokens(joined)
    };
  });
}
const BUILT_IN_ARTIFACT_PATTERNS = [
  "dist/**",
  "build/**",
  "out/**",
  ".next/**",
  ".nuxt/**",
  "coverage/**",
  "node_modules/**",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.bundle.js",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "**/*.d.ts.map",
  "**/*.js.map"
];
function globToRegex(pattern) {
  let regex = "";
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          regex += "(?:.+/)?";
          i += 3;
        } else {
          regex += ".*";
          i += 2;
        }
      } else {
        regex += "[^/]*";
        i += 1;
      }
    } else if (char === "?") {
      regex += "[^/]";
      i += 1;
    } else if (char === ".") {
      regex += "\\.";
      i += 1;
    } else {
      regex += char.replace(/[\\^$.|+()[\]{}]/g, "\\$&");
      i += 1;
    }
  }
  return new RegExp(`^${regex}$`);
}
function filterIgnoredFiles(files, patterns) {
  if (patterns.length === 0) return files;
  const regexes = patterns.filter((p) => p.trim() && !p.startsWith("#")).map((p) => globToRegex(p.trim()));
  return files.filter((file) => {
    return !regexes.some((rx) => rx.test(file.filePath));
  });
}
const REVIEW_IGNORE_MAX_BYTES = 1024 * 1024;
async function loadReviewIgnorePatterns(cwd) {
  const filePath = path.join(cwd ?? process.cwd(), ".reviewignore");
  try {
    const fileStat = await stat(filePath);
    if (fileStat.size > REVIEW_IGNORE_MAX_BYTES) {
      console.warn(
        `[reviewignore] .reviewignore exceeds size limit (${fileStat.size} bytes > ${REVIEW_IGNORE_MAX_BYTES} bytes) \u2014 skipping`
      );
      return [];
    }
    const content = await readFile(filePath, "utf-8");
    return content.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  } catch {
    return [];
  }
}
async function chunkDiff(diffContent, options) {
  const maxTokens = options?.maxTokens ?? 8e3;
  if (!diffContent.trim()) return [];
  const parsedFiles = parseDiffFiles(diffContent);
  if (parsedFiles.length === 0) return [];
  const artifactFiltered = filterIgnoredFiles(parsedFiles, BUILT_IN_ARTIFACT_PATTERNS);
  if (artifactFiltered.length === 0) return [];
  const ignorePatterns = await loadReviewIgnorePatterns(options?.cwd);
  const filteredFiles = filterIgnoredFiles(artifactFiltered, ignorePatterns);
  if (filteredFiles.length === 0) return [];
  const splitFiles = [];
  for (const file of filteredFiles) {
    splitFiles.push(...splitLargeFile(file, maxTokens));
  }
  const totalTokens = splitFiles.reduce((sum, f) => sum + estimateTokens(f.content), 0);
  if (totalTokens <= maxTokens) {
    const joined = splitFiles.map((f) => f.content).join("\n");
    return [
      {
        index: 0,
        files: [...new Set(splitFiles.map((f) => f.filePath))],
        diffContent: joined,
        estimatedTokens: estimateTokens(joined)
      }
    ];
  }
  return chunkDiffFiles(splitFiles, maxTokens);
}
export {
  BUILT_IN_ARTIFACT_PATTERNS,
  REVIEW_IGNORE_MAX_BYTES,
  chunkDiff,
  chunkDiffFiles,
  estimateTokens,
  filterIgnoredFiles,
  loadReviewIgnorePatterns,
  parseDiffFiles,
  splitLargeFile
};
