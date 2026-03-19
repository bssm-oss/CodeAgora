/**
 * SessionFilters — Filter controls for session list.
 * Text search, status dropdown, and date range inputs.
 */

import React from 'react';
import type { SessionFilters as SessionFiltersType } from '../utils/session-filters.js';
import { countActiveFilters } from '../utils/session-filters.js';

interface SessionFiltersProps {
  filters: SessionFiltersType;
  onFilterChange: (filters: SessionFiltersType) => void;
}

export function SessionFilters({ filters, onFilterChange }: SessionFiltersProps): React.JSX.Element {
  const activeCount = countActiveFilters(filters);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>): void {
    onFilterChange({ ...filters, search: e.target.value });
  }

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    onFilterChange({
      ...filters,
      status: e.target.value as SessionFiltersType['status'],
    });
  }

  function handleDateFromChange(e: React.ChangeEvent<HTMLInputElement>): void {
    onFilterChange({ ...filters, dateFrom: e.target.value });
  }

  function handleDateToChange(e: React.ChangeEvent<HTMLInputElement>): void {
    onFilterChange({ ...filters, dateTo: e.target.value });
  }

  function handleClear(): void {
    onFilterChange({ search: '', status: 'all', dateFrom: '', dateTo: '' });
  }

  return (
    <div className="filter-bar">
      <input
        type="text"
        className="filter-input"
        placeholder="Search by ID, path, or date..."
        value={filters.search}
        onChange={handleSearchChange}
      />

      <select
        className="filter-select"
        value={filters.status}
        onChange={handleStatusChange}
      >
        <option value="all">All Statuses</option>
        <option value="in_progress">In Progress</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed</option>
      </select>

      <input
        type="date"
        className="filter-input filter-input--date"
        value={filters.dateFrom}
        onChange={handleDateFromChange}
        placeholder="From date"
      />

      <input
        type="date"
        className="filter-input filter-input--date"
        value={filters.dateTo}
        onChange={handleDateToChange}
        placeholder="To date"
      />

      {activeCount > 0 && (
        <button className="filter-clear" onClick={handleClear} type="button">
          Clear ({activeCount})
        </button>
      )}
    </div>
  );
}
