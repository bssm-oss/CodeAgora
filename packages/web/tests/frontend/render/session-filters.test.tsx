import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionFilters } from '../../../src/frontend/components/SessionFilters.js';
import type { SessionFilters as SessionFiltersType } from '../../../src/frontend/utils/session-filters.js';

const DEFAULT_FILTERS: SessionFiltersType = {
  search: '',
  status: 'all',
  dateFrom: '',
  dateTo: '',
};

describe('SessionFilters', () => {
  it('renders search input, status dropdown, and date inputs', () => {
    render(<SessionFilters filters={DEFAULT_FILTERS} onFilterChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('Search by ID, path, or date...')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    // Two date inputs
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
  });

  it('calls onFilterChange with updated search when text is typed', () => {
    const onFilterChange = vi.fn();
    render(<SessionFilters filters={DEFAULT_FILTERS} onFilterChange={onFilterChange} />);
    const searchInput = screen.getByPlaceholderText('Search by ID, path, or date...');
    fireEvent.change(searchInput, { target: { value: 'abc' } });
    expect(onFilterChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, search: 'abc' });
  });

  it('calls onFilterChange with updated status when dropdown changes', () => {
    const onFilterChange = vi.fn();
    render(<SessionFilters filters={DEFAULT_FILTERS} onFilterChange={onFilterChange} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'completed' } });
    expect(onFilterChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, status: 'completed' });
  });

  it('shows active filter count and clear button when filters are set', () => {
    const activeFilters: SessionFiltersType = {
      search: 'abc',
      status: 'completed',
      dateFrom: '2024-01-01',
      dateTo: '2024-01-31',
    };
    render(<SessionFilters filters={activeFilters} onFilterChange={vi.fn()} />);
    // 4 active filters
    expect(screen.getByText('Clear (4)')).toBeInTheDocument();
  });

  it('clear button resets all filters to defaults', () => {
    const onFilterChange = vi.fn();
    const activeFilters: SessionFiltersType = {
      search: 'test',
      status: 'failed',
      dateFrom: '2024-01-01',
      dateTo: '',
    };
    render(<SessionFilters filters={activeFilters} onFilterChange={onFilterChange} />);
    // Button text "Clear (3)" may be split across elements — use role query
    const clearButton = screen.getByRole('button');
    fireEvent.click(clearButton);
    expect(onFilterChange).toHaveBeenCalledWith({
      search: '',
      status: 'all',
      dateFrom: '',
      dateTo: '',
    });
  });

  it('does not render clear button when no filters are active', () => {
    render(<SessionFilters filters={DEFAULT_FILTERS} onFilterChange={vi.fn()} />);
    expect(screen.queryByText(/Clear/)).not.toBeInTheDocument();
  });
});
