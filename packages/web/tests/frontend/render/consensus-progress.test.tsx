import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConsensusProgress } from '../../../src/frontend/components/ConsensusProgress.js';
import type { DiscussionRound } from '../../../src/frontend/utils/discussion-helpers.js';

const makeRound = (round: number, agreeCount: number, total: number): DiscussionRound => ({
  round,
  moderatorPrompt: `Round ${round} prompt`,
  supporterResponses: [
    ...Array.from({ length: agreeCount }, (_, i) => ({
      supporterId: `agree-${i}`,
      response: 'I agree.',
      stance: 'agree' as const,
    })),
    ...Array.from({ length: total - agreeCount }, (_, i) => ({
      supporterId: `disagree-${i}`,
      response: 'I disagree.',
      stance: 'disagree' as const,
    })),
  ],
});

describe('ConsensusProgress', () => {
  it('renders SVG bars for each round', () => {
    const rounds = [makeRound(1, 2, 4), makeRound(2, 3, 4)];

    const { container } = render(
      <ConsensusProgress rounds={rounds} consensusReached={false} />,
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Each round renders a <g> element
    const groups = container.querySelectorAll('svg g');
    expect(groups.length).toBe(2);
  });

  it('shows round labels in the SVG', () => {
    const rounds = [makeRound(1, 3, 4), makeRound(2, 4, 4)];

    render(<ConsensusProgress rounds={rounds} consensusReached={true} />);

    expect(screen.getByText('Round 1')).toBeInTheDocument();
    expect(screen.getByText('Round 2')).toBeInTheDocument();
  });

  it('shows consensus percentage labels', () => {
    // 2 agree out of 4 = 50%
    const rounds = [makeRound(1, 2, 4)];

    render(<ConsensusProgress rounds={rounds} consensusReached={false} />);

    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows consensus reached badge', () => {
    const rounds = [makeRound(1, 4, 4)];

    render(<ConsensusProgress rounds={rounds} consensusReached={true} />);

    expect(screen.getByText('Consensus Reached')).toBeInTheDocument();
  });

  it('shows no consensus badge when not reached', () => {
    const rounds = [makeRound(1, 1, 4)];

    render(<ConsensusProgress rounds={rounds} consensusReached={false} />);

    expect(screen.getByText('No Consensus')).toBeInTheDocument();
  });

  it('handles empty rounds', () => {
    render(<ConsensusProgress rounds={[]} consensusReached={false} />);

    expect(screen.getByText('No round data available.')).toBeInTheDocument();
  });
});
