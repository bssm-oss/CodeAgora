const TEST_PATH_RE = /(?:__tests__|\.test\.|\.spec\.|test\/|tests\/|spec\/)/i;
const DOCS_EXT_RE = /\.(md|txt|rst|adoc|rdoc)$/i;
const CONFIG_FILES = /* @__PURE__ */ new Set([
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
const CONFIG_EXT_RE = /\.(yaml|yml|toml|env|ini|cfg)$/i;
const DEPENDENCY_FILES = /* @__PURE__ */ new Set([
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
export {
  classifyDiffFiles
};
