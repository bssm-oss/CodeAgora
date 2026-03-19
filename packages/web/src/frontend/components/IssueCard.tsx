import React, { useState } from 'react';
import { SeverityBadge } from './SeverityBadge.js';
import type { Severity } from '../utils/review-helpers.js';

interface IssueCardProps {
  issueTitle: string;
  problem: string;
  evidence: string[];
  severity: Severity;
  suggestion: string;
  filePath: string;
  lineRange: [number, number];
  confidence?: number;
  reviewers: string[];
}

export function IssueCard({
  issueTitle,
  problem,
  evidence,
  severity,
  suggestion,
  filePath,
  lineRange,
  confidence,
  reviewers,
}: IssueCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`issue-card ${expanded ? 'issue-card--expanded' : ''}`}>
      <button
        className="issue-card__header"
        onClick={() => setExpanded(!expanded)}
        type="button"
        aria-expanded={expanded}
      >
        <div className="issue-card__header-left">
          <SeverityBadge severity={severity} />
          <span className="issue-card__title">{issueTitle}</span>
        </div>
        <div className="issue-card__header-right">
          {confidence !== undefined && (
            <span className="issue-card__confidence">{Math.round(confidence * 100)}%</span>
          )}
          <span className="issue-card__location">
            {filePath}:{lineRange[0]}-{lineRange[1]}
          </span>
          <span className="issue-card__toggle">{expanded ? '\u25B2' : '\u25BC'}</span>
        </div>
      </button>
      {expanded && (
        <div className="issue-card__body">
          <div className="issue-card__section">
            <h4 className="issue-card__section-title">Problem</h4>
            <p className="issue-card__text">{problem}</p>
          </div>
          {evidence.length > 0 && (
            <div className="issue-card__section">
              <h4 className="issue-card__section-title">Evidence</h4>
              <ul className="issue-card__evidence-list">
                {evidence.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="issue-card__section">
            <h4 className="issue-card__section-title">Suggestion</h4>
            <p className="issue-card__text">{suggestion}</p>
          </div>
          <div className="issue-card__section">
            <h4 className="issue-card__section-title">Flagged by</h4>
            <div className="issue-card__reviewers">
              {reviewers.map((r) => (
                <span key={r} className="issue-card__reviewer-tag">{r}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
