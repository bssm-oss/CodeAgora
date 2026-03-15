import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ProgressEmitter } from '../pipeline/progress.js';
import { PipelineProgress } from '../tui/components/PipelineProgress.js';

// ============================================================================
// Tests
// ============================================================================

describe('PipelineProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders all stage names', () => {
    const progress = new ProgressEmitter();
    const { lastFrame } = render(<PipelineProgress progress={progress} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Init');
    expect(frame).toContain('Reviewers');
    expect(frame).toContain('Discussion');
    expect(frame).toContain('Verdict');
  });

  it('shows running indicator for active stage', () => {
    const progress = new ProgressEmitter();
    const { lastFrame, rerender } = render(<PipelineProgress progress={progress} />);

    progress.stageStart('init', 'Loading config...');
    rerender(<PipelineProgress progress={progress} />);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('>>');
    expect(frame).toContain('Init');
    expect(frame).toContain('Loading config...');
  });

  it('shows completed checkmark for finished stages', () => {
    const progress = new ProgressEmitter();
    const { lastFrame, rerender } = render(<PipelineProgress progress={progress} />);

    progress.stageStart('init', 'Loading...');
    progress.stageComplete('init', 'Config loaded');
    rerender(<PipelineProgress progress={progress} />);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('✓');
    expect(frame).toContain('Config loaded');
  });

  it('shows error indicator for failed stages', () => {
    const progress = new ProgressEmitter();
    const { lastFrame, rerender } = render(<PipelineProgress progress={progress} />);

    progress.stageStart('review', 'Running reviewers...');
    progress.stageError('review', 'Reviewer timed out');
    rerender(<PipelineProgress progress={progress} />);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('✗');
    expect(frame).toContain('Reviewer timed out');
  });

  it('displays elapsed time counter', () => {
    const progress = new ProgressEmitter();
    const { lastFrame } = render(<PipelineProgress progress={progress} />);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('0s');
  });

  it('updates elapsed time after interval ticks', () => {
    const progress = new ProgressEmitter();
    const { lastFrame, rerender } = render(<PipelineProgress progress={progress} />);

    vi.advanceTimersByTime(3000);
    rerender(<PipelineProgress progress={progress} />);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('3s');
  });

  it('shows final summary when pipeline-complete fires', () => {
    const progress = new ProgressEmitter();
    const { lastFrame, rerender } = render(<PipelineProgress progress={progress} />);

    progress.stageStart('init', 'Loading...');
    progress.stageComplete('init', 'Ready');
    progress.stageStart('review', 'Reviewing...');
    progress.stageComplete('review', '3 reviewers done');
    progress.pipelineComplete('All done!');
    rerender(<PipelineProgress progress={progress} />);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Done');
    expect(frame).toContain('All done!');
  });

  it('shows stage message updates', () => {
    const progress = new ProgressEmitter();
    const { lastFrame, rerender } = render(<PipelineProgress progress={progress} />);

    progress.stageStart('review', 'Starting...');
    progress.stageUpdate('review', 50, '2/4 reviewers complete');
    rerender(<PipelineProgress progress={progress} />);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('2/4 reviewers complete');
  });

  it('multiple stages can be complete simultaneously', () => {
    const progress = new ProgressEmitter();
    const { lastFrame, rerender } = render(<PipelineProgress progress={progress} />);

    progress.stageStart('init', 'Loading...');
    progress.stageComplete('init', 'Ready');
    progress.stageStart('review', 'Reviewing...');
    progress.stageComplete('review', 'Done');
    progress.stageStart('discuss', 'Discussing...');
    rerender(<PipelineProgress progress={progress} />);

    const frame = lastFrame() ?? '';
    const checkmarks = (frame.match(/✓/g) ?? []).length;
    expect(checkmarks).toBeGreaterThanOrEqual(2);
    expect(frame).toContain('>>');
  });
});
