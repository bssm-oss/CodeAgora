import React from 'react';
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
                    <code>{line.content}</code>
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
