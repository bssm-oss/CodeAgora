/**
 * Diff Utilities - Code Snippet Extraction & Context Reading
 */

import fsPromises from 'fs/promises';
import path from 'path';

// ============================================================================
// Diff File Range Parsing (Context-Aware Review)
// ============================================================================

export interface DiffFileRange {
  file: string;
  ranges: Array<[start: number, end: number]>;
}

/**
 * Parse unified diff headers to extract which files and line ranges changed.
 * Reads `--- a/file`, `+++ b/file`, `@@ -a,b +c,d @@` headers.
 * Uses the new-file side (+) ranges for context reading.
 */
export function parseDiffFileRanges(diffContent: string): DiffFileRange[] {
  const result: DiffFileRange[] = [];
  const sections = diffContent.split(/(?=diff --git )/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed.startsWith('diff --git ')) continue;

    // Extract file path from +++ line (new file side)
    const plusMatch = trimmed.match(/^\+\+\+ b\/(.+)$/m);
    if (!plusMatch) {
      // Deleted file (no +++ b/ line) — skip
      continue;
    }
    const filePath = plusMatch[1];

    // Extract hunk ranges from @@ headers
    const ranges: Array<[number, number]> = [];
    const hunkRegex = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
    let match;
    while ((match = hunkRegex.exec(trimmed)) !== null) {
      const start = parseInt(match[1], 10);
      const count = match[2] !== undefined ? parseInt(match[2], 10) : 1;
      const end = start + Math.max(count - 1, 0);
      ranges.push([start, end]);
    }

    if (ranges.length > 0) {
      // Merge into existing entry for same file (handles split diffs)
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

/**
 * Merge overlapping or adjacent ranges into non-overlapping ranges.
 * Input ranges must be [start, end] where start <= end.
 */
export function mergeRanges(
  ranges: Array<[number, number]>
): Array<[number, number]> {
  if (ranges.length <= 1) return [...ranges];

  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];

    if (current[0] <= last[1] + 1) {
      // Overlapping or adjacent — extend
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Read surrounding code context from source files for changed ranges.
 *
 * For each range [start, end], reads [start - contextLines, end + contextLines]
 * from the actual source file. Merges overlapping expanded ranges.
 * Skips files that don't exist (deleted files, permission errors).
 *
 * @param repoPath - Root path of the git repository
 * @param file - Relative file path within the repo
 * @param ranges - Line ranges that changed
 * @param contextLines - Number of surrounding lines to include
 * @returns Formatted string with file path and line-numbered code, or empty string
 */
export async function readSurroundingContext(
  repoPath: string,
  file: string,
  ranges: Array<[number, number]>,
  contextLines: number
): Promise<string> {
  if (ranges.length === 0 || contextLines <= 0) return '';

  const filePath = path.join(repoPath, file);

  let fileContent: string;
  try {
    fileContent = await fsPromises.readFile(filePath, 'utf-8');
  } catch (err) {
    // File doesn't exist (deleted) — skip silently; log other errors
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[Context] Failed to read ${filePath}: ${err.message}`);
    }
    return '';
  }

  const lines = fileContent.split('\n');
  const totalLines = lines.length;

  // Expand ranges with context and clamp to file bounds
  const expandedRanges: Array<[number, number]> = ranges.map(([start, end]) => [
    Math.max(1, start - contextLines),
    Math.min(totalLines, end + contextLines),
  ]);

  // Merge overlapping expanded ranges
  const merged = mergeRanges(expandedRanges);

  // Build output
  const outputSections: string[] = [];

  for (const [start, end] of merged) {
    const snippetLines: string[] = [];
    for (let i = start; i <= end && i <= totalLines; i++) {
      const lineNum = String(i).padStart(4, ' ');
      snippetLines.push(`${lineNum} | ${lines[i - 1]}`);
    }
    if (snippetLines.length > 0) {
      outputSections.push(snippetLines.join('\n'));
    }
  }

  if (outputSections.length === 0) return '';

  return `### ${file}\n\`\`\`\n${outputSections.join('\n...\n')}\n\`\`\``;
}

export interface CodeSnippet {
  filePath: string;
  lineRange: [number, number];
  code: string;
  context: string; // Full context with line numbers
}

/**
 * Extract list of file paths from diff
 */
export function extractFileListFromDiff(diffContent: string): string[] {
  const files: string[] = [];
  const sections = diffContent.split(/(?=diff --git)/);

  for (const section of sections) {
    // Match: diff --git a/path/to/file.ts b/path/to/file.ts
    const match = section.match(/diff --git a\/(.+?) b\//);
    if (match) {
      files.push(match[1]);
    }
  }

  return files;
}

/**
 * Find best matching file path from a list using fuzzy matching
 */
export function fuzzyMatchFilePath(
  query: string,
  filePaths: string[]
): string | null {
  if (filePaths.length === 0) return null;

  // Extract potential filename from query text
  const filenamePattern = /([a-zA-Z0-9_-]+\.[a-z]+)/gi;
  const matches = query.match(filenamePattern);

  if (!matches || matches.length === 0) return null;

  // Try exact match first
  for (const filename of matches) {
    const exact = filePaths.find((path) => path.endsWith(filename));
    if (exact) return exact;
  }

  // Try partial match (filename without extension)
  for (const filename of matches) {
    const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
    const partial = filePaths.find((path) =>
      path.toLowerCase().includes(nameWithoutExt.toLowerCase())
    );
    if (partial) return partial;
  }

  return null;
}

/**
 * Extract code snippet from diff with ±N lines context
 */
export function extractCodeSnippet(
  diffContent: string,
  filePath: string,
  lineRange: [number, number],
  contextLines: number = 10
): CodeSnippet | null {
  // Parse diff to find the file section
  const fileSection = extractFileSection(diffContent, filePath);
  if (!fileSection) {
    return null;
  }

  // Extract lines around the target range
  const lines = fileSection.split('\n');
  const snippetLines: string[] = [];
  let currentLine = 0;
  let foundStart = false;

  for (const line of lines) {
    // Track line numbers from diff hunks
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+,?\d* \+(\d+),?\d* @@/);
      if (match) {
        currentLine = parseInt(match[1], 10) - 1;
      }
      continue;
    }

    // Skip removed lines
    if (line.startsWith('-')) {
      continue;
    }

    // Count added/context lines
    if (line.startsWith('+') || line.startsWith(' ')) {
      currentLine++;
    }

    // Check if we're in the target range ± context
    const [startLine, endLine] = lineRange;
    const inRange =
      currentLine >= startLine - contextLines &&
      currentLine <= endLine + contextLines;

    if (inRange) {
      foundStart = true;
      const lineNumber = String(currentLine).padStart(4, ' ');
      const content = line.substring(1); // Remove diff prefix (+/- / )
      snippetLines.push(`${lineNumber} | ${content}`);
    } else if (foundStart) {
      // We've passed the range, stop
      break;
    }
  }

  if (snippetLines.length === 0) {
    return null;
  }

  return {
    filePath,
    lineRange,
    code: snippetLines.join('\n'),
    context: `File: ${filePath} (lines ${lineRange[0]}-${lineRange[1]})`,
  };
}

/**
 * Extract file section from full diff
 */
function extractFileSection(diffContent: string, filePath: string): string | null {
  const sections = diffContent.split(/(?=diff --git)/);

  for (const section of sections) {
    if (section.includes(`b/${filePath}`)) {
      return section;
    }
  }

  return null;
}

/**
 * Batch extract snippets for multiple issues
 */
export function extractMultipleSnippets(
  diffContent: string,
  issues: Array<{ filePath: string; lineRange: [number, number] }>,
  contextLines: number = 10
): Map<string, CodeSnippet> {
  const snippets = new Map<string, CodeSnippet>();

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
