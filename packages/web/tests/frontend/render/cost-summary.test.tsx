import React from 'react';
import { render, screen } from '@testing-library/react';
import { CostSummary } from '../../../src/frontend/components/CostSummary.js';
import type { SessionCost } from '../../../src/frontend/utils/cost-helpers.js';

const SAMPLE_SESSIONS: SessionCost[] = [
  {
    date: '2024-01-15',
    sessionId: 'abc-001',
    totalCost: 0.02,
    reviewerCosts: { 'openai/gpt-4o': 0.015, 'anthropic/claude-3': 0.005 },
    layerCosts: { l1: 0.01, l2: 0.005, l3: 0.005 },
  },
  {
    date: '2024-01-16',
    sessionId: 'abc-002',
    totalCost: 0.04,
    reviewerCosts: { 'openai/gpt-4o': 0.03, 'anthropic/claude-3': 0.01 },
    layerCosts: { l1: 0.02, l2: 0.01, l3: 0.01 },
  },
];

describe('CostSummary', () => {
  it('renders 4 metric cards', () => {
    render(<CostSummary sessions={SAMPLE_SESSIONS} />);
    expect(screen.getByText('Total Spend')).toBeInTheDocument();
    expect(screen.getByText('Avg per Session')).toBeInTheDocument();
    expect(screen.getByText('Most Expensive Session')).toBeInTheDocument();
    expect(screen.getByText('Top Reviewer')).toBeInTheDocument();
  });

  it('shows total spend formatted as dollar amount', () => {
    render(<CostSummary sessions={SAMPLE_SESSIONS} />);
    // Total = 0.02 + 0.04 = 0.06 -> $0.0600
    expect(screen.getByText('$0.0600')).toBeInTheDocument();
  });

  it('shows average cost per session', () => {
    render(<CostSummary sessions={SAMPLE_SESSIONS} />);
    // Average = 0.06 / 2 = 0.03 -> $0.0300
    expect(screen.getByText('$0.0300')).toBeInTheDocument();
  });

  it('shows session count detail', () => {
    render(<CostSummary sessions={SAMPLE_SESSIONS} />);
    expect(screen.getByText('2 sessions')).toBeInTheDocument();
  });

  it('handles empty data with friendly message', () => {
    render(<CostSummary sessions={[]} />);
    expect(screen.getByText('No cost data yet. Costs are tracked after reviews with paid models.')).toBeInTheDocument();
  });

  it('shows most expensive session identifier', () => {
    render(<CostSummary sessions={SAMPLE_SESSIONS} />);
    // abc-002 has higher cost (0.04)
    expect(screen.getByText('2024-01-16 / abc-002')).toBeInTheDocument();
  });
});
