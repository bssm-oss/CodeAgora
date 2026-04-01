/**
 * External Rules Loader (#407)
 * Load AI rule files from various tool conventions
 * (.cursorrules, CLAUDE.md, copilot-instructions, etc.)
 */

import { readFile, readdir } from 'fs/promises';
import path from 'path';

/** Maximum chars to read per rule file (token budget guard) */
const MAX_CHARS_PER_FILE = 2000;

/** Single rule file definition */
interface RuleFileSpec {
  /** Path relative to repo root */
  path: string;
  /** Glob directory to scan (mutually exclusive with path) */
  globDir?: string;
  /** Extension filter for glob */
  globExt?: string;
  /** Display label */
  label: string;
}

const RULE_FILES: RuleFileSpec[] = [
  { path: '.cursorrules', label: '.cursorrules' },
  { path: '', globDir: '.cursor/rules', globExt: '.mdc', label: '.cursor/rules' },
  { path: 'CLAUDE.md', label: 'CLAUDE.md' },
  { path: '.github/copilot-instructions.md', label: '.github/copilot-instructions.md' },
  { path: '', globDir: '.clinerules', globExt: '.md', label: '.clinerules' },
  { path: '.windsurfrules', label: '.windsurfrules' },
];

/**
 * Read a file safely, returning null on any error.
 */
async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return content.slice(0, MAX_CHARS_PER_FILE);
  } catch {
    return null;
  }
}

/**
 * Read all files matching a glob pattern in a directory.
 */
async function readGlobDir(
  dirPath: string,
  ext: string,
  label: string,
): Promise<string[]> {
  const results: string[] = [];
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
    // Directory doesn't exist — skip silently
  }
  return results;
}

/**
 * Load external AI rule files from the repository.
 *
 * Scans for known tool-specific rule files (Cursor, Claude, Copilot, Cline,
 * Windsurf) and returns their contents prefixed with source labels.
 *
 * @param repoPath - Git repo root path
 * @returns Array of rule strings, each prefixed with `[source] `
 */
export async function loadExternalRules(repoPath: string): Promise<string[]> {
  const results: string[] = [];

  for (const spec of RULE_FILES) {
    try {
      if (spec.globDir) {
        // Glob mode: read all matching files in directory
        const dirPath = path.join(repoPath, spec.globDir);
        const globResults = await readGlobDir(dirPath, spec.globExt!, spec.label);
        results.push(...globResults);
      } else {
        // Single file mode
        const filePath = path.join(repoPath, spec.path);
        const content = await safeReadFile(filePath);
        if (content) {
          results.push(`[${spec.label}] ${content}`);
        }
      }
    } catch {
      // Skip on any error
    }
  }

  return results;
}
