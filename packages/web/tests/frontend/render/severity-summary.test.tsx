import React from 'react';
import { render, screen } from '@testing-library/react';
import { SeveritySummary } from '../../../src/frontend/components/SeveritySummary.js';

const fullCounts = {
  HARSHLY_CRITICAL: 2,
  CRITICAL: 5,
  WARNING: 8,
  SUGGESTION: 3,
};

const zeroCounts = {
  HARSHLY_CRITICAL: 0,
  CRITICAL: 0,
  WARNING: 0,
  SUGGESTION: 0,
};

describe('SeveritySummary', () => {
  it('renders legend items for all severities', () => {
    render(<SeveritySummary counts={fullCounts} />);
    expect(screen.getByText(/Harshly Critical: 2/)).toBeInTheDocument();
    expect(screen.getByText(/Critical: 5/)).toBeInTheDocument();
    expect(screen.getByText(/Warning: 8/)).toBeInTheDocument();
    expect(screen.getByText(/Suggestion: 3/)).toBeInTheDocument();
  });

  it('renders bar segments only for non-zero severities', () => {
    const counts = { HARSHLY_CRITICAL: 0, CRITICAL: 3, WARNING: 0, SUGGESTION: 1 };
    const { container } = render(<SeveritySummary counts={counts} />);
    const segments = container.querySelectorAll('.severity-summary__segment');
    expect(segments).toHaveLength(2);
  });

  it('renders no bar segments when all counts are zero', () => {
    const { container } = render(<SeveritySummary counts={zeroCounts} />);
    const segments = container.querySelectorAll('.severity-summary__segment');
    expect(segments).toHaveLength(0);
  });

  it('still renders legend items when all counts are zero', () => {
    render(<SeveritySummary counts={zeroCounts} />);
    expect(screen.getByText(/Harshly Critical: 0/)).toBeInTheDocument();
    expect(screen.getByText(/Suggestion: 0/)).toBeInTheDocument();
  });

  it('applies correct segment classes for each severity', () => {
    const { container } = render(<SeveritySummary counts={fullCounts} />);
    expect(container.querySelector('.severity-summary__segment--harshly-critical')).toBeInTheDocument();
    expect(container.querySelector('.severity-summary__segment--critical')).toBeInTheDocument();
    expect(container.querySelector('.severity-summary__segment--warning')).toBeInTheDocument();
    expect(container.querySelector('.severity-summary__segment--suggestion')).toBeInTheDocument();
  });

  it('shows count inside each bar segment', () => {
    render(<SeveritySummary counts={fullCounts} />);
    // Segment text content shows raw counts
    expect(screen.getByTitle('Harshly Critical: 2')).toHaveTextContent('2');
    expect(screen.getByTitle('Critical: 5')).toHaveTextContent('5');
  });
});
