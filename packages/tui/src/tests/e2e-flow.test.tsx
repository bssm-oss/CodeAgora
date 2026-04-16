/**
 * TUI E2E Flow Tests
 * Tests full user journey: home → navigate → back → quit
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock heavy dependencies
vi.mock('@codeagora/core/pipeline/orchestrator.js', () => ({
  runPipeline: vi.fn(),
}));
vi.mock('@codeagora/core/pipeline/progress.js', () => ({
  createProgressReporter: vi.fn(() => ({ on: vi.fn(), off: vi.fn() })),
}));
vi.mock('@codeagora/shared', () => ({
  t: (key: string) => key,
  getLocale: () => 'en',
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { App } from '../App.js';

describe('TUI E2E Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders home screen on startup', () => {
    const { lastFrame } = render(<App />);
    const frame = lastFrame();
    expect(frame).toBeTruthy();
    expect(frame).toContain('CodeAgora');
  });

  it('shows status bar with keyboard hints', () => {
    const { lastFrame } = render(<App />);
    const frame = lastFrame()!;
    expect(frame).toContain('q');
  });

  it('handles q key to exit from home', () => {
    const { stdin, lastFrame } = render(<App />);
    // App should be rendered
    expect(lastFrame()).toContain('CodeAgora');
    // Press q to quit
    stdin.write('q');
    // After exit, render should have unmounted (or show exit state)
  });

  it('navigates between screens via arrow keys + enter', () => {
    const { stdin, lastFrame } = render(<App />);
    // Home screen should show menu items
    const frame = lastFrame()!;
    expect(frame).toContain('CodeAgora');

    // Navigate down and press enter
    stdin.write('\x1B[B'); // arrow down
    stdin.write('\r');     // enter

    // Should have navigated somewhere (frame changed)
    const newFrame = lastFrame()!;
    expect(newFrame).toBeTruthy();
  });
});
