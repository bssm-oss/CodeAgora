import React from 'react';
import { render, screen } from '@testing-library/react';
import { ReviewerCosts } from '../../../src/frontend/components/ReviewerCosts.js';
import type { ReviewerAggregate } from '../../../src/frontend/utils/cost-helpers.js';

// Component expects reviewers already sorted descending by cost
const SAMPLE_REVIEWERS: ReviewerAggregate[] = [
  { reviewer: 'openai/gpt-4o', totalCost: 0.05 },
  { reviewer: 'anthropic/claude-3', totalCost: 0.03 },
  { reviewer: 'mistral/mistral-7b', totalCost: 0.01 },
];

describe('ReviewerCosts', () => {
  it('renders a bar row for each reviewer', () => {
    render(<ReviewerCosts reviewers={SAMPLE_REVIEWERS} />);
    // Model names extracted from "provider/model"
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('claude-3')).toBeInTheDocument();
    expect(screen.getByText('mistral-7b')).toBeInTheDocument();
  });

  it('shows cost amount for each reviewer', () => {
    render(<ReviewerCosts reviewers={SAMPLE_REVIEWERS} />);
    expect(screen.getByText('$0.0500')).toBeInTheDocument();
    expect(screen.getByText('$0.0300')).toBeInTheDocument();
    expect(screen.getByText('$0.0100')).toBeInTheDocument();
  });

  it('shows provider name alongside model name', () => {
    render(<ReviewerCosts reviewers={SAMPLE_REVIEWERS} />);
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('anthropic')).toBeInTheDocument();
    expect(screen.getByText('mistral')).toBeInTheDocument();
  });

  it('handles empty data gracefully', () => {
    render(<ReviewerCosts reviewers={[]} />);
    expect(screen.getByText('No reviewer cost data')).toBeInTheDocument();
    expect(screen.queryByText('$')).not.toBeInTheDocument();
  });

  it('renders bars with non-zero width for reviewers with cost', () => {
    render(<ReviewerCosts reviewers={SAMPLE_REVIEWERS} />);
    const bars = document.querySelectorAll('.reviewer-costs__bar');
    expect(bars).toHaveLength(3);
    // Top reviewer bar should be 100% width
    const topBar = bars[0] as HTMLElement;
    expect(topBar.style.width).toBe('100%');
  });

  it('renders with a single reviewer at full bar width', () => {
    const single: ReviewerAggregate[] = [{ reviewer: 'openai/gpt-4o', totalCost: 0.08 }];
    render(<ReviewerCosts reviewers={single} />);
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('$0.0800')).toBeInTheDocument();
    const bar = document.querySelector('.reviewer-costs__bar') as HTMLElement;
    expect(bar.style.width).toBe('100%');
  });
});
