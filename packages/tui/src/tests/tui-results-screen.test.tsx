/**
 * ResultsScreen triage tab tests
 */
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { ResultsScreen } from '../screens/ResultsScreen.js';

afterEach(() => {
  cleanup();
});

// Minimal mock — cast to avoid importing the full PipelineResult type
function makeMockResult(
  issues: Array<{
    severity: string;
    filePath: string;
    lineRange: [number, number];
    title: string;
    confidence?: number;
  }>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    status: 'success',
    summary: {
      decision: 'REJECT',
      reasoning: 'Critical issues found',
      severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 1, WARNING: 1, SUGGESTION: 1 },
      topIssues: issues,
      totalReviewers: 3,
      forfeitedReviewers: 0,
      totalDiscussions: 0,
      resolved: 0,
      escalated: 0,
    },
    discussions: [],
    reviewers: [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('ResultsScreen triage tabs', () => {
  it('renders all three triage tab labels', () => {
    const result = makeMockResult([
      { severity: 'CRITICAL', filePath: 'auth.ts', lineRange: [10, 15], title: 'SQL Injection', confidence: 90 },
      { severity: 'WARNING', filePath: 'api.ts', lineRange: [20, 25], title: 'Unvalidated input', confidence: 60 },
      { severity: 'SUGGESTION', filePath: 'util.ts', lineRange: [30, 35], title: 'Use const', confidence: 80 },
    ]);

    const { lastFrame } = render(<ResultsScreen result={result} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('must-fix');
    expect(frame).toContain('verify');
    expect(frame).toContain('suggestions');
  });

  it('renders the decision header', () => {
    const result = makeMockResult([
      { severity: 'CRITICAL', filePath: 'auth.ts', lineRange: [10, 15], title: 'SQL Injection', confidence: 90 },
    ]);

    const { lastFrame } = render(<ResultsScreen result={result} />);
    expect(lastFrame() ?? '').toContain('REJECT');
  });

  it('shows "Ship it!" when there are no must-fix issues on the must-fix tab', () => {
    const result = makeMockResult([
      { severity: 'SUGGESTION', filePath: 'util.ts', lineRange: [5, 10], title: 'Use const', confidence: 80 },
    ]);

    const { lastFrame } = render(<ResultsScreen result={result} />);
    // Default tab is must-fix, no must-fix issues → celebrate
    expect(lastFrame() ?? '').toContain('Ship it!');
  });

  it('displays "No summary available" when summary is null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = { status: 'success', summary: null, discussions: [] } as any;

    const { lastFrame } = render(<ResultsScreen result={result} />);
    expect(lastFrame() ?? '').toContain('No summary available');
  });

  it('shows issue count per tab in brackets', () => {
    const result = makeMockResult([
      // must-fix: CRITICAL + conf > 50
      { severity: 'CRITICAL', filePath: 'a.ts', lineRange: [1, 2], title: 'Issue A', confidence: 90 },
      // suggestions: SUGGESTION
      { severity: 'SUGGESTION', filePath: 'b.ts', lineRange: [3, 4], title: 'Issue B', confidence: 80 },
    ]);

    const { lastFrame } = render(<ResultsScreen result={result} />);
    const frame = lastFrame() ?? '';
    // Tab labels include counts like [must-fix:1]
    expect(frame).toContain('[must-fix:1]');
    expect(frame).toContain('[suggestions:1]');
  });
});
