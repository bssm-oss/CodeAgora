import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModelLeaderboard } from '../../../src/frontend/components/ModelLeaderboard.js';
import type { ArmWithStats } from '../../../src/frontend/utils/model-helpers.js';

function makeArm(modelId: string, alpha: number, beta: number, reviewCount: number, lastUsed = 0): ArmWithStats {
  const winRate = alpha + beta > 0 ? alpha / (alpha + beta) : 0;
  return { modelId, alpha, beta, reviewCount, lastUsed, winRate };
}

const SAMPLE_ARMS: ArmWithStats[] = [
  makeArm('openai/gpt-4o', 80, 20, 100, 1700000000000),
  makeArm('anthropic/claude-3', 55, 45, 80, 1700000001000),
  makeArm('mistral/mistral-7b', 15, 35, 50, 1700000002000),
];

describe('ModelLeaderboard', () => {
  it('renders table with model rows', () => {
    render(<ModelLeaderboard arms={SAMPLE_ARMS} />);
    // modelId is rendered in a <code> element with the full id
    expect(screen.getByText('openai/gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('anthropic/claude-3')).toBeInTheDocument();
    expect(screen.getByText('mistral/mistral-7b')).toBeInTheDocument();
  });

  it('shows win rate, review count, alpha and beta values', () => {
    render(<ModelLeaderboard arms={SAMPLE_ARMS} />);
    // Win rate for gpt-4o: 80/(80+20) = 80.0%
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    // Review counts
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    // Alpha/beta values (toFixed(1))
    expect(screen.getByText('80.0')).toBeInTheDocument();
    expect(screen.getByText('20.0')).toBeInTheDocument();
  });

  it('top model row has accent highlight class', () => {
    render(<ModelLeaderboard arms={SAMPLE_ARMS} />);
    // openai/gpt-4o has highest win rate (80%), so it should have model-row--top
    const topCode = screen.getByText('openai/gpt-4o');
    const topRow = topCode.closest('tr');
    expect(topRow).toHaveClass('model-row--top');
  });

  it('handles empty arms gracefully', () => {
    render(<ModelLeaderboard arms={[]} />);
    expect(screen.getByText('No model data available')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('color-codes win rate: green >70%, yellow 40-70%, red <40%', () => {
    render(<ModelLeaderboard arms={SAMPLE_ARMS} />);
    // gpt-4o = 80% -> high (green)
    expect(screen.getByText('80.0%')).toHaveClass('model-winrate--high');
    // claude-3 = 55% -> medium (yellow)
    expect(screen.getByText('55.0%')).toHaveClass('model-winrate--medium');
    // mistral-7b = 30% -> low (red)
    expect(screen.getByText('30.0%')).toHaveClass('model-winrate--low');
  });

  it('sorts by column when header is clicked', () => {
    render(<ModelLeaderboard arms={SAMPLE_ARMS} />);
    const reviewsHeader = screen.getByText(/Reviews/);
    fireEvent.click(reviewsHeader);
    const rows = screen.getAllByRole('row');
    // After clicking Reviews (desc), highest review count should be first data row
    const firstDataRow = rows[1];
    expect(firstDataRow).toHaveClass('model-row--top');
  });
});
