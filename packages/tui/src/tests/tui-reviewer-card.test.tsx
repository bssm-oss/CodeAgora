/**
 * ReviewerCard TUI component tests
 */
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewerCard } from '../components/ReviewerCard.js';

afterEach(() => {
  cleanup();
});

describe('ReviewerCard', () => {
  it('renders reviewerId', () => {
    const { lastFrame } = render(
      <ReviewerCard
        reviewerId="r1"
        provider="groq"
        model="llama-3.3"
        status="done"
        issueCount={3}
        elapsed={5}
      />,
    );
    expect(lastFrame() ?? '').toContain('r1');
  });

  it('renders done status with check icon and issue count', () => {
    const { lastFrame } = render(
      <ReviewerCard
        reviewerId="r2"
        provider="openai"
        model="gpt-4o"
        status="done"
        issueCount={2}
        elapsed={3}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('✓');
    expect(frame).toContain('2 issues');
  });

  it('renders running status with ellipsis', () => {
    const { lastFrame } = render(
      <ReviewerCard
        reviewerId="r3"
        provider="groq"
        model="llama-3.3"
        status="running"
        issueCount={0}
        elapsed={0}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('r3');
    expect(frame).toContain('…');
  });

  it('renders failed status with cross icon', () => {
    const { lastFrame } = render(
      <ReviewerCard
        reviewerId="r4"
        provider="anthropic"
        model="claude"
        status="failed"
        issueCount={0}
        elapsed={10}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('✗');
  });

  it('renders singular issue count correctly', () => {
    const { lastFrame } = render(
      <ReviewerCard
        reviewerId="r5"
        provider=""
        model=""
        status="done"
        issueCount={1}
        elapsed={2}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('1 issue');
    expect(frame).not.toContain('1 issues');
  });
});
