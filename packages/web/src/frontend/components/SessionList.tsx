/**
 * SessionList — Sortable table of sessions with status badges and navigation.
 */

import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionMetadata, SortColumn, SortDirection } from '../utils/session-filters.js';
import { formatDuration } from '../utils/session-filters.js';

interface SessionListProps {
  sessions: readonly SessionMetadata[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSortChange: (column: SortColumn) => void;
  selectedIds: ReadonlySet<string>;
  onSelectionChange: (sessionKey: string, checked: boolean) => void;
  focusedIndex: number;
}

const STATUS_CLASS: Record<string, string> = {
  in_progress: 'status-badge--in-progress',
  completed: 'status-badge--completed',
  failed: 'status-badge--failed',
};

const STATUS_LABEL: Record<string, string> = {
  in_progress: 'In Progress',
  completed: 'Completed',
  failed: 'Failed',
};

function sessionKey(s: SessionMetadata): string {
  return `${s.date}/${s.sessionId}`;
}

function SortIndicator({ column, sortColumn, sortDirection }: {
  column: SortColumn;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
}): React.JSX.Element | null {
  if (column !== sortColumn) return null;
  return <span className="sort-indicator">{sortDirection === 'asc' ? ' \u25B2' : ' \u25BC'}</span>;
}

export function SessionList({
  sessions,
  sortColumn,
  sortDirection,
  onSortChange,
  selectedIds,
  onSelectionChange,
  focusedIndex,
}: SessionListProps): React.JSX.Element {
  const navigate = useNavigate();

  const handleRowClick = useCallback(
    (session: SessionMetadata) => {
      void navigate(`/sessions/${session.date}/${session.sessionId}`);
    },
    [navigate],
  );

  const handleCheckboxChange = useCallback(
    (session: SessionMetadata, e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      onSelectionChange(sessionKey(session), e.target.checked);
    },
    [onSelectionChange],
  );

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  if (sessions.length === 0) {
    return (
      <div className="session-empty">
        <p>No sessions found</p>
      </div>
    );
  }

  return (
    <table className="session-table">
      <thead>
        <tr>
          <th className="session-th session-th--checkbox">
            <span title="Select two sessions to compare">Cmp</span>
          </th>
          <th className="session-th session-th--sortable" onClick={() => onSortChange('date')}>
            Date
            <SortIndicator column="date" sortColumn={sortColumn} sortDirection={sortDirection} />
          </th>
          <th className="session-th session-th--sortable" onClick={() => onSortChange('sessionId')}>
            Session ID
            <SortIndicator column="sessionId" sortColumn={sortColumn} sortDirection={sortDirection} />
          </th>
          <th className="session-th session-th--sortable" onClick={() => onSortChange('status')}>
            Status
            <SortIndicator column="status" sortColumn={sortColumn} sortDirection={sortDirection} />
          </th>
          <th className="session-th session-th--sortable" onClick={() => onSortChange('duration')}>
            Duration
            <SortIndicator column="duration" sortColumn={sortColumn} sortDirection={sortDirection} />
          </th>
          <th className="session-th session-th--sortable" onClick={() => onSortChange('diffPath')}>
            Diff Path
            <SortIndicator column="diffPath" sortColumn={sortColumn} sortDirection={sortDirection} />
          </th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((session, index) => {
          const key = sessionKey(session);
          const duration = session.completedAt
            ? session.completedAt - session.startedAt
            : 0;
          const isFocused = index === focusedIndex;

          return (
            <tr
              key={key}
              className={`session-row${isFocused ? ' session-row--focused' : ''}${selectedIds.has(key) ? ' session-row--selected' : ''}`}
              onClick={() => handleRowClick(session)}
              tabIndex={0}
            >
              <td className="session-td session-td--checkbox">
                <input
                  type="checkbox"
                  checked={selectedIds.has(key)}
                  onChange={(e) => handleCheckboxChange(session, e)}
                  onClick={handleCheckboxClick}
                  disabled={!selectedIds.has(key) && selectedIds.size >= 2}
                />
              </td>
              <td className="session-td">{session.date}</td>
              <td className="session-td">
                <code>{session.sessionId}</code>
              </td>
              <td className="session-td">
                <span className={`status-badge ${STATUS_CLASS[session.status] ?? ''}`}>
                  {STATUS_LABEL[session.status] ?? session.status}
                </span>
              </td>
              <td className="session-td">{formatDuration(duration)}</td>
              <td className="session-td session-td--path">{session.diffPath}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
