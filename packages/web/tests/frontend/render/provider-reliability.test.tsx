import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProviderReliability } from '../../../src/frontend/components/ProviderReliability.js';
import type { ArmWithStats } from '../../../src/frontend/utils/model-helpers.js';

function makeArm(modelId: string, alpha: number, beta: number, reviewCount: number): ArmWithStats {
  const winRate = alpha + beta > 0 ? alpha / (alpha + beta) : 0;
  return { modelId, alpha, beta, reviewCount, lastUsed: 0, winRate };
}

describe('ProviderReliability', () => {
  it('renders provider cards with names', () => {
    const arms: ArmWithStats[] = [
      makeArm('openai/gpt-4o', 80, 20, 100),
      makeArm('anthropic/claude-3', 55, 45, 80),
    ];
    render(<ProviderReliability arms={arms} />);
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('anthropic')).toBeInTheDocument();
  });

  it('shows health status badge for healthy provider', () => {
    // win rate > 0.6 -> healthy
    const arms: ArmWithStats[] = [makeArm('openai/gpt-4o', 80, 20, 100)];
    render(<ProviderReliability arms={arms} />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toHaveClass('provider-card__status--healthy');
  });

  it('shows degraded status badge when win rate is 40-60%', () => {
    // win rate 0.4-0.6 -> degraded
    const arms: ArmWithStats[] = [makeArm('anthropic/claude', 50, 50, 60)];
    render(<ProviderReliability arms={arms} />);
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText('Degraded')).toHaveClass('provider-card__status--degraded');
  });

  it('shows unhealthy status badge when win rate is below 40%', () => {
    // win rate < 0.4 -> unhealthy
    const arms: ArmWithStats[] = [makeArm('mistral/mistral-7b', 20, 80, 50)];
    render(<ProviderReliability arms={arms} />);
    expect(screen.getByText('Unhealthy')).toBeInTheDocument();
    expect(screen.getByText('Unhealthy')).toHaveClass('provider-card__status--unhealthy');
  });

  it('shows total reviews and average win rate', () => {
    const arms: ArmWithStats[] = [
      makeArm('openai/gpt-4o', 80, 20, 100),
      makeArm('openai/gpt-3.5', 70, 30, 50),
    ];
    render(<ProviderReliability arms={arms} />);
    // Total reviews for openai = 100 + 50 = 150
    expect(screen.getByText('150')).toBeInTheDocument();
    // Average win rate = (0.8 + 0.7) / 2 = 0.75 -> 75.0%
    expect(screen.getByText('75.0%')).toBeInTheDocument();
  });

  it('handles empty data gracefully', () => {
    render(<ProviderReliability arms={[]} />);
    expect(screen.getByText('No provider data available')).toBeInTheDocument();
    expect(screen.queryByText('Reviews')).not.toBeInTheDocument();
  });
});
