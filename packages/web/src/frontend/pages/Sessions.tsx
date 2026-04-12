/**
 * Sessions — Session history browser page.
 * Searchable, filterable session list with trend chart and comparison.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { SessionFilters } from '../components/SessionFilters.js';
import { SessionList } from '../components/SessionList.js';
import { TrendChart } from '../components/TrendChart.js';
import type { TrendDataPoint } from '../components/TrendChart.js';
import type {
  SessionMetadata,
  SessionFilters as SessionFiltersType,
  SortColumn,
  SortDirection,
} from '../utils/session-filters.js';
import {
  sortSessions,
} from '../utils/session-filters.js';

// ============================================================================
// Types
// ============================================================================

interface PaginatedResponse {
  items: SessionMetadata[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================================
// Constants
// ============================================================================

const PAGE_SIZE = 50;

const DEFAULT_FILTERS: SessionFiltersType = {
  search: '',
  status: 'all',
  dateFrom: '',
  dateTo: '',
};

// ============================================================================
// Helpers
// ============================================================================

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

// ============================================================================
// Component
// ============================================================================

export function Sessions(): React.JSX.Element {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<SessionFiltersType>(DEFAULT_FILTERS);
  const [sortColumn, setSortColumn] = useState<SortColumn>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Build API URL with server-side filters
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.search) params.set('search', filters.search);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    return `/api/sessions?${params.toString()}`;
  }, [page, filters]);

  const { data: response, loading, error, refetch } = useApi<PaginatedResponse>(apiUrl);

  // Reset to page 1 when filters change
  const handleFilterChange = useCallback((newFilters: SessionFiltersType) => {
    setFilters(newFilters);
    setPage(1);
  }, []);

  const sessions = response?.items ?? [];
  const total = response?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const sorted = useMemo(
    () => sortSessions(sessions, sortColumn, sortDirection),
    [sessions, sortColumn, sortDirection],
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
    const keys = [...selectedIds];
    if (keys.length !== 2) return;
    const [keyA, keyB] = keys;
    void navigate(`/compare/${keyA}/${keyB}`);
  }, [selectedIds, navigate]);

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

  return (
    <div className="page">
      <div className="page-header">
        <h2>Sessions</h2>
        <span className="page-header__count">{total} session{total !== 1 ? 's' : ''}</span>
      </div>

      <TrendChart data={trendData} title="Sessions per Day" />

      <SessionFilters filters={filters} onFilterChange={handleFilterChange} />

      {selectedIds.size === 2 && (
        <div className="compare-bar">
          <span>{selectedIds.size} sessions selected</span>
          <button onClick={handleCompare} type="button" className="compare-button">
            Compare Selected
          </button>
        </div>
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

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <nav className="pagination" aria-label="Session pagination">
          <button
            className="pagination__button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            type="button"
          >
            Previous
          </button>
          <span className="pagination__info">
            Page {page} of {totalPages}
          </span>
          <button
            className="pagination__button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            type="button"
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
