import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DiscussionList } from '../../../src/frontend/components/DiscussionList.js';
import type { DiscussionVerdict } from '../../../src/frontend/utils/discussion-helpers.js';

const makeDiscussion = (overrides: Partial<DiscussionVerdict> = {}): DiscussionVerdict => ({
  discussionId: 'disc-1',
  filePath: 'src/index.ts',
  lineRange: [10, 20],
  finalSeverity: 'WARNING',
  reasoning: 'Some reasoning',
  consensusReached: true,
  rounds: 2,
  ...overrides,
});

describe('DiscussionList', () => {
  it('renders list of discussions with ID, file path, and severity', () => {
    const discussions = [
      makeDiscussion({ discussionId: 'disc-1', filePath: 'src/index.ts', finalSeverity: 'WARNING' }),
      makeDiscussion({ discussionId: 'disc-2', filePath: 'src/utils.ts', finalSeverity: 'CRITICAL' }),
    ];

    render(<DiscussionList discussions={discussions} selectedId={null} onSelect={vi.fn()} />);

    expect(screen.getByText('disc-1')).toBeInTheDocument();
    expect(screen.getByText('src/index.ts')).toBeInTheDocument();
    // 'Warning' also appears in the filter <option>, so check for the severity span specifically
    const warningSeverity = document.querySelector('.disc-severity--warning');
    expect(warningSeverity).toBeInTheDocument();
    expect(warningSeverity?.textContent).toBe('Warning');
    expect(screen.getByText('disc-2')).toBeInTheDocument();
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument();
    const criticalSeverity = document.querySelector('.disc-severity--critical');
    expect(criticalSeverity).toBeInTheDocument();
    expect(criticalSeverity?.textContent).toBe('Critical');
  });

  it('shows consensus status reached and not reached', () => {
    const discussions = [
      makeDiscussion({ discussionId: 'disc-1', consensusReached: true }),
      makeDiscussion({ discussionId: 'disc-2', consensusReached: false }),
    ];

    render(<DiscussionList discussions={discussions} selectedId={null} onSelect={vi.fn()} />);

    // 'Consensus' badge in the row (not the filter option which says 'Consensus Reached')
    expect(document.querySelector('.disc-list__consensus--reached')).toBeInTheDocument();
    // 'No Consensus' also appears in the filter <option>, use the class-scoped element
    expect(document.querySelector('.disc-list__consensus--not-reached')).toBeInTheDocument();
  });

  it('shows round count', () => {
    const discussions = [
      makeDiscussion({ discussionId: 'disc-1', rounds: 3 }),
    ];

    render(<DiscussionList discussions={discussions} selectedId={null} onSelect={vi.fn()} />);

    expect(screen.getByText('3 rounds')).toBeInTheDocument();
  });

  it('calls onSelect when a discussion is clicked', () => {
    const onSelect = vi.fn();
    const discussions = [makeDiscussion({ discussionId: 'disc-abc' })];

    render(<DiscussionList discussions={discussions} selectedId={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('disc-abc'));
    expect(onSelect).toHaveBeenCalledWith('disc-abc');
  });

  it('filters by severity', () => {
    const discussions = [
      makeDiscussion({ discussionId: 'disc-1', finalSeverity: 'CRITICAL' }),
      makeDiscussion({ discussionId: 'disc-2', finalSeverity: 'WARNING' }),
    ];

    render(<DiscussionList discussions={discussions} selectedId={null} onSelect={vi.fn()} />);

    fireEvent.change(screen.getByRole('combobox', { name: /filter by severity/i }), {
      target: { value: 'CRITICAL' },
    });

    expect(screen.getByText('disc-1')).toBeInTheDocument();
    expect(screen.queryByText('disc-2')).not.toBeInTheDocument();
  });

  it('shows empty message when no discussions match filters', () => {
    render(<DiscussionList discussions={[]} selectedId={null} onSelect={vi.fn()} />);

    expect(screen.getByText('No discussions match the current filters.')).toBeInTheDocument();
  });
});
