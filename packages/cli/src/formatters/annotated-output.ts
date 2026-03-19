/**
 * Annotated Output Formatter
 * Shows diff with inline issue annotations after relevant lines.
 *
 * Note: uses summary.topIssues (top 5 only) as the evidence source for v1.
 * Full EvidenceDocument list would require passing all docs from the pipeline.
 */

import pc from 'picocolors';
import { severityColor } from '../utils/colors.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';

const HEADER_WIDTH = 60;

/**
 * Severity badge prefix symbols.
 */
const SEVERITY_SYMBOL: Record<string, string> = {
  HARSHLY_CRITICAL: '✖',
  CRITICAL: '⚠',
  WARNING: '⚠',
  SUGGESTION: '→',
};

/**
 * Parse a unified diff string into per-file blocks.
 * Returns an array of { filePath, lines } where lines includes the raw diff lines.
 */
function parseDiffFiles(diffContent: string): Array<{ filePath: string; lines: string[] }> {
  const files: Array<{ filePath: string; lines: string[] }> = [];
  let currentFile: { filePath: string; lines: string[] } | null = null;

  for (const line of diffContent.split('\n')) {
    const headerMatch = line.match(/^diff --git a\/.+ b\/(.+)$/);
    if (headerMatch) {
      if (currentFile) files.push(currentFile);
      currentFile = { filePath: headerMatch[1]!, lines: [] };
      continue;
    }
    if (currentFile) {
      currentFile.lines.push(line);
    }
  }
  if (currentFile) files.push(currentFile);
  return files;
}

/**
 * Extract the actual diff lines (those starting with +, -, or space)
 * along with their new-file line numbers.
 */
interface DiffLine {
  type: '+' | '-' | ' ';
  content: string;
  lineNo: number; // new-file line number (for + and context lines)
}

function extractDiffLines(rawLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let newLineNo = 0;

  for (const raw of rawLines) {
    // Parse hunk header: @@ -old,count +new,count @@
    const hunkMatch = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      newLineNo = parseInt(hunkMatch[1]!, 10) - 1;
      continue;
    }

    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      newLineNo++;
      result.push({ type: '+', content: raw.slice(1), lineNo: newLineNo });
    } else if (raw.startsWith('-') && !raw.startsWith('---')) {
      // Deleted lines don't advance newLineNo
      result.push({ type: '-', content: raw.slice(1), lineNo: newLineNo });
    } else if (raw.startsWith(' ')) {
      newLineNo++;
      result.push({ type: ' ', content: raw.slice(1), lineNo: newLineNo });
    }
    // Skip file metadata lines (---, +++, index, etc.)
  }

  return result;
}

/**
 * Format a single diff line with line number and color.
 */
function formatDiffLine(dl: DiffLine): string {
  const lineNumStr = pc.dim(String(dl.lineNo).padStart(4));
  const separator = pc.dim(' │ ');
  const prefix = dl.type === '+' ? pc.green('+') : dl.type === '-' ? pc.red('-') : ' ';
  const content =
    dl.type === '+' ? pc.green(dl.content) :
    dl.type === '-' ? pc.red(dl.content) :
    dl.content;
  return `${lineNumStr}${separator}${prefix}${content}`;
}

/**
 * Format an issue badge line.
 */
function formatIssueBadge(issue: EvidenceDocument): string {
  const symbol = SEVERITY_SYMBOL[issue.severity] ?? '•';
  const colorFn = severityColor[issue.severity as keyof typeof severityColor] ?? ((s: string) => s);
  const badge = colorFn(`${symbol} [${issue.severity}] ${issue.issueTitle}`);
  return `     ${pc.dim('│')}  ${badge}`;
}

/**
 * Build a file header line.
 * e.g. ── src/auth/login.ts ──────────────────────────
 */
function formatFileHeader(filePath: string): string {
  const label = ` ${filePath} `;
  const dashes = '─'.repeat(Math.max(4, HEADER_WIDTH - label.length - 4));
  return pc.bold(`── ${label}─${dashes}`);
}

/**
 * Format a unified diff with inline issue annotations.
 *
 * @param diffContent  Raw unified diff string
 * @param evidenceDocs Array of EvidenceDocument to annotate inline
 */
export function formatAnnotated(
  diffContent: string,
  evidenceDocs: EvidenceDocument[]
): string {
  const output: string[] = [];
  const files = parseDiffFiles(diffContent);

  if (files.length === 0) {
    return pc.dim('(no diff content)');
  }

  for (const file of files) {
    const fileIssues = evidenceDocs.filter(
      (doc) => doc.filePath === file.filePath || file.filePath.endsWith(doc.filePath)
    );

    const diffLines = extractDiffLines(file.lines);
    const totalLines = diffLines.length;

    output.push(formatFileHeader(file.filePath));

    if (fileIssues.length === 0) {
      output.push(pc.dim(`  (no issues, ${totalLines} lines collapsed)`));
      output.push('');
      continue;
    }

    // Build a map: new-file line number → issues that start on that line
    const issuesByLine = new Map<number, EvidenceDocument[]>();
    for (const issue of fileIssues) {
      const [startLine] = issue.lineRange;
      const bucket = issuesByLine.get(startLine) ?? [];
      bucket.push(issue);
      issuesByLine.set(startLine, bucket);
    }

    // Render diff lines; after each + or context line emit any matching badges
    for (const dl of diffLines) {
      output.push(formatDiffLine(dl));

      if (dl.type !== '-') {
        const badges = issuesByLine.get(dl.lineNo);
        if (badges) {
          for (const issue of badges) {
            output.push(formatIssueBadge(issue));
          }
        }
      }
    }

    output.push('');
  }

  return output.join('\n');
}
