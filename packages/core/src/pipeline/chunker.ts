/**
 * Diff Chunk Splitter
 * Splits large diffs into token-budget-respecting chunks for reviewer distribution.
 *
 * Main entry: chunkDiff(diffContent, options?) → DiffChunk[]
 * Single chunk when total tokens ≤ maxTokens (backward compat).
 */

import { readFile } from 'fs/promises';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface DiffChunk {
  index: number;
  files: string[];
  diffContent: string;
  estimatedTokens: number;
}

export interface ChunkOptions {
  maxTokens?: number; // default 8000
  cwd?: string;
}

interface ParsedDiffFile {
  filePath: string;
  content: string; // full diff section including headers
  hunks: string[];
}

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count using chars/4 heuristic
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ============================================================================
// Diff Parsing
// ============================================================================

/**
 * Parse a unified diff into per-file entries.
 * Each entry preserves the `diff --git`, `---`, `+++` headers and all hunks.
 */
export function parseDiffFiles(diff: string): ParsedDiffFile[] {
  if (!diff.trim()) return [];

  const sections = diff.split(/(?=diff --git )/);
  const files: ParsedDiffFile[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed.startsWith('diff --git ')) continue;

    const match = trimmed.match(/diff --git a\/(.+?) b\/(.+)/);
    if (!match) continue;

    const filePath = match[2];

    // Extract hunks (sections starting with @@)
    const hunkMatches = trimmed.split(/(?=^@@)/m);
    const hunks: string[] = [];
    for (const h of hunkMatches) {
      if (h.trimStart().startsWith('@@')) {
        hunks.push(h);
      }
    }

    files.push({
      filePath,
      content: trimmed,
      hunks,
    });
  }

  return files;
}

// ============================================================================
// Large File Splitting
// ============================================================================

/**
 * Extract the header portion of a diff section (everything before the first @@).
 */
function extractDiffHeader(content: string): string {
  const idx = content.search(/^@@/m);
  if (idx === -1) return content;
  return content.slice(0, idx);
}

/**
 * Split a file that exceeds maxTokens by hunk boundaries.
 * Each split preserves the diff --git/---/+++ headers.
 * If a single hunk exceeds maxTokens, it is returned as-is (best effort).
 */
export function splitLargeFile(
  file: ParsedDiffFile,
  maxTokens: number
): Array<{ filePath: string; content: string }> {
  if (estimateTokens(file.content) <= maxTokens) {
    return [{ filePath: file.filePath, content: file.content }];
  }

  if (file.hunks.length <= 1) {
    // Cannot split further — return as-is
    return [{ filePath: file.filePath, content: file.content }];
  }

  const header = extractDiffHeader(file.content);
  const headerTokens = estimateTokens(header);
  const results: Array<{ filePath: string; content: string }> = [];
  let currentHunks: string[] = [];
  let currentTokens = headerTokens;

  for (const hunk of file.hunks) {
    const hunkTokens = estimateTokens(hunk);

    if (currentHunks.length > 0 && currentTokens + hunkTokens > maxTokens) {
      // Flush current accumulation
      results.push({
        filePath: file.filePath,
        content: header + currentHunks.join(''),
      });
      currentHunks = [];
      currentTokens = headerTokens;
    }

    currentHunks.push(hunk);
    currentTokens += hunkTokens;
  }

  // Flush remaining
  if (currentHunks.length > 0) {
    results.push({
      filePath: file.filePath,
      content: header + currentHunks.join(''),
    });
  }

  return results;
}

// ============================================================================
// File Grouping into Chunks
// ============================================================================

/**
 * Get the directory (depth-2) for grouping purposes.
 */
function getFileDir(filePath: string): string {
  const parts = filePath.split('/');
  return parts.slice(0, Math.min(2, parts.length - 1)).join('/') || 'root';
}

/**
 * Group files into chunks respecting maxTokens budget.
 * Same-directory files are grouped together when possible.
 * Small chunks (< maxTokens * 0.3) are merged with adjacent.
 */
export function chunkDiffFiles(
  files: Array<{ filePath: string; content: string }>,
  maxTokens: number
): DiffChunk[] {
  if (files.length === 0) return [];

  // Group by directory first
  const dirMap = new Map<string, Array<{ filePath: string; content: string }>>();
  for (const file of files) {
    const dir = getFileDir(file.filePath);
    if (!dirMap.has(dir)) {
      dirMap.set(dir, []);
    }
    dirMap.get(dir)!.push(file);
  }

  // Build chunks respecting budget
  const rawChunks: Array<{
    files: string[];
    contents: string[];
    tokens: number;
  }> = [];

  for (const [, dirFiles] of dirMap) {
    let currentChunk = { files: [] as string[], contents: [] as string[], tokens: 0 };

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

  // Merge small chunks (< 30% of budget) with adjacent
  const mergedChunks: typeof rawChunks = [];
  const smallThreshold = maxTokens * 0.3;

  for (const chunk of rawChunks) {
    if (
      mergedChunks.length > 0 &&
      chunk.tokens < smallThreshold &&
      mergedChunks[mergedChunks.length - 1].tokens + chunk.tokens <= maxTokens
    ) {
      const last = mergedChunks[mergedChunks.length - 1];
      last.files.push(...chunk.files);
      last.contents.push(...chunk.contents);
      last.tokens += chunk.tokens;
    } else if (
      mergedChunks.length > 0 &&
      mergedChunks[mergedChunks.length - 1].tokens < smallThreshold &&
      mergedChunks[mergedChunks.length - 1].tokens + chunk.tokens <= maxTokens
    ) {
      const last = mergedChunks[mergedChunks.length - 1];
      last.files.push(...chunk.files);
      last.contents.push(...chunk.contents);
      last.tokens += chunk.tokens;
    } else {
      mergedChunks.push({ ...chunk });
    }
  }

  // Convert to DiffChunk[]
  return mergedChunks.map((chunk, index) => {
    const joined = chunk.contents.join('\n');
    return {
      index,
      files: chunk.files,
      diffContent: joined,
      estimatedTokens: estimateTokens(joined),
    };
  });
}

// ============================================================================
// .reviewignore Filter
// ============================================================================

/**
 * Simple glob pattern matching (supports *, **, and ? wildcards).
 * No external dependency required.
 */
function globToRegex(pattern: string): RegExp {
  let regex = '';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches any path segment(s)
        if (pattern[i + 2] === '/') {
          regex += '(?:.+/)?';
          i += 3;
        } else {
          regex += '.*';
          i += 2;
        }
      } else {
        // * matches anything except /
        regex += '[^/]*';
        i += 1;
      }
    } else if (char === '?') {
      regex += '[^/]';
      i += 1;
    } else if (char === '.') {
      regex += '\\.';
      i += 1;
    } else {
      regex += char.replace(/[+()[\]{}^$|\\]/g, '\\$&');
      i += 1;
    }
  }

  return new RegExp(`^${regex}$`);
}

/**
 * Filter out files matching .reviewignore patterns.
 */
export function filterIgnoredFiles<T extends { filePath: string }>(
  files: T[],
  patterns: string[]
): T[] {
  if (patterns.length === 0) return files;

  const regexes = patterns
    .filter((p) => p.trim() && !p.startsWith('#'))
    .map((p) => globToRegex(p.trim()));

  return files.filter((file) => {
    return !regexes.some((rx) => rx.test(file.filePath));
  });
}

/**
 * Read .reviewignore patterns from CWD.
 * Returns empty array if file doesn't exist.
 */
export async function loadReviewIgnorePatterns(cwd?: string): Promise<string[]> {
  const filePath = path.join(cwd ?? process.cwd(), '.reviewignore');
  try {
    const content = await readFile(filePath, 'utf-8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Split a diff into token-budget-respecting chunks.
 * If total tokens <= maxTokens, returns a single chunk (backward compat).
 */
export async function chunkDiff(diffContent: string, options?: ChunkOptions): Promise<DiffChunk[]> {
  const maxTokens = options?.maxTokens ?? 8000;

  if (!diffContent.trim()) return [];

  // 1. Parse diff into per-file entries
  const parsedFiles = parseDiffFiles(diffContent);
  if (parsedFiles.length === 0) return [];

  // 2. Apply .reviewignore filter
  const ignorePatterns = await loadReviewIgnorePatterns(options?.cwd);
  const filteredFiles = filterIgnoredFiles(parsedFiles, ignorePatterns);
  if (filteredFiles.length === 0) return [];

  // 3. Split large files by hunk boundaries
  const splitFiles: Array<{ filePath: string; content: string }> = [];
  for (const file of filteredFiles) {
    splitFiles.push(...splitLargeFile(file, maxTokens));
  }

  // 4. Check if everything fits in a single chunk
  const totalTokens = splitFiles.reduce((sum, f) => sum + estimateTokens(f.content), 0);
  if (totalTokens <= maxTokens) {
    const joined = splitFiles.map((f) => f.content).join('\n');
    return [
      {
        index: 0,
        files: [...new Set(splitFiles.map((f) => f.filePath))],
        diffContent: joined,
        estimatedTokens: estimateTokens(joined),
      },
    ];
  }

  // 5. Group into chunks
  return chunkDiffFiles(splitFiles, maxTokens);
}
