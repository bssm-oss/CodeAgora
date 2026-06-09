/**
 * #184 L0 Leaderboard Tests
 * Verifies getModelLeaderboard and formatLeaderboard in @codeagora/core/l0/leaderboard.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatLeaderboard } from '@codeagora/core/l0/leaderboard.js';
import type { LeaderboardEntry } from '@codeagora/core/l0/leaderboard.js';

// ============================================================================
// Mock BanditStore so getModelLeaderboard works without file system
// ============================================================================

vi.mock('../../packages/core/src/l0/bandit-store.js', () => {
  return {
    BanditStore: vi.fn().mockImplementation(() => ({
      load: vi.fn().mockResolvedValue(undefined),
      getAllArms: vi.fn().mockReturnValue(
        new Map([
          ['openai/gpt-4o', { alpha: 8, beta: 2, reviewCount: 10 }],
          ['openrouter/qwen/qwen3.7-max', { alpha: 6, beta: 4, reviewCount: 10 }],
          ['groq/llama-3.3-70b', { alpha: 3, beta: 7, reviewCount: 10 }],
        ])
      ),
    })),
  };
});

// ============================================================================
// getModelLeaderboard
// ============================================================================

describe('getModelLeaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns entries sorted by win rate descending', async () => {
    // Re-import after mock is set up
    const { getModelLeaderboard } = await import('@codeagora/core/l0/leaderboard.js');
    const entries = await getModelLeaderboard();

    expect(entries.length).toBeGreaterThan(0);
    // Should be sorted descending by winRate
    for (let i = 0; i < entries.length - 1; i++) {
      expect(entries[i].winRate).toBeGreaterThanOrEqual(entries[i + 1].winRate);
    }
  });

  it('calculates win rate as alpha / (alpha + beta)', async () => {
    const { getModelLeaderboard } = await import('@codeagora/core/l0/leaderboard.js');
    const entries = await getModelLeaderboard();

    // openai/gpt-4o: alpha=8, beta=2 → winRate = 8/10 = 0.8
    const gpt4o = entries.find((e) => e.model === 'openai/gpt-4o');
    expect(gpt4o).toBeDefined();
    expect(gpt4o!.winRate).toBeCloseTo(0.8, 5);
    expect(gpt4o!.alpha).toBe(8);
    expect(gpt4o!.beta).toBe(2);
    expect(gpt4o!.reviews).toBe(10);
  });

  it('includes all models from bandit store', async () => {
    const { getModelLeaderboard } = await import('@codeagora/core/l0/leaderboard.js');
    const entries = await getModelLeaderboard();

    expect(entries).toHaveLength(3);
    const models = entries.map((e) => e.model);
    expect(models).toContain('openai/gpt-4o');
    expect(models).toContain('openrouter/qwen/qwen3.7-max');
    expect(models).toContain('groq/llama-3.3-70b');
  });

  it('returns correct entry shape with all required fields', async () => {
    const { getModelLeaderboard } = await import('@codeagora/core/l0/leaderboard.js');
    const entries = await getModelLeaderboard();

    for (const entry of entries) {
      expect(entry).toHaveProperty('model');
      expect(entry).toHaveProperty('winRate');
      expect(entry).toHaveProperty('reviews');
      expect(entry).toHaveProperty('alpha');
      expect(entry).toHaveProperty('beta');
      expect(typeof entry.winRate).toBe('number');
      expect(entry.winRate).toBeGreaterThanOrEqual(0);
      expect(entry.winRate).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// formatLeaderboard
// ============================================================================

describe('formatLeaderboard', () => {
  it('returns placeholder text when entries list is empty', () => {
    const output = formatLeaderboard([]);
    expect(output).toContain('No model data yet');
  });

  it('returns a string containing headers', () => {
    const entries: LeaderboardEntry[] = [
      { model: 'openai/gpt-4o', winRate: 0.8, reviews: 10, alpha: 8, beta: 2 },
    ];
    const output = formatLeaderboard(entries);
    expect(output).toContain('Model Leaderboard');
    expect(output).toContain('Win Rate');
    expect(output).toContain('Reviews');
  });

  it('includes each model in the formatted output', () => {
    const entries: LeaderboardEntry[] = [
      { model: 'openai/gpt-4o', winRate: 0.8, reviews: 10, alpha: 8, beta: 2 },
      { model: 'groq/llama-3.3-70b', winRate: 0.3, reviews: 10, alpha: 3, beta: 7 },
    ];
    const output = formatLeaderboard(entries);
    expect(output).toContain('openai/gpt-4o');
    expect(output).toContain('groq/llama-3.3-70b');
  });

  it('shows win rate as percentage', () => {
    const entries: LeaderboardEntry[] = [
      { model: 'test/model', winRate: 0.755, reviews: 20, alpha: 15, beta: 5 },
    ];
    const output = formatLeaderboard(entries);
    expect(output).toContain('75.5%');
  });

  it('shows alpha/beta ratio', () => {
    const entries: LeaderboardEntry[] = [
      { model: 'test/model', winRate: 0.8, reviews: 10, alpha: 8, beta: 2 },
    ];
    const output = formatLeaderboard(entries);
    expect(output).toContain('8/2');
  });

  it('includes Thompson Sampling footnote', () => {
    const entries: LeaderboardEntry[] = [
      { model: 'test/model', winRate: 0.5, reviews: 4, alpha: 2, beta: 2 },
    ];
    const output = formatLeaderboard(entries);
    expect(output).toContain('Thompson Sampling');
  });
});
