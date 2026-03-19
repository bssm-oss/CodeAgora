/**
 * GitHub Diff Parser
 * Converts a unified diff string into a position index for GitHub review comments.
 *
 * GitHub's `position` in a pull request review comment is the 1-based offset
 * within the diff hunk — counting ALL lines including the @@ header.
 */

import type { DiffPositionIndex } from './types.js';

/**
 * Build an index mapping "filePath:lineNumber" → diff hunk position.
 *
 * The position is what GitHub's `pulls.createReview` API expects in the
 * `comments[].position` field. It counts every line in the diff for a given
 * file starting from 1 (the first @@ line).
 */
export function buildDiffPositionIndex(unifiedDiff: string): DiffPositionIndex {
  const index: DiffPositionIndex = {};
  let currentFile = '';
  let filePosition = 0; // position counter per file (reset on new file)
  let newLineNumber = 0;

  for (const line of unifiedDiff.split('\n')) {
    // Skip --- lines
    if (line.startsWith('--- ')) continue;

    // New file: "+++ b/src/foo.ts" → "src/foo.ts"; "+++ /dev/null" → null (deleted file)
    if (line.startsWith('+++ ')) {
      if (line === '+++ /dev/null') {
        currentFile = '';
      } else {
        currentFile = line.startsWith('+++ b/') ? line.slice(6) : line.slice(4);
      }
      filePosition = 0;
      continue;
    }

    // Binary files line → skip
    if (line.startsWith('Binary files ')) continue;

    // No newline at end of file → skip (do not count position)
    if (line.startsWith('\\ No newline')) continue;

    // Hunk header: "@@ -42,8 +42,10 @@"
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      newLineNumber = match ? parseInt(match[1], 10) - 1 : 0;
      filePosition++;
      continue;
    }

    // Skip hunks for deleted files (currentFile is empty)
    if (!currentFile) continue;

    // Deleted line: counts toward position but doesn't advance newLineNumber
    if (line.startsWith('-')) {
      filePosition++;
      continue;
    }

    // Added or context line: counts toward position AND advances newLineNumber
    if (line.startsWith('+') || line.startsWith(' ')) {
      filePosition++;
      newLineNumber++;
      index[`${currentFile}:${newLineNumber}`] = filePosition;
    }
  }

  return index;
}

/**
 * Look up the diff hunk position for a given file and line number.
 * Returns null if the line is not present in the diff (unchanged, deleted, or out of range).
 */
export function resolvePosition(
  index: DiffPositionIndex,
  filePath: string,
  line: number,
): number | null {
  return index[`${filePath}:${line}`] ?? null;
}

/**
 * Resolve the best position for a line range.
 * Tries the start line first, then scans through the range for the first hit.
 */
export function resolveLineRange(
  index: DiffPositionIndex,
  filePath: string,
  lineRange: [number, number],
): number | null {
  for (let line = lineRange[0]; line <= lineRange[1]; line++) {
    const pos = resolvePosition(index, filePath, line);
    if (pos !== null) return pos;
  }
  return null;
}
