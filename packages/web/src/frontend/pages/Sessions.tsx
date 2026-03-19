/**
 * Sessions — Session history browser page.
 * Searchable, filterable session list with trend chart and comparison.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi.js';
import { SessionFilters } from '../components/SessionFilters.js';
import { SessionList } from '../components/SessionList.js';
import { SessionCompare } from '../components/SessionCompare.js';
import { TrendChart } from '../components/TrendChart.js';
import type { TrendDataPoint } from '../components/TrendChart.js';
import type {
  SessionMetadata,
  SessionFilters as SessionFiltersType,
  SortColumn,
  SortDirection,
} from '../utils/session-filters.js';
import {
  filterSessions,
  sortSessions,
} from '../utils/session-filters.js';

const DEFAULT_FILTERS: SessionFiltersType = {
  search: '',
  status: 'all',
  dateFrom: '',
  dateTo: '',
};

/**
 * Aggregate sessions by date for the trend chart.
 */
function buildTrendData(sessions: readonly SessionMetadata[]): TrendDataPoint[] {
  const byDate = new Map<string, number>();

  for (const session of sessions) {
    byDate.set(session.date, (byDate.get(session.date) ?? 0) + 1);
  }

  const sorted = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  return sorted.map(([label, value]) => ({ label, value }));
}

export function Sessions(): React.JSX.Element {
  const { data: rawSessions, loading, error, refetch } = useApi<SessionMetadata[]>('/api/sessions');
  const [filters, setFilters] = useState<SessionFiltersType>(DEFAULT_FILTERS);
  const [sortColumn, setSortColumn] = useState<SortColumn>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [showCompare, setShowCompare] = useState(false);

  const sessions = rawSessions ?? [];

  const filtered = useMemo(
    () => filterSessions(sessions, filters),
    [sessions, filters],
  );

  const sorted = useMemo(
    () => sortSessions(filtered, sortColumn, sortDirection),
    [filtered, sortColumn, sortDirection],
  );

  const trendData = useMemo(
    () => buildTrendData(sessions),
    [sessions],
  );

  const handleSortChange = useCallback((column: SortColumn) => {
    setSortColumn((prev) => {
      if (prev === column) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDirection('asc');
      return column;
    });
  }, []);

  const handleSelectionChange = useCallback((key: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        if (next.size >= 2) return prev;
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const handleCompare = useCallback(() => {
    setShowCompare(true);
  }, []);

  const handleCloseCompare = useCallback(() => {
    setShowCompare(false);
    setSelectedIds(new Set());
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, sorted.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sorted.length]);

  if (loading) {
    return (
      <div className="page">
        <h2>Sessions</h2>
        <p>Loading sessions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h2>Sessions</h2>
        <p className="error-text">Error: {error}</p>
        <button onClick={refetch} type="button" className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  const selectedArray = [...selectedIds];

  return (
    <div className="page">
      <div className="page-header">
        <h2>Sessions</h2>
        <span className="page-header__count">{sorted.length} session{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      <TrendChart data={trendData} title="Sessions per Day" />

      <SessionFilters filters={filters} onFilterChange={setFilters} />

      {selectedIds.size === 2 && !showCompare && (
        <div className="compare-bar">
          <span>{selectedIds.size} sessions selected</span>
          <button onClick={handleCompare} type="button" className="compare-button">
            Compare
          </button>
        </div>
      )}

      {showCompare && selectedArray.length === 2 && (
        <SessionCompare
          sessionKeys={[selectedArray[0], selectedArray[1]]}
          onClose={handleCloseCompare}
        />
      )}

      <SessionList
        sessions={sorted}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        focusedIndex={focusedIndex}
      />
    </div>
  );
}
