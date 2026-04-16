import { execFile } from "child_process";
import { access } from "fs/promises";
import path from "path";
const TSC_LINE_RE = /^(.+?)\((\d+),\d+\):\s+error\s+TS(\d+):\s+(.+)$/;
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
export {
  runTscDiagnostics
};
