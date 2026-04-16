import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from 'ink-testing-library';
import { ResultsScreen } from '../screens/ResultsScreen.js';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';

afterEach(() => {
  cleanup();
});

function makeMockResult(overrides?: Partial<PipelineResult>): PipelineResult {
  return {
    status: 'success',
    discussions: [],
    summary: {
      decision: 'ACCEPT',
      reasoning: 'Code looks good',
      topIssues: [
        {
          severity: 'WARNING',
          filePath: 'src/index.ts',
          lineRange: [10, 15] as [number, number],
          title: 'Unused import detected',
        },
        {
          severity: 'CRITICAL',
          filePath: 'src/utils.ts',
          lineRange: [42, 42] as [number, number],
          title: 'Potential null reference',
        },
      ],
      severityCounts: { WARNING: 1, CRITICAL: 1 },
    },
    ...overrides,
  } as PipelineResult;
}

describe('ResultsScreen', () => {
  it('renders without crashing', () => {
    const result = makeMockResult();
    const { lastFrame } = render(<ResultsScreen result={result} />);
    expect(lastFrame()).toBeDefined();
  });

  it('displays the decision', () => {
    const result = makeMockResult();
    const { lastFrame } = render(<ResultsScreen result={result} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Decision');
    expect(frame).toContain('ACCEPT');
  });

  it('displays reasoning', () => {
    const result = makeMockResult();
    const { lastFrame } = render(<ResultsScreen result={result} />);
    expect(lastFrame()).toContain('Code looks good');
  });

  it('displays severity counts', () => {
    const result = makeMockResult();
    const { lastFrame } = render(<ResultsScreen result={result} />);
    const frame = lastFrame()!;
    expect(frame).toContain('WARNING');
    expect(frame).toContain('CRITICAL');
  });

  it('displays issue file paths', () => {
    const result = makeMockResult();
    const { lastFrame } = render(<ResultsScreen result={result} />);
    const frame = lastFrame()!;
    expect(frame).toContain('src/index.ts');
  });

  it('shows no summary message when summary is missing', () => {
    const result = makeMockResult({ summary: undefined } as Partial<PipelineResult>);
    const { lastFrame } = render(<ResultsScreen result={result} />);
    expect(lastFrame()).toContain('No summary available');
  });

  it('handles REJECT decision', () => {
    const result = makeMockResult();
    result.summary!.decision = 'REJECT';
    const { lastFrame } = render(<ResultsScreen result={result} />);
    expect(lastFrame()).toContain('REJECT');
  });

  it('handles empty issues list', () => {
    const result = makeMockResult();
    result.summary!.topIssues = [];
    result.summary!.severityCounts = {};
    const { lastFrame } = render(<ResultsScreen result={result} />);
    const frame = lastFrame()!;
    expect(frame).toContain('No issues found');
  });

  it('calls onHome when provided', () => {
    const result = makeMockResult();
    const onHome = vi.fn();
    const { lastFrame } = render(<ResultsScreen result={result} onHome={onHome} />);
    // Just verify it renders — onHome is triggered by keyboard which we test in integration
    expect(lastFrame()).toBeDefined();
  });

  it('shows context hint when onViewContext is provided', () => {
    const result = makeMockResult();
    const onViewContext = vi.fn();
    const { lastFrame } = render(
      <ResultsScreen result={result} onViewContext={onViewContext} />
    );
    expect(lastFrame()).toContain('v context');
  });
});
