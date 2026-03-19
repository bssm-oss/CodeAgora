import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionList } from '../../../src/frontend/components/SessionList.js';
import type { SessionMetadata, SortColumn, SortDirection } from '../../../src/frontend/utils/session-filters.js';

const SAMPLE_SESSIONS: SessionMetadata[] = [
  {
    sessionId: 'abc-001',
    date: '2024-01-15',
    timestamp: 1705276800000,
    diffPath: 'diffs/abc-001.diff',
    status: 'completed',
    startedAt: 1705276800000,
    completedAt: 1705276860000,
  },
  {
    sessionId: 'abc-002',
    date: '2024-01-16',
    timestamp: 1705363200000,
    diffPath: 'diffs/abc-002.diff',
    status: 'failed',
    startedAt: 1705363200000,
    completedAt: 1705363230000,
  },
  {
    sessionId: 'abc-003',
    date: '2024-01-17',
    timestamp: 1705449600000,
    diffPath: 'diffs/abc-003.diff',
    status: 'in_progress',
    startedAt: 1705449600000,
  },
];

function renderList(
  sessions: SessionMetadata[] = SAMPLE_SESSIONS,
  sortColumn: SortColumn = 'date',
  sortDirection: SortDirection = 'desc',
  selectedIds: Set<string> = new Set(),
  onSortChange = vi.fn(),
  onSelectionChange = vi.fn(),
  focusedIndex = -1,
) {
  return render(
    <MemoryRouter>
      <SessionList
        sessions={sessions}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        selectedIds={selectedIds}
        onSelectionChange={onSelectionChange}
        focusedIndex={focusedIndex}
      />
    </MemoryRouter>
  );
}

describe('SessionList', () => {
  it('renders table rows with session data', () => {
    renderList();
    expect(screen.getByText('abc-001')).toBeInTheDocument();
    expect(screen.getByText('abc-002')).toBeInTheDocument();
    expect(screen.getByText('abc-003')).toBeInTheDocument();
    expect(screen.getByText('2024-01-15')).toBeInTheDocument();
    expect(screen.getByText('diffs/abc-001.diff')).toBeInTheDocument();
  });

  it('shows status badges with correct classes', () => {
    renderList();
    const completedBadge = screen.getByText('Completed');
    expect(completedBadge).toHaveClass('status-badge--completed');

    const failedBadge = screen.getByText('Failed');
    expect(failedBadge).toHaveClass('status-badge--failed');

    const inProgressBadge = screen.getByText('In Progress');
    expect(inProgressBadge).toHaveClass('status-badge--in-progress');
  });

  it('calls onSortChange when column header is clicked', () => {
    const onSortChange = vi.fn();
    renderList(SAMPLE_SESSIONS, 'date', 'desc', new Set(), onSortChange);
    fireEvent.click(screen.getByText('Status'));
    expect(onSortChange).toHaveBeenCalledWith('status');
  });

  it('shows "No sessions found" when empty', () => {
    renderList([]);
    expect(screen.getByText('No sessions found')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders sortable column headers for date, sessionId, status, duration, diffPath', () => {
    renderList();
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    // All sortable columns are clickable th elements
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Session ID')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Diff Path')).toBeInTheDocument();
  });

  it('applies focused class to the focused row', () => {
    renderList(SAMPLE_SESSIONS, 'date', 'desc', new Set(), vi.fn(), vi.fn(), 1);
    const rows = screen.getAllByRole('row');
    // rows[0] is thead tr, rows[1] is first data row (index 0), rows[2] is second (index 1)
    expect(rows[2]).toHaveClass('session-row--focused');
    expect(rows[1]).not.toHaveClass('session-row--focused');
  });
});
