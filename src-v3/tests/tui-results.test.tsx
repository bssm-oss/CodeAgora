import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ResultsScreen } from '../tui/screens/ResultsScreen.js';
import type { PipelineResult } from '../pipeline/orchestrator.js';

// ============================================================================
// Mock data
// ============================================================================

const mockResult: PipelineResult = {
  sessionId: '001',
  date: '2026-03-15',
  status: 'success' as const,
  summary: {
    decision: 'REJECT' as const,
    reasoning: 'Critical issues found',
    totalReviewers: 3,
    forfeitedReviewers: 0,
    severityCounts: { CRITICAL: 2, WARNING: 1 },
    topIssues: [
      {
        severity: 'CRITICAL',
        filePath: 'auth.ts',
        lineRange: [10, 10] as [number, number],
        title: 'SQL injection',
      },
      {
        severity: 'WARNING',
        filePath: 'utils.ts',
        lineRange: [5, 5] as [number, number],
        title: 'Missing validation',
      },
    ],
    totalDiscussions: 3,
    resolved: 2,
    escalated: 1,
  },
};

const acceptResult: PipelineResult = {
  sessionId: '002',
  date: '2026-03-15',
  status: 'success' as const,
  summary: {
    decision: 'ACCEPT' as const,
    reasoning: 'No significant issues',
    totalReviewers: 2,
    forfeitedReviewers: 0,
    severityCounts: {},
    topIssues: [],
    totalDiscussions: 0,
    resolved: 0,
    escalated: 0,
  },
};

const noSummaryResult: PipelineResult = {
  sessionId: '003',
  date: '2026-03-15',
  status: 'success' as const,
};

// ============================================================================
// Tests
// ============================================================================

describe('ResultsScreen', () => {
  it('renders REJECT decision', () => {
    const { lastFrame } = render(<ResultsScreen result={mockResult} />);
    expect(lastFrame()).toContain('REJECT');
  });

  it('renders ACCEPT decision', () => {
    const { lastFrame } = render(<ResultsScreen result={acceptResult} />);
    expect(lastFrame()).toContain('ACCEPT');
  });

  it('renders reasoning text', () => {
    const { lastFrame } = render(<ResultsScreen result={mockResult} />);
    expect(lastFrame()).toContain('Critical issues found');
  });

  it('shows severity counts', () => {
    const { lastFrame } = render(<ResultsScreen result={mockResult} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('CRITICAL');
    expect(frame).toContain('2');
    expect(frame).toContain('WARNING');
    expect(frame).toContain('1');
  });

  it('shows issue list with file paths', () => {
    const { lastFrame } = render(<ResultsScreen result={mockResult} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('auth.ts');
    expect(frame).toContain('SQL injection');
    expect(frame).toContain('utils.ts');
    expect(frame).toContain('Missing validation');
  });

  it('renders "No issues" for empty results', () => {
    const { lastFrame } = render(<ResultsScreen result={acceptResult} />);
    expect(lastFrame()).toContain('No issues');
  });

  it('shows no summary message when summary is missing', () => {
    const { lastFrame } = render(<ResultsScreen result={noSummaryResult} />);
    expect(lastFrame()).toContain('No summary available');
  });

  it('shows navigation hint', () => {
    const { lastFrame } = render(<ResultsScreen result={mockResult} />);
    expect(lastFrame()).toContain('q: back');
  });
});
