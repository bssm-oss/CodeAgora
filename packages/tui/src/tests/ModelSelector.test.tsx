import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from 'ink-testing-library';

// Mock fs/promises to prevent actual file reads
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(JSON.stringify({
    models: [
      {
        source: 'openai',
        model_id: 'gpt-4o',
        name: 'GPT-4o',
        tier: 'flagship',
        context: '128k',
        aa_price_input: 2.5,
        aa_price_output: 10,
      },
      {
        source: 'anthropic',
        model_id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        tier: 'flagship',
        context: '200k',
        aa_price_input: 3,
        aa_price_output: 15,
      },
      {
        source: 'groq',
        model_id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B',
        tier: 'free',
        context: '128k',
        aa_price_input: 0,
        aa_price_output: 0,
      },
    ],
  })),
}));

// Mock provider-status to control "available" state
vi.mock('../utils/provider-status.js', () => ({
  isProviderAvailable: (provider: string) => provider === 'groq',
}));

import { ModelSelector } from '../components/ModelSelector.js';

afterEach(() => {
  cleanup();
});

describe('ModelSelector', () => {
  it('renders without crashing', () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const { lastFrame } = render(
      <ModelSelector onSelect={onSelect} onCancel={onCancel} />
    );
    expect(lastFrame()).toBeDefined();
  });

  it('shows title text', () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const { lastFrame } = render(
      <ModelSelector onSelect={onSelect} onCancel={onCancel} />
    );
    const frame = lastFrame()!;
    // Should show search prompt and model count info
    expect(frame).toContain('models');
  });

  it('shows search cursor', () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const { lastFrame } = render(
      <ModelSelector onSelect={onSelect} onCancel={onCancel} />
    );
    const frame = lastFrame()!;
    // Search bar contains cursor character '|'
    expect(frame).toContain('|');
  });

  it('loads and displays models after mount', async () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const { lastFrame } = render(
      <ModelSelector onSelect={onSelect} onCancel={onCancel} />
    );

    // Wait for useEffect to load models
    await new Promise(r => setTimeout(r, 100));

    const frame = lastFrame()!;
    // Only groq is "available" per our mock, so in default mode (show available only)
    // we should see the groq model
    expect(frame).toContain('Llama 3.3 70B');
  });

  it('filters models by search input', async () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const { lastFrame, stdin } = render(
      <ModelSelector onSelect={onSelect} onCancel={onCancel} />
    );

    // Wait for models to load
    await new Promise(r => setTimeout(r, 100));

    // Type a search query — show all first so we can search across providers
    stdin.write('\t'); // Tab to toggle show all
    await new Promise(r => setTimeout(r, 50));

    // Type "claude" to filter
    stdin.write('claude');
    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame()!;
    expect(frame).toContain('Claude');
  });

  it('shows footer with keyboard hints', () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const { lastFrame } = render(
      <ModelSelector onSelect={onSelect} onCancel={onCancel} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Enter');
    expect(frame).toContain('Esc');
    expect(frame).toContain('Tab');
  });

  it('pre-fills provider prefix when provider prop is given', () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const { lastFrame } = render(
      <ModelSelector provider="openai" onSelect={onSelect} onCancel={onCancel} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('openai/');
  });

  it('calls onCancel on Escape', async () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const { stdin } = render(
      <ModelSelector onSelect={onSelect} onCancel={onCancel} />
    );

    // Send escape key
    stdin.write('\x1B');
    await new Promise(r => setTimeout(r, 50));

    expect(onCancel).toHaveBeenCalled();
  });
});
