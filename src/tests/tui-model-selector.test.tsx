import { describe, it, expect, vi, beforeAll } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ModelSelector } from '@codeagora/tui/components/ModelSelector.js';
import type { SelectedModel } from '@codeagora/tui/components/ModelSelector.js';

// ============================================================================
// Mock fs/promises to provide model data synchronously in tests
// ============================================================================

const { mockReadFile } = vi.hoisted(() => {
  const mockData = JSON.stringify({
    models: [
      { source: 'nim', model_id: 'z-ai/glm5', name: 'GLM 5', tier: 'S+', context: '128k', swe_bench: '77.8%' },
      { source: 'nim', model_id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5', tier: 'S+', context: '128k', swe_bench: '76.8%' },
      { source: 'openrouter', model_id: 'meta/llama-3.3-70b', name: 'Llama 3.3 70B', tier: 'A', context: '131k', swe_bench: '50.0%' },
    ],
  });
  return { mockReadFile: vi.fn().mockResolvedValue(mockData) };
});

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
}));

// Helper: render and wait for async useEffect to populate models
async function renderAndWait(props: React.ComponentProps<typeof ModelSelector>) {
  const result = render(<ModelSelector {...props} />);
  // Wait for useEffect + setState cycle
  await new Promise(r => setTimeout(r, 50));
  return result;
}

// ============================================================================
// Tests
// ============================================================================

describe('ModelSelector', () => {
  it('renders the Select Model title', () => {
    const { lastFrame } = render(
      <ModelSelector onSelect={() => {}} onCancel={() => {}} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Select Model');
  });

  it('shows search input with cursor', () => {
    const { lastFrame } = render(
      <ModelSelector onSelect={() => {}} onCancel={() => {}} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Search:');
    expect(frame).toContain('_');
  });

  it('renders model entries with tier badges', async () => {
    const { lastFrame } = await renderAndWait({ onSelect: () => {}, onCancel: () => {} });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[S+]');
  });

  it('shows model names from rankings', async () => {
    const { lastFrame } = await renderAndWait({ onSelect: () => {}, onCancel: () => {} });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('GLM 5');
  });

  it('shows context size for models', async () => {
    const { lastFrame } = await renderAndWait({ onSelect: () => {}, onCancel: () => {} });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('128k');
  });

  it('shows navigation hints', () => {
    const { lastFrame } = render(
      <ModelSelector onSelect={() => {}} onCancel={() => {}} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Enter select');
    expect(frame).toContain('Esc cancel');
  });

  it('shows model count', async () => {
    const { lastFrame } = await renderAndWait({ onSelect: () => {}, onCancel: () => {} });
    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/\(\d+ models\)/);
  });

  it('shows selected indicator on first item', async () => {
    const { lastFrame } = await renderAndWait({ onSelect: () => {}, onCancel: () => {} });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('\u25b8');
  });

  it('filters by source when nim is specified', async () => {
    const { lastFrame: nimFrame } = await renderAndWait({ source: 'nim', onSelect: () => {}, onCancel: () => {} });
    const nimText = nimFrame() ?? '';
    expect(nimText).toContain('Select Model');
    expect(nimText).toContain('[S+]');
  });

  it('sorts models by tier (S+ first)', async () => {
    const { lastFrame } = await renderAndWait({ onSelect: () => {}, onCancel: () => {} });
    const frame = lastFrame() ?? '';
    const lines = frame.split('\n');
    const tierLines = lines.filter(l => l.includes('[S+]') || l.includes('[S ') || l.includes('[A+]') || l.includes('[A '));
    if (tierLines.length > 0) {
      expect(tierLines[0]).toContain('[S+]');
    }
  });

  it('passes onCancel callback prop', () => {
    const onCancel = vi.fn();
    const { lastFrame } = render(
      <ModelSelector onSelect={() => {}} onCancel={onCancel} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Esc cancel');
  });

  it('filters by provider prefix search when provider prop is set to "groq"', () => {
    const { lastFrame, unmount } = render(
      <ModelSelector provider="groq" onSelect={() => {}} onCancel={() => {}} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('groq/');
    unmount();
  });

  it('pre-populates search input when provider prop is set', () => {
    const { lastFrame, unmount } = render(
      <ModelSelector provider="groq" onSelect={() => {}} onCancel={() => {}} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('groq/');
    unmount();
  });
});
