import { describe, expect, it } from 'vitest';
import {
  applyPipelineTimeouts,
  applyReviewerSelectionToConfig,
} from '@codeagora/core/pipeline/orchestrator.js';
import { buildDefaultConfig, normalizeConfig } from '@codeagora/core/config/loader.js';
import type { Config } from '@codeagora/core/types/config.js';

function arrayConfig(): Config {
  return {
    ...buildDefaultConfig('groq'),
    reviewers: [
      { id: 'r1', backend: 'api', provider: 'groq', model: 'llama-3.3', enabled: true, timeout: 120 },
      { id: 'r2', backend: 'api', provider: 'groq', model: 'llama-3.3', enabled: true, timeout: 120 },
      { id: 'r3', backend: 'api', provider: 'groq', model: 'llama-3.3', enabled: true, timeout: 120 },
    ],
  };
}

describe('pipeline runtime options', () => {
  it('applies reviewer count to declarative reviewer config before normalization', () => {
    const selected = applyReviewerSelectionToConfig(buildDefaultConfig('groq'), { count: 5 });
    const normalized = normalizeConfig(selected);

    expect(normalized.reviewers).toHaveLength(5);
    expect(normalized.reviewers.map((reviewer) => reviewer.id)).toEqual([
      'auto-1',
      'auto-2',
      'auto-3',
      'auto-4',
      'auto-5',
    ]);
  });

  it('applies reviewer names in requested order for array configs', () => {
    const selected = applyReviewerSelectionToConfig(arrayConfig(), { names: ['r3', 'r1'] });
    const normalized = normalizeConfig(selected);

    expect(normalized.reviewers.map((reviewer) => reviewer.id)).toEqual(['r3', 'r1']);
  });

  it('throws when reviewer selection asks for unavailable reviewers', () => {
    expect(() => applyReviewerSelectionToConfig(arrayConfig(), { count: 4 })).toThrow(
      'Requested 4 reviewer(s), but only 3 enabled reviewer(s) are available',
    );
    expect(() => applyReviewerSelectionToConfig(arrayConfig(), { names: ['missing'] })).toThrow(
      'Unknown reviewer id(s): missing',
    );
  });

  it('clamps L2/L3 backend timeouts to the pipeline timeout budget', () => {
    const config = normalizeConfig(buildDefaultConfig('groq'));

    applyPipelineTimeouts(config, 30_000);

    expect(config.errorHandling.maxRetries).toBeLessThanOrEqual(1);
    expect(config.supporters.pool.every((supporter) => supporter.timeout <= 30)).toBe(true);
    expect(config.supporters.devilsAdvocate.timeout).toBeLessThanOrEqual(30);
    expect(config.moderator.timeout).toBeLessThanOrEqual(30);
    expect(config.head.timeout).toBeLessThanOrEqual(30);
  });
});
