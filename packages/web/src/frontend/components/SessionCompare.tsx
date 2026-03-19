/**
 * SessionCompare — Side-by-side comparison of two sessions.
 * Shows new issues, resolved issues, and unchanged issues.
 */

import React from 'react';
import { useApi } from '../hooks/useApi.js';
import type { SessionDetail, CompareResult } from '../utils/session-filters.js';
import { compareSessions } from '../utils/session-filters.js';

interface SessionCompareProps {
  sessionKeys: [string, string];
  onClose: () => void;
}

function CompareSection({ title, issues, className }: {
  title: string;
  issues: readonly { title: string; severity: string; file?: string }[];
  className: string;
}): React.JSX.Element {
  return (
    <div className={`compare-section ${className}`}>
      <h4 className="compare-section__title">
        {title} ({issues.length})
      </h4>
      {issues.length === 0 ? (
        <p className="compare-section__empty">None</p>
      ) : (
        <ul className="compare-section__list">
          {issues.map((issue, i) => (
            <li key={`${issue.severity}-${issue.file ?? ''}-${i}`} className="compare-section__item">
              <span className={`severity-badge severity-badge--${issue.severity.toLowerCase()}`}>
                {issue.severity}
              </span>
              <span className="compare-section__issue-title">{issue.title}</span>
              {issue.file && (
                <code className="compare-section__file">{issue.file}</code>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SessionCompare({ sessionKeys, onClose }: SessionCompareProps): React.JSX.Element {
  const session1 = useApi<SessionDetail>(`/api/sessions/${sessionKeys[0]}`);
  const session2 = useApi<SessionDetail>(`/api/sessions/${sessionKeys[1]}`);

  if (session1.loading || session2.loading) {
    return (
      <div className="compare-view">
        <div className="compare-view__header">
          <h3>Comparing Sessions</h3>
          <button className="compare-view__close" onClick={onClose} type="button">Close</button>
        </div>
        <p className="compare-view__loading">Loading session data...</p>
      </div>
    );
  }

  if (session1.error || session2.error) {
    return (
      <div className="compare-view">
        <div className="compare-view__header">
          <h3>Comparison Error</h3>
          <button className="compare-view__close" onClick={onClose} type="button">Close</button>
        </div>
        <p className="compare-view__error">
          {session1.error ?? session2.error}
        </p>
      </div>
    );
  }

  if (!session1.data || !session2.data) {
    return (
      <div className="compare-view">
        <div className="compare-view__header">
          <h3>No Data</h3>
          <button className="compare-view__close" onClick={onClose} type="button">Close</button>
        </div>
        <p>No session data available for comparison.</p>
      </div>
    );
  }

  const result: CompareResult = compareSessions(session1.data, session2.data);

  return (
    <div className="compare-view">
      <div className="compare-view__header">
        <h3>
          Session {sessionKeys[0]} vs {sessionKeys[1]}
        </h3>
        <button className="compare-view__close" onClick={onClose} type="button">Close</button>
      </div>

      <div className="compare-view__columns">
        <div className="compare-view__column">
          <div className="compare-view__column-header">
            <strong>Session {sessionKeys[0]}</strong>
            <span className={`status-badge status-badge--${session1.data.metadata.status.replace('_', '-')}`}>
              {session1.data.metadata.status}
            </span>
          </div>
        </div>
        <div className="compare-view__column">
          <div className="compare-view__column-header">
            <strong>Session {sessionKeys[1]}</strong>
            <span className={`status-badge status-badge--${session2.data.metadata.status.replace('_', '-')}`}>
              {session2.data.metadata.status}
            </span>
          </div>
        </div>
      </div>

      <div className="compare-view__results">
        <CompareSection
          title="New Issues"
          issues={result.newIssues}
          className="compare-section--new"
        />
        <CompareSection
          title="Resolved Issues"
          issues={result.resolvedIssues}
          className="compare-section--resolved"
        />
        <CompareSection
          title="Unchanged Issues"
          issues={result.unchanged}
          className="compare-section--unchanged"
        />
      </div>
    </div>
  );
}
