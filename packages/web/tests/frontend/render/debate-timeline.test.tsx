import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DebateTimeline } from '../../../src/frontend/components/DebateTimeline.js';
import type {
  DiscussionVerdict,
  DiscussionRound,
} from '../../../src/frontend/utils/discussion-helpers.js';

const verdict: DiscussionVerdict = {
  discussionId: 'disc-1',
  filePath: 'src/auth.ts',
  lineRange: [5, 15],
  finalSeverity: 'CRITICAL',
  reasoning: 'Security vulnerability identified by consensus.',
  consensusReached: true,
  rounds: 2,
};

const rounds: DiscussionRound[] = [
  {
    round: 1,
    moderatorPrompt: 'Is this a genuine security issue?',
    supporterResponses: [
      { supporterId: 'reviewer-a', response: 'Yes, definitely.', stance: 'agree' },
      { supporterId: 'reviewer-b', response: 'I disagree.', stance: 'disagree' },
      { supporterId: 'reviewer-devil', response: 'Neutral on this.', stance: 'neutral' },
    ],
  },
  {
    round: 2,
    moderatorPrompt: 'Do you maintain your position?',
    supporterResponses: [
      { supporterId: 'reviewer-a', response: 'Still agree.', stance: 'agree' },
      { supporterId: 'reviewer-b', response: 'Now I agree too.', stance: 'agree' },
      { supporterId: 'reviewer-devil', response: 'Fine, agree.', stance: 'agree' },
    ],
  },
];

describe('DebateTimeline', () => {
  it('renders moderator prompt for each round', () => {
    render(<DebateTimeline verdict={verdict} rounds={rounds} />);

    expect(screen.getByText('Is this a genuine security issue?')).toBeInTheDocument();
    expect(screen.getByText('Do you maintain your position?')).toBeInTheDocument();
  });

  it('shows supporter responses with stance badges', () => {
    render(<DebateTimeline verdict={verdict} rounds={rounds} />);

    // reviewer-a appears in both rounds so use getAllByText
    expect(screen.getAllByText('reviewer-a').length).toBeGreaterThan(0);
    expect(screen.getByText('Yes, definitely.')).toBeInTheDocument();
    // stance badges are text content
    const agreeBadges = screen.getAllByText('agree');
    expect(agreeBadges.length).toBeGreaterThan(0);
    expect(screen.getByText('disagree')).toBeInTheDocument();
    expect(screen.getByText('neutral')).toBeInTheDocument();
  });

  it('stance badges have correct classes for agree, disagree, neutral', () => {
    render(<DebateTimeline verdict={verdict} rounds={rounds} />);

    const agreeBadge = screen.getAllByText('agree')[0].closest('.stance-badge');
    expect(agreeBadge).toHaveClass('stance--agree');

    const disagreeBadge = screen.getByText('disagree').closest('.stance-badge');
    expect(disagreeBadge).toHaveClass('stance--disagree');

    const neutralBadge = screen.getByText('neutral').closest('.stance-badge');
    expect(neutralBadge).toHaveClass('stance--neutral');
  });

  it('shows final verdict and reasoning', () => {
    render(<DebateTimeline verdict={verdict} rounds={rounds} />);

    expect(screen.getByText('Final Verdict')).toBeInTheDocument();
    expect(screen.getByText('Security vulnerability identified by consensus.')).toBeInTheDocument();
    expect(screen.getByText('Consensus Reached')).toBeInTheDocument();
  });

  it('highlights devil\'s advocate supporters with DA tag', () => {
    render(<DebateTimeline verdict={verdict} rounds={rounds} />);

    // reviewer-devil contains "devil" so isDevilsAdvocate returns true
    const daTags = screen.getAllByText('DA');
    expect(daTags.length).toBeGreaterThan(0);
  });

  it('handles single round', () => {
    const singleRound: DiscussionRound[] = [
      {
        round: 1,
        moderatorPrompt: 'Only prompt.',
        supporterResponses: [
          { supporterId: 'reviewer-x', response: 'Agreed.', stance: 'agree' },
        ],
      },
    ];

    render(<DebateTimeline verdict={verdict} rounds={singleRound} />);

    expect(screen.getByText('Round 1')).toBeInTheDocument();
    expect(screen.getByText('Only prompt.')).toBeInTheDocument();
    expect(screen.queryByText('Round 2')).not.toBeInTheDocument();
  });
});
