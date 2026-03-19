/**
 * Custom Review Rules Matcher
 * Runs compiled rules against diff added lines and produces EvidenceDocuments.
 */

import type { EvidenceDocument } from '../types/core.js';
import type { CompiledRule } from './types.js';

// ============================================================================
// Diff Parsing
// ============================================================================

interface DiffLine {
  content: string;
  lineNum: number;
}

interface DiffFile {
  filePath: string;
  addedLines: DiffLine[];
}

/**
 * Parse unified diff into per-file added lines with line numbers.
 */
function parseDiffFiles(diffContent: string): DiffFile[] {
  const files: DiffFile[] = [];
  // Split on file headers
  const sections = diffContent.split(/(?=diff --git )/);

  for (const section of sections) {
    if (!section.trim()) continue;

    // Extract file path from diff header: diff --git a/path b/path
    const headerMatch = section.match(/diff --git a\/.+ b\/(.+)/);
    if (!headerMatch) continue;

    const filePath = headerMatch[1].trim();
    const addedLines: DiffLine[] = [];

    let currentNewLine = 0;
    const lines = section.split('\n');

    for (const line of lines) {
      // Hunk header: @@ -X,Y +Z,W @@
      if (line.startsWith('@@')) {
        const hunkMatch = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (hunkMatch) {
          currentNewLine = parseInt(hunkMatch[1], 10) - 1;
        }
        continue;
      }

      if (line.startsWith('+') && !line.startsWith('+++')) {
        // Added line
        currentNewLine++;
        addedLines.push({ content: line.slice(1), lineNum: currentNewLine });
      } else if (line.startsWith(' ')) {
        // Context line — advances new-file line counter only
        currentNewLine++;
      }
      // Removed lines ('-') do not advance new-file counter
    }

    files.push({ filePath, addedLines });
  }

  return files;
}

// ============================================================================
// Glob Matching (simple, no external dep)
// ============================================================================

/**
 * Match a file path against a glob pattern.
 * Supports * (any chars except /) and ** (any chars including /).
 */
function matchGlob(filePath: string, pattern: string): boolean {
  // Escape regex special chars except * which we handle specially
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x00') // placeholder for **
    .replace(/\*/g, '[^/]*')
    .replace(/\x00/g, '.*');

  const regex = new RegExp(`^${regexStr}$`);
  // Match against the full path or just the basename
  return regex.test(filePath) || regex.test(filePath.split('/').pop() ?? filePath);
}

// ============================================================================
// Main Matcher
// ============================================================================

/**
 * Run compiled rules against diff added lines, returning EvidenceDocuments.
 */
export function matchRules(diffContent: string, rules: CompiledRule[]): EvidenceDocument[] {
  const diffFiles = parseDiffFiles(diffContent);
  const results: EvidenceDocument[] = [];

  for (const { filePath, addedLines } of diffFiles) {
    for (const rule of rules) {
      // Apply filePatterns filter if specified
      if (rule.filePatterns && rule.filePatterns.length > 0) {
        const matchesAny = rule.filePatterns.some((p) => matchGlob(filePath, p));
        if (!matchesAny) continue;
      }

      for (const { content, lineNum } of addedLines) {
        if (rule.regex.test(content)) {
          results.push({
            issueTitle: `Rule: ${rule.id}`,
            problem: rule.message,
            evidence: [
              `Pattern matched: \`${rule.pattern}\``,
              `Line: ${content.trim()}`,
            ],
            severity: rule.severity,
            suggestion: `Fix the ${rule.id} violation`,
            filePath,
            lineRange: [lineNum, lineNum],
            source: 'rule',
          });
        }
      }
    }
  }

  return results;
}
