import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ModelSelector } from '@codeagora/tui/components/ModelSelector.js';
import type { SelectedModel } from '@codeagora/tui/components/ModelSelector.js';

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

  it('renders model entries with tier badges', () => {
    const { lastFrame } = render(
      <ModelSelector onSelect={() => {}} onCancel={() => {}} />
    );
    const frame = lastFrame() ?? '';
    // Should show at least one tier badge (S+ tier models exist)
    expect(frame).toContain('[S+]');
  });

  it('shows model names from rankings', () => {
    const { lastFrame } = render(
      <ModelSelector onSelect={() => {}} onCancel={() => {}} />
    );
    const frame = lastFrame() ?? '';
    // GLM 5 is first S+ tier model
    expect(frame).toContain('GLM 5');
  });

  it('shows context size for models', () => {
    const { lastFrame } = render(
      <ModelSelector onSelect={() => {}} onCancel={() => {}} />
    );
    const frame = lastFrame() ?? '';
    // First model has 128k context
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

  it('shows model count', () => {
    const { lastFrame } = render(
      <ModelSelector onSelect={() => {}} onCancel={() => {}} />
    );
    const frame = lastFrame() ?? '';
    // Should show "( N models)" where N > 0
    expect(frame).toMatch(/\(\d+ models\)/);
  });

  it('shows selected indicator on first item', () => {
    const { lastFrame } = render(
      <ModelSelector onSelect={() => {}} onCancel={() => {}} />
    );
    const frame = lastFrame() ?? '';
    // Uses ▸ (arrow icon) for selection
    expect(frame).toContain('\u25b8');
  });

  it('filters by source when nim is specified', () => {
    const { lastFrame: nimFrame } = render(
      <ModelSelector source="nim" onSelect={() => {}} onCancel={() => {}} />
    );
    const { lastFrame: allFrame } = render(
      <ModelSelector source="all" onSelect={() => {}} onCancel={() => {}} />
    );
    const nimText = nimFrame() ?? '';
    const allText = allFrame() ?? '';
    // nim-only should still show models
    expect(nimText).toContain('Select Model');
    expect(nimText).toContain('[S+]');
    // Both should render without errors
    expect(allText).toContain('Select Model');
  });

  it('sorts models by tier (S+ first)', () => {
    const { lastFrame } = render(
      <ModelSelector onSelect={() => {}} onCancel={() => {}} />
    );
    const frame = lastFrame() ?? '';
    const lines = frame.split('\n');
    // Find lines with tier badges
    const tierLines = lines.filter(l => l.includes('[S+]') || l.includes('[S ') || l.includes('[A+]') || l.includes('[A '));
    // First tier line should be S+
    if (tierLines.length > 0) {
      expect(tierLines[0]).toContain('[S+]');
    }
  });

  it('passes onCancel callback prop', () => {
    const onCancel = vi.fn();
    const { lastFrame } = render(
      <ModelSelector onSelect={() => {}} onCancel={onCancel} />
    );
    // Verify the component renders and accepts the onCancel callback
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Esc cancel');
  });

  it('filters by provider prefix search when provider prop is set to "groq"', () => {
    // When provider="groq" the search state is pre-populated with "groq/"
    // so only groq models are visible in the initial render
    const { lastFrame, unmount } = render(
      <ModelSelector provider="groq" onSelect={() => {}} onCancel={() => {}} />
    );
    const frame = lastFrame() ?? '';
    // The search box should show the pre-populated "groq/" prefix
    expect(frame).toContain('groq/');
    unmount();
  });

  it('pre-populates search input when provider prop is set', () => {
    const { lastFrame, unmount } = render(
      <ModelSelector provider="groq" onSelect={() => {}} onCancel={() => {}} />
    );
    const frame = lastFrame() ?? '';
    // The search field value should begin with the provider name + slash
    expect(frame).toContain('groq/');
    unmount();
  });
});
