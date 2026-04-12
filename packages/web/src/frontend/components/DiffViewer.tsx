import React, { useMemo } from 'react';
import { SeverityBadge } from './SeverityBadge.js';
import { parseDiffLines } from '../utils/review-helpers.js';
import type { DiffIssueMarker, ParsedDiffLine } from '../utils/review-helpers.js';

// ============================================================================
// Types
// ============================================================================

interface DiffViewerProps {
  diffText: string;
  issues?: DiffIssueMarker[];
  onIssueClick?: (issueTitle: string) => void;
}

// ============================================================================
// Syntax Highlight Tokens
// ============================================================================

interface HighlightToken {
  text: string;
  className: string;
}

const HIGHLIGHT_RULES: Array<{ pattern: RegExp; className: string }> = [
  // Comments (single-line)
  { pattern: /(\/\/.*$|#.*$)/m, className: 'syntax-comment' },
  // Strings (double-quoted, single-quoted, template literals)
  { pattern: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/, className: 'syntax-string' },
  // Keywords
  { pattern: /\b(import|export|from|const|let|var|function|return|if|else|for|while|class|interface|type|async|await|try|catch|finally|throw|new|typeof|instanceof|in|of|switch|case|break|default|continue|do|extends|implements|enum|abstract|private|protected|public|static|readonly|override|declare|namespace|module)\b/, className: 'syntax-keyword' },
  // Built-in values
  { pattern: /\b(true|false|null|undefined|NaN|Infinity|void|this|super)\b/, className: 'syntax-builtin' },
  // Numbers
  { pattern: /\b(\d+\.?\d*(?:e[+-]?\d+)?|0x[0-9a-f]+|0o[0-7]+|0b[01]+)\b/i, className: 'syntax-number' },
];

function highlightLine(text: string): HighlightToken[] {
  if (!text) return [{ text: '', className: '' }];

  const tokens: HighlightToken[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let earliestMatch: { index: number; length: number; className: string } | null = null;

    for (const rule of HIGHLIGHT_RULES) {
      const match = rule.pattern.exec(remaining);
      if (match && match[1] !== undefined) {
        const idx = match.index + (match[0].indexOf(match[1]));
        if (!earliestMatch || idx < earliestMatch.index) {
          earliestMatch = { index: idx, length: match[1].length, className: rule.className };
        }
      }
    }

    if (!earliestMatch) {
      tokens.push({ text: remaining, className: '' });
      break;
    }

    if (earliestMatch.index > 0) {
      tokens.push({ text: remaining.slice(0, earliestMatch.index), className: '' });
    }
    tokens.push({
      text: remaining.slice(earliestMatch.index, earliestMatch.index + earliestMatch.length),
      className: earliestMatch.className,
    });
    remaining = remaining.slice(earliestMatch.index + earliestMatch.length);
  }

  return tokens;
}

// ============================================================================
// Helpers
// ============================================================================

function getLineClass(type: ParsedDiffLine['type']): string {
  switch (type) {
    case 'added':
      return 'diff-line diff-added';
    case 'removed':
      return 'diff-line diff-removed';
    case 'header':
      return 'diff-line diff-header';
    default:
      return 'diff-line diff-context';
  }
}

function findIssuesForLine(lineNumber: number | null, issues: DiffIssueMarker[]): DiffIssueMarker[] {
  if (lineNumber === null) return [];
  return issues.filter((issue) => lineNumber >= issue.lineStart && lineNumber <= issue.lineEnd);
}

// ============================================================================
// Component
// ============================================================================

function HighlightedCode({ text }: { text: string }): React.JSX.Element {
  const tokens = useMemo(() => highlightLine(text), [text]);
  return (
    <code>
      {tokens.map((token, i) =>
        token.className ? (
          <span key={i} className={token.className}>{token.text}</span>
        ) : (
          <React.Fragment key={i}>{token.text}</React.Fragment>
        ),
      )}
    </code>
  );
}

export function DiffViewer({ diffText, issues = [], onIssueClick }: DiffViewerProps): React.JSX.Element {
  const lines = parseDiffLines(diffText);

  return (
    <div className="diff-viewer">
      <table className="diff-viewer__table">
        <tbody>
          {lines.map((line, idx) => {
            const lineNumber = line.newLineNumber ?? line.oldLineNumber;
            const matchedIssues = findIssuesForLine(lineNumber, issues);
            const hasIssue = matchedIssues.length > 0;

            return (
              <React.Fragment key={idx}>
                <tr className={`${getLineClass(line.type)} ${hasIssue ? 'diff-line--has-issue' : ''}`}>
                  <td className="diff-line__number diff-line__number--old">
                    {line.oldLineNumber ?? ''}
                  </td>
                  <td className="diff-line__number diff-line__number--new">
                    {line.newLineNumber ?? ''}
                  </td>
                  <td className="diff-line__content">
                    {line.type === 'header' ? (
                      <code>{line.content}</code>
                    ) : (
                      <HighlightedCode text={line.content} />
                    )}
                  </td>
                </tr>
                {hasIssue &&
                  matchedIssues.map((issue, issueIdx) => (
                    <tr key={`issue-${idx}-${issueIdx}`} className="diff-line diff-line--issue-marker">
                      <td className="diff-line__number" colSpan={2} />
                      <td className="diff-line__content">
                        <button
                          className="diff-issue-marker"
                          onClick={() => onIssueClick?.(issue.issueTitle)}
                          type="button"
                        >
                          <SeverityBadge severity={issue.severity} />
                          <span className="diff-issue-marker__title">{issue.issueTitle}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
