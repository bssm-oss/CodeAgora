import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from 'ink-testing-library';

// Mock core pipeline modules before importing PipelineScreen
vi.mock('@codeagora/core/pipeline/progress.js', () => {
  const { EventEmitter } = require('events');
  class MockProgressEmitter extends EventEmitter {
    onProgress(cb: (...args: unknown[]) => void) { this.on('progress', cb); }
  }
  return { ProgressEmitter: MockProgressEmitter };
});

vi.mock('@codeagora/core/pipeline/orchestrator.js', () => ({
  runPipeline: vi.fn(),
}));

import { PipelineScreen } from '../screens/PipelineScreen.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PipelineScreen', () => {
  it('renders without crashing', () => {
    const onComplete = vi.fn();
    const onError = vi.fn();
    const { lastFrame } = render(
      <PipelineScreen diffPath="/tmp/test.diff" onComplete={onComplete} onError={onError} />
    );
    const frame = lastFrame();
    expect(frame).toBeDefined();
  });

  it('shows initial pipeline status message', () => {
    const onComplete = vi.fn();
    const onError = vi.fn();
    const { lastFrame } = render(
      <PipelineScreen diffPath="/tmp/test.diff" onComplete={onComplete} onError={onError} />
    );
    const frame = lastFrame()!;
    // Should show either "Starting pipeline..." or "Running pipeline..."
    expect(frame).toMatch(/pipeline/i);
  });

  it('shows pipeline progress panel', () => {
    const onComplete = vi.fn();
    const onError = vi.fn();
    const { lastFrame } = render(
      <PipelineScreen diffPath="/tmp/test.diff" onComplete={onComplete} onError={onError} />
    );
    const frame = lastFrame()!;
    // PipelineProgress component shows "Pipeline Progress" as panel title
    expect(frame).toContain('Pipeline Progress');
  });

  it('calls onError when pipeline rejects', async () => {
    const { runPipeline } = await import('@codeagora/core/pipeline/orchestrator.js');
    (runPipeline as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Test failure'));

    const onComplete = vi.fn();
    const onError = vi.fn();
    const { lastFrame } = render(
      <PipelineScreen diffPath="/tmp/test.diff" onComplete={onComplete} onError={onError} />
    );

    // Wait for the async rejection to propagate
    await new Promise(r => setTimeout(r, 100));

    expect(onError).toHaveBeenCalledWith('Test failure');
    expect(lastFrame()).toContain('Error');
  });

  it('calls onComplete when pipeline succeeds', async () => {
    const mockResult = { status: 'success', summary: { decision: 'ACCEPT', reasoning: 'ok', topIssues: [], severityCounts: {} } };
    const { runPipeline } = await import('@codeagora/core/pipeline/orchestrator.js');
    (runPipeline as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResult);

    const onComplete = vi.fn();
    const onError = vi.fn();
    render(
      <PipelineScreen diffPath="/tmp/test.diff" onComplete={onComplete} onError={onError} />
    );

    await new Promise(r => setTimeout(r, 100));

    expect(onComplete).toHaveBeenCalledWith(mockResult);
  });
});
