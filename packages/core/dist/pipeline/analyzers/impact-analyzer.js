import { execFile } from "child_process";
const EXPORT_RE = /export\s+(?:async\s+)?(?:function|const|class|let|var|enum|interface|type)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/;
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
    execFile(
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
export {
  analyzeChangeImpact
};
