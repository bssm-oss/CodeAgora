import { readFile, readdir } from "fs/promises";
import path from "path";
const MAX_CHARS_PER_FILE = 2e3;
const RULE_FILES = [
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
        const content = await safeReadFile(path.join(dirPath, entry.name));
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
        const dirPath = path.join(repoPath, spec.globDir);
        const globResults = await readGlobDir(dirPath, spec.globExt, spec.label);
        results.push(...globResults);
      } else {
        const filePath = path.join(repoPath, spec.path);
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
export {
  loadExternalRules
};
