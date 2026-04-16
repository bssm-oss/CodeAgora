import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from 'ink-testing-library';

// Mock the Menu component to avoid ink-select-input ESM issues.
// Return a simple fragment with raw text spans.
vi.mock('../components/Menu.js', () => ({
  Menu: ({ items }: { items: Array<{ label: string; value: string }> }) =>
    React.createElement(
      React.Fragment,
      null,
      ...items.map((item: { label: string; value: string }) =>
        React.createElement('ink-text', { key: item.value }, item.label)
      ),
    ),
}));

import { HomeScreen } from '../screens/HomeScreen.js';

afterEach(() => {
  cleanup();
});

describe('HomeScreen', () => {
  it('renders without crashing', () => {
    const onNavigate = vi.fn();
    const onQuit = vi.fn();
    const { lastFrame } = render(
      <HomeScreen onNavigate={onNavigate} onQuit={onQuit} />
    );
    const frame = lastFrame();
    expect(frame).toBeDefined();
  });

  it('displays version info', () => {
    const onNavigate = vi.fn();
    const onQuit = vi.fn();
    const { lastFrame } = render(
      <HomeScreen onNavigate={onNavigate} onQuit={onQuit} />
    );
    const frame = lastFrame()!;
    // Should show version string (default or env)
    expect(frame).toMatch(/v\d+\.\d+/);
  });

  it('displays Ready status', () => {
    const onNavigate = vi.fn();
    const onQuit = vi.fn();
    const { lastFrame } = render(
      <HomeScreen onNavigate={onNavigate} onQuit={onQuit} />
    );
    expect(lastFrame()).toContain('Ready');
  });

  it('shows menu items with arrow icons', () => {
    const onNavigate = vi.fn();
    const onQuit = vi.fn();
    const { lastFrame } = render(
      <HomeScreen onNavigate={onNavigate} onQuit={onQuit} />
    );
    const frame = lastFrame()!;
    // Menu items should be visible (translated or key fallback)
    // At minimum the icons.arrow character should appear for each menu item
    expect(frame).toContain('\u25b8'); // arrow icon from menu items
  });
});
