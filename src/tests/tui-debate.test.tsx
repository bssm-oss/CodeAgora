import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { DebatePanel } from '@codeagora/tui/components/DebatePanel.js';
import { DebateScreen } from '@codeagora/tui/screens/DebateScreen.js';
import type { DebateRound } from '@codeagora/tui/components/DebatePanel.js';
import type { DebateDiscussion } from '@codeagora/tui/screens/DebateScreen.js';

// ============================================================================
// Mock data
// ============================================================================

const mockRounds: DebateRound[] = [
  {
    round: 1,
    supporters: [
      { id: 's1', stance: 'AGREE' as const, reasoning: 'Valid security concern' },
      { id: 's2', stance: 'DISAGREE' as const, reasoning: 'False positive', isDevilsAdvocate: true },
    ],
    consensusReached: false,
  },
  {
    round: 2,
    supporters: [
      { id: 's1', stance: 'AGREE' as const, reasoning: 'Confirmed after review' },
      { id: 's2', stance: 'AGREE' as const, reasoning: 'Accepted after evidence' },
    ],
    consensusReached: true,
  },
];

const mockDiscussion: DebateDiscussion = {
  id: 'd001',
  severity: 'CRITICAL',
  title: 'SQL injection risk',
  filePath: 'src/auth.ts',
  rounds: mockRounds,
  status: 'resolved',
};

const mockDiscussions: DebateDiscussion[] = [
  mockDiscussion,
  {
    id: 'd002',
    severity: 'WARNING',
    title: 'Missing null check',
    filePath: 'src/utils.ts',
    rounds: [],
    status: 'escalated',
  },
  {
    id: 'd003',
    severity: 'SUGGESTION',
    title: 'Use const',
    filePath: 'src/index.ts',
    rounds: [],
    status: 'pending',
  },
];

// ============================================================================
// DebatePanel tests
// ============================================================================

describe('DebatePanel', () => {
  it('renders severity badge', () => {
    const { lastFrame } = render(
      <DebatePanel
        discussionId="d001"
        severity="CRITICAL"
        title="SQL injection risk"
        filePath="src/auth.ts"
        rounds={mockRounds}
        status="resolved"
      />
    );
    expect(lastFrame()).toContain('CRITICAL');
  });

  it('renders title', () => {
    const { lastFrame } = render(
      <DebatePanel
        discussionId="d001"
        severity="CRITICAL"
        title="SQL injection risk"
        filePath="src/auth.ts"
        rounds={mockRounds}
        status="resolved"
      />
    );
    expect(lastFrame()).toContain('SQL injection risk');
  });

  it('renders file path', () => {
    const { lastFrame } = render(
      <DebatePanel
        discussionId="d001"
        severity="CRITICAL"
        title="SQL injection risk"
        filePath="src/auth.ts"
        rounds={mockRounds}
        status="resolved"
      />
    );
    expect(lastFrame()).toContain('src/auth.ts');
  });

  it('shows round data with supporter stances', () => {
    const { lastFrame } = render(
      <DebatePanel
        discussionId="d001"
        severity="CRITICAL"
        title="SQL injection risk"
        filePath="src/auth.ts"
        rounds={mockRounds}
        status="resolved"
      />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Round 1');
    expect(frame).toContain('AGREE');
    expect(frame).toContain('DISAGREE');
    expect(frame).toContain('Valid security concern');
    expect(frame).toContain('False positive');
  });

  it('marks devil\'s advocate with [DA]', () => {
    const { lastFrame } = render(
      <DebatePanel
        discussionId="d001"
        severity="CRITICAL"
        title="SQL injection risk"
        filePath="src/auth.ts"
        rounds={mockRounds}
        status="resolved"
      />
    );
    expect(lastFrame()).toContain('[DA]');
  });

  it('shows consensus reached when last round consensusReached is true', () => {
    const { lastFrame } = render(
      <DebatePanel
        discussionId="d001"
        severity="CRITICAL"
        title="SQL injection risk"
        filePath="src/auth.ts"
        rounds={mockRounds}
        status="resolved"
      />
    );
    expect(lastFrame()).toContain('Consensus reached');
  });

  it('shows no consensus when consensusReached is false', () => {
    const onlyRound1: DebateRound[] = [mockRounds[0]!];
    const { lastFrame } = render(
      <DebatePanel
        discussionId="d001"
        severity="CRITICAL"
        title="SQL injection risk"
        filePath="src/auth.ts"
        rounds={onlyRound1}
        status="active"
      />
    );
    expect(lastFrame()).toContain('No consensus');
  });

  it('shows discussion status', () => {
    const { lastFrame } = render(
      <DebatePanel
        discussionId="d001"
        severity="CRITICAL"
        title="SQL injection risk"
        filePath="src/auth.ts"
        rounds={mockRounds}
        status="escalated"
      />
    );
    expect(lastFrame()).toContain('ESCALATED');
  });
});

// ============================================================================
// DebateScreen tests
// ============================================================================

describe('DebateScreen', () => {
  it('renders multiple debate panels', () => {
    const { lastFrame } = render(<DebateScreen discussions={mockDiscussions} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('SQL injection');
    expect(frame).toContain('Missing null');
    expect(frame).toContain('Use cons');
  });

  it('shows title "L2 Discussion Moderator"', () => {
    const { lastFrame } = render(<DebateScreen discussions={mockDiscussions} />);
    expect(lastFrame()).toContain('L2 Discussion Moderator');
  });

  it('shows total count in summary bar', () => {
    const { lastFrame } = render(<DebateScreen discussions={mockDiscussions} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Total:');
    expect(frame).toContain('3');
  });

  it('shows resolved count in summary bar', () => {
    const { lastFrame } = render(<DebateScreen discussions={mockDiscussions} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Resolved:');
    // 1 resolved discussion
    expect(frame).toContain('1');
  });

  it('shows escalated count in summary bar', () => {
    const { lastFrame } = render(<DebateScreen discussions={mockDiscussions} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Escalated:');
    // 1 escalated discussion
    expect(frame).toContain('1');
  });

  it('shows "No discussions." for empty list', () => {
    const { lastFrame } = render(<DebateScreen discussions={[]} />);
    expect(lastFrame()).toContain('No discussions.');
  });

  it('shows navigation hint', () => {
    const { lastFrame } = render(<DebateScreen discussions={mockDiscussions} />);
    expect(lastFrame()).toContain('j/k');
  });
});
