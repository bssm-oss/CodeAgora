/**
 * Auto-approve: trivial diff detection
 * Skips LLM pipeline when all changes are comments, blanks, docs files, or import reorders.
 */

// ============================================================================
// Types
// ============================================================================

export interface TrivialAnalysisResult {
  isTrivial: boolean;
  reason?: 'comments-only' | 'docs-only' | 'blank-lines-only' | 'import-reorder';
  stats: {
    totalLines: number;
    codeLines: number;
    commentLines: number;
    blankLines: number;
  };
}

// ============================================================================
// Pattern helpers
// ============================================================================

const COMMENT_RE = /^\s*(\/\/|\/\*|\*\/|\*|#)/;
const BLANK_RE = /^\s*$/;
const IMPORT_RE = /^\s*(import |from |require\(|export .* from)/;

/**
 * Match a file path against a glob-style pattern.
 * Supports: *.ext  and  prefix/**
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  // Normalize path separators
  const normalized = filePath.replace(/\\/g, '/');

  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(prefix + '/');
  }

  if (pattern.startsWith('*.')) {
    const ext = pattern.slice(1); // e.g. ".md"
    return normalized.endsWith(ext);
  }

  // Exact match or simple wildcard
  if (pattern.includes('*')) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(normalized);
  }

  return normalized === pattern;
}

function fileMatchesAnyPattern(filePath: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesPattern(filePath, p));
}

// ============================================================================
// Diff parsing
// ============================================================================

interface FileDiff {
  filePath: string;
  changedLines: string[]; // the content after the leading +/-
}

function parseDiff(diffContent: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: FileDiff | null = null;

  for (const raw of diffContent.split('\n')) {
    // New file header: "diff --git a/foo b/foo" or "+++ b/foo"
    if (raw.startsWith('+++ ')) {
      const path = raw.slice(4).replace(/^b\//, '');
      current = { filePath: path, changedLines: [] };
      files.push(current);
      continue;
    }

    if (!current) continue;

    // Only collect added/removed lines (skip context and hunk headers)
    if ((raw.startsWith('+') || raw.startsWith('-')) && !raw.startsWith('+++') && !raw.startsWith('---')) {
      current.changedLines.push(raw.slice(1)); // strip leading +/-
    }
  }

  return files;
}

// ============================================================================
// Public API
// ============================================================================

export function analyzeTrivialDiff(
  diffContent: string,
  config: { maxLines: number; allowedFilePatterns: string[] }
): TrivialAnalysisResult {
  const empty: TrivialAnalysisResult = {
    isTrivial: true,
    reason: 'blank-lines-only',
    stats: { totalLines: 0, codeLines: 0, commentLines: 0, blankLines: 0 },
  };

  if (!diffContent.trim()) return empty;

  const files = parseDiff(diffContent);
  if (files.length === 0) return empty;

  // Check docs-only: every changed file matches an allowed pattern
  const allDocsOnly = files.every((f) =>
    fileMatchesAnyPattern(f.filePath, config.allowedFilePatterns)
  );
  if (allDocsOnly) {
    const allLines = files.flatMap((f) => f.changedLines);
    const totalLines = allLines.length;
    const commentLines = allLines.filter((l) => COMMENT_RE.test(l)).length;
    const blankLines = allLines.filter((l) => BLANK_RE.test(l)).length;
    const codeLines = totalLines - commentLines - blankLines;
    return {
      isTrivial: true,
      reason: 'docs-only',
      stats: { totalLines, codeLines, commentLines, blankLines },
    };
  }

  // Collect all changed lines across non-docs files
  const nonDocsLines = files
    .filter((f) => !fileMatchesAnyPattern(f.filePath, config.allowedFilePatterns))
    .flatMap((f) => f.changedLines);

  const totalLines = nonDocsLines.length;
  const commentLines = nonDocsLines.filter((l) => COMMENT_RE.test(l)).length;
  const blankLines = nonDocsLines.filter((l) => BLANK_RE.test(l)).length;
  const importLines = nonDocsLines.filter((l) => IMPORT_RE.test(l)).length;

  // isTrivial when no non-trivial content exists
  const nonTrivialLines = totalLines - commentLines - blankLines - importLines;

  // Determine overall stats (including docs files for stats)
  const allLines = files.flatMap((f) => f.changedLines);
  const statsTotal = allLines.length;
  const statsComment = allLines.filter((l) => COMMENT_RE.test(l)).length;
  const statsBlank = allLines.filter((l) => BLANK_RE.test(l)).length;
  const statsCode = statsTotal - statsComment - statsBlank;

  const stats = {
    totalLines: statsTotal,
    codeLines: statsCode,
    commentLines: statsComment,
    blankLines: statsBlank,
  };

  if (nonTrivialLines === 0 && totalLines > 0) {
    // All non-docs lines are imports, comments, or blanks — determine best reason
    if (commentLines > 0 && blankLines === 0 && importLines === 0) {
      return { isTrivial: true, reason: 'comments-only', stats };
    }
    if (blankLines > 0 && commentLines === 0 && importLines === 0) {
      return { isTrivial: true, reason: 'blank-lines-only', stats };
    }
    if (importLines > 0 && commentLines === 0 && blankLines === 0) {
      return { isTrivial: true, reason: 'import-reorder', stats };
    }
    // Mixed trivial (blanks + comments, etc.) — use comments-only as fallback reason
    return { isTrivial: true, reason: 'comments-only', stats };
  }

  // maxLines shortcut: if total changed lines across all files is small and no code
  if (statsTotal <= config.maxLines && statsCode === 0) {
    return { isTrivial: true, reason: 'blank-lines-only', stats };
  }

  // Not trivial
  return { isTrivial: false, stats };
}
