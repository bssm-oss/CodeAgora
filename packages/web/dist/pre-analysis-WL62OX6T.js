import "./chunk-MCKGQKYU.js";

// ../core/src/pipeline/analyzers/diff-classifier.ts
var TEST_PATH_RE = /(?:__tests__|\.test\.|\.spec\.|test\/|tests\/|spec\/)/i;
var DOCS_EXT_RE = /\.(md|txt|rst|adoc|rdoc)$/i;
var CONFIG_FILES = /* @__PURE__ */ new Set([
  "package.json",
  "tsconfig.json",
  "tsconfig.build.json",
  "tsconfig.base.json",
  ".eslintrc.json",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".prettierrc",
  ".prettierrc.json",
  "jest.config.js",
  "jest.config.ts",
  "vitest.config.ts",
  "vitest.config.js",
  "turbo.json",
  "nx.json",
  "lerna.json",
  "babel.config.js",
  "babel.config.json",
  ".babelrc"
]);
var CONFIG_EXT_RE = /\.(yaml|yml|toml|env|ini|cfg)$/i;
var DEPENDENCY_FILES = /* @__PURE__ */ new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "Gemfile.lock",
  "composer.lock",
  "go.sum",
  "Cargo.lock",
  "poetry.lock"
]);
function classifyByPath(filePath) {
  const basename = filePath.split("/").pop() ?? filePath;
  if (DEPENDENCY_FILES.has(basename)) return "dependency";
  if (TEST_PATH_RE.test(filePath)) return "test";
  if (DOCS_EXT_RE.test(basename)) return "docs";
  if (CONFIG_FILES.has(basename)) return "config";
  if (CONFIG_EXT_RE.test(basename)) return "config";
  if (basename.startsWith(".env")) return "config";
  return void 0;
}
function tokenize(line) {
  return line.split(/[^a-zA-Z0-9_$]+/).filter(Boolean);
}
function tokenDiff(a, b) {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  const maxLen = Math.max(tokensA.length, tokensB.length);
  if (maxLen === 0) return 0;
  let diffs = 0;
  for (let i = 0; i < maxLen; i++) {
    if (tokensA[i] !== tokensB[i]) diffs++;
  }
  return diffs;
}
function jaccardSimilarity(a, b) {
  let intersect = 0;
  for (const token of a) {
    if (b.has(token)) intersect++;
  }
  const union = a.size + b.size - intersect;
  return union === 0 ? 1 : intersect / union;
}
function classifyByContent(diffSection) {
  const lines = diffSection.split("\n");
  const removed = [];
  const added = [];
  for (const line of lines) {
    if (line.startsWith("-") && !line.startsWith("---")) {
      removed.push(line.slice(1).trim());
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      added.push(line.slice(1).trim());
    }
  }
  if (removed.length === 0 && added.length === 0) return void 0;
  if (removed.length >= 3 && added.length >= 3 && Math.abs(removed.length - added.length) <= 2) {
    const pairCount = Math.min(removed.length, added.length);
    let renameCount = 0;
    let substantiveLines = 0;
    for (let i = 0; i < pairCount; i++) {
      const removedTokens = tokenize(removed[i]);
      if (removedTokens.length < 2) continue;
      substantiveLines++;
      const diff = tokenDiff(removed[i], added[i]);
      if (diff <= 2 && diff > 0) renameCount++;
    }
    if (substantiveLines >= 3 && renameCount / substantiveLines >= 0.6) {
      return "rename";
    }
  }
  if (removed.length >= 3 && added.length >= 3) {
    const removedTokens = new Set(removed.flatMap(tokenize));
    const addedTokens = new Set(added.flatMap(tokenize));
    const similarity = jaccardSimilarity(removedTokens, addedTokens);
    if (similarity > 0.7) {
      const identicalLines = removed.filter((r) => added.includes(r)).length;
      const identicalRatio = identicalLines / Math.max(removed.length, added.length);
      if (identicalRatio < 0.9) {
        return "refactor";
      }
    }
  }
  return void 0;
}
function classifyDiffFiles(diffContent) {
  const result = /* @__PURE__ */ new Map();
  if (!diffContent.trim()) return result;
  const sections = diffContent.split(/(?=diff --git )/);
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed.startsWith("diff --git ")) continue;
    const match = trimmed.match(/diff --git a\/(.+?) b\/(.+)/);
    if (!match) continue;
    const filePath = match[2];
    const pathClass = classifyByPath(filePath);
    if (pathClass) {
      result.set(filePath, pathClass);
      continue;
    }
    const contentClass = classifyByContent(trimmed);
    if (contentClass) {
      result.set(filePath, contentClass);
      continue;
    }
    result.set(filePath, "logic");
  }
  return result;
}

// ../core/src/pipeline/analyzers/tsc-runner.ts
import { execFile } from "child_process";
import { access } from "fs/promises";
import path from "path";
var TSC_LINE_RE = /^(.+?)\((\d+),\d+\):\s+error\s+TS(\d+):\s+(.+)$/;
async function runTscDiagnostics(repoPath, changedFiles) {
  try {
    await access(path.join(repoPath, "tsconfig.json"));
  } catch {
    return [];
  }
  const changedSet = new Set(
    changedFiles.map((f) => f.replace(/^\//, ""))
  );
  return new Promise((resolve) => {
    const child = execFile(
      "npx",
      ["tsc", "--noEmit"],
      {
        cwd: repoPath,
        timeout: 15e3,
        maxBuffer: 10 * 1024 * 1024
        // 10MB
      },
      (error, stdout, stderr) => {
        const output = (stdout || "") + (stderr || "");
        if (!output.trim()) {
          resolve([]);
          return;
        }
        const diagnostics = [];
        const lines = output.split("\n");
        for (const line of lines) {
          const match = line.match(TSC_LINE_RE);
          if (!match) continue;
          const [, rawFile, rawLine, rawCode, message] = match;
          const file = rawFile.trim();
          const normalizedFile = file.replace(/^\.\//, "");
          if (!changedSet.has(normalizedFile)) {
            const matches = [...changedSet].some(
              (cf) => cf.endsWith(normalizedFile) || normalizedFile.endsWith(cf)
            );
            if (!matches) continue;
          }
          diagnostics.push({
            file: normalizedFile,
            line: parseInt(rawLine, 10),
            code: parseInt(rawCode, 10),
            message: message.trim()
          });
        }
        resolve(diagnostics);
      }
    );
    child.on("error", () => resolve([]));
  });
}

// ../core/src/pipeline/analyzers/impact-analyzer.ts
import { execFile as execFile2 } from "child_process";
var EXPORT_RE = /export\s+(?:async\s+)?(?:function|const|class|let|var|enum|interface|type)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/;
function extractExportedSymbols(diffContent) {
  const symbols = [];
  const lines = diffContent.split("\n");
  for (const line of lines) {
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    const match = line.slice(1).match(EXPORT_RE);
    if (match?.[1]) {
      symbols.push(match[1]);
    }
  }
  return [...new Set(symbols)];
}
function findImporters(repoPath, symbolName, timeoutMs) {
  return new Promise((resolve) => {
    execFile2(
      "grep",
      [
        "-r",
        "-l",
        `import.*${symbolName}`,
        "--include=*.ts",
        "--include=*.tsx",
        "--include=*.js",
        "--include=*.jsx",
        "--include=*.mts",
        "--include=*.mjs",
        "."
      ],
      {
        cwd: repoPath,
        timeout: timeoutMs,
        maxBuffer: 5 * 1024 * 1024
      },
      (error, stdout) => {
        if (!stdout?.trim()) {
          resolve([]);
          return;
        }
        const files = stdout.trim().split("\n").map((f) => f.replace(/^\.\//, "")).filter(Boolean);
        resolve(files);
      }
    );
  });
}
async function analyzeChangeImpact(repoPath, diffContent) {
  const result = /* @__PURE__ */ new Map();
  const symbols = extractExportedSymbols(diffContent);
  if (symbols.length === 0) return result;
  const perSymbolTimeout = Math.max(2e3, Math.floor(1e4 / symbols.length));
  const searches = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const importers = await findImporters(repoPath, symbol, perSymbolTimeout);
      return { symbol, importers };
    })
  );
  for (const search of searches) {
    if (search.status === "fulfilled") {
      const { symbol, importers } = search.value;
      if (importers.length > 0) {
        result.set(symbol, {
          symbol,
          callerCount: importers.length,
          importers
        });
      }
    }
  }
  return result;
}

// ../core/src/pipeline/analyzers/external-rules.ts
import { readFile, readdir } from "fs/promises";
import path2 from "path";
var MAX_CHARS_PER_FILE = 2e3;
var RULE_FILES = [
  { path: ".cursorrules", label: ".cursorrules" },
  { path: "", globDir: ".cursor/rules", globExt: ".mdc", label: ".cursor/rules" },
  { path: "CLAUDE.md", label: "CLAUDE.md" },
  { path: ".github/copilot-instructions.md", label: ".github/copilot-instructions.md" },
  { path: "", globDir: ".clinerules", globExt: ".md", label: ".clinerules" },
  { path: ".windsurfrules", label: ".windsurfrules" }
];
async function safeReadFile(filePath) {
  try {
    const content = await readFile(filePath, "utf-8");
    return content.slice(0, MAX_CHARS_PER_FILE);
  } catch {
    return null;
  }
}
async function readGlobDir(dirPath, ext, label) {
  const results = [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(ext)) {
        const content = await safeReadFile(path2.join(dirPath, entry.name));
        if (content) {
          results.push(`[${label}/${entry.name}] ${content}`);
        }
      }
    }
  } catch {
  }
  return results;
}
async function loadExternalRules(repoPath) {
  const results = [];
  for (const spec of RULE_FILES) {
    try {
      if (spec.globDir) {
        const dirPath = path2.join(repoPath, spec.globDir);
        const globResults = await readGlobDir(dirPath, spec.globExt, spec.label);
        results.push(...globResults);
      } else {
        const filePath = path2.join(repoPath, spec.path);
        const content = await safeReadFile(filePath);
        if (content) {
          results.push(`[${spec.label}] ${content}`);
        }
      }
    } catch {
    }
  }
  return results;
}

// ../core/src/pipeline/analyzers/path-rules.ts
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
function matchPathRules(changedFiles, pathRules) {
  if (pathRules.length === 0 || changedFiles.length === 0) return [];
  const matchedNotes = /* @__PURE__ */ new Set();
  const compiled = pathRules.map((rule) => ({
    regex: globToRegex(rule.pattern),
    notes: rule.notes
  }));
  for (const file of changedFiles) {
    for (const rule of compiled) {
      if (rule.regex.test(file)) {
        for (const note of rule.notes) {
          matchedNotes.add(note);
        }
      }
    }
  }
  return [...matchedNotes];
}

// ../core/src/pipeline/pre-analysis.ts
function withTimeout(promise, timeoutMs, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), timeoutMs))
  ]);
}
async function analyzeBeforeReview(repoPath, diffContent, config, changedFiles) {
  const TIMEOUT_MS = 15e3;
  const pathRules = config.reviewContext?.pathRules ?? [];
  const [
    classificationsResult,
    tscResult,
    impactResult,
    rulesResult,
    pathNotesResult
  ] = await Promise.allSettled([
    // 1. Diff classification (sync, but wrap for uniformity)
    withTimeout(
      Promise.resolve(classifyDiffFiles(diffContent)),
      TIMEOUT_MS,
      /* @__PURE__ */ new Map()
    ),
    // 2. TypeScript diagnostics
    withTimeout(
      runTscDiagnostics(repoPath, changedFiles),
      TIMEOUT_MS,
      []
    ),
    // 3. Impact analysis
    withTimeout(
      analyzeChangeImpact(repoPath, diffContent),
      TIMEOUT_MS,
      /* @__PURE__ */ new Map()
    ),
    // 4. External rules
    withTimeout(
      loadExternalRules(repoPath),
      TIMEOUT_MS,
      []
    ),
    // 5. Path rules (sync, but wrap for uniformity)
    withTimeout(
      Promise.resolve(matchPathRules(changedFiles, pathRules)),
      TIMEOUT_MS,
      []
    )
  ]);
  return {
    fileClassifications: classificationsResult.status === "fulfilled" ? classificationsResult.value : /* @__PURE__ */ new Map(),
    tscDiagnostics: tscResult.status === "fulfilled" ? tscResult.value : [],
    impactAnalysis: impactResult.status === "fulfilled" ? impactResult.value : /* @__PURE__ */ new Map(),
    externalRules: rulesResult.status === "fulfilled" ? rulesResult.value : [],
    pathRuleNotes: pathNotesResult.status === "fulfilled" ? pathNotesResult.value : []
  };
}
function buildEnrichedSection(ctx) {
  const sections = [];
  if (ctx.fileClassifications.size > 0) {
    const lines = [...ctx.fileClassifications.entries()].map(([file, cls]) => `- [${cls.toUpperCase()}] ${file}`).join("\n");
    sections.push(`## File Classifications
${lines}`);
  }
  if (ctx.tscDiagnostics.length > 0) {
    const lines = ctx.tscDiagnostics.slice(0, 20).map((d) => `- ${d.file}:${d.line} \u2014 error TS${d.code}: ${d.message}`).join("\n");
    sections.push(`## TypeScript Diagnostics
${lines}`);
  }
  if (ctx.impactAnalysis.size > 0) {
    const lines = [...ctx.impactAnalysis.entries()].map(([, entry]) => {
      const level = entry.callerCount >= 10 ? "HIGH" : entry.callerCount >= 5 ? "MEDIUM" : "LOW";
      return `- ${entry.symbol}() \u2014 ${entry.callerCount} importers (${level})`;
    }).join("\n");
    sections.push(`## Change Impact
${lines}`);
  }
  if (ctx.externalRules.length > 0) {
    sections.push(`## Project Rules
${ctx.externalRules.join("\n\n")}`);
  }
  if (ctx.pathRuleNotes.length > 0) {
    const lines = ctx.pathRuleNotes.map((n) => `- ${n}`).join("\n");
    sections.push(`## Path-Specific Review Notes
${lines}`);
  }
  if (sections.length === 0) return "";
  return `
## Pre-Analysis Context

${sections.join("\n\n")}
`;
}
export {
  analyzeBeforeReview,
  buildEnrichedSection
};
