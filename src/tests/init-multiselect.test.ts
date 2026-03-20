/**
 * Init Multi-Provider Selection Tests (#173 Phase 3)
 * Tests for generatePresets, buildMultiProviderConfig, and backward compatibility.
 */

import { describe, it, expect } from 'vitest';

import {
  generatePresets,
  buildMultiProviderConfig,
  buildCustomConfig,
  type MultiProviderConfigParams,
  type ProviderModelSelection,
  type DynamicPreset,
} from '@codeagora/cli/commands/init.js';
import type { EnvironmentReport } from '@codeagora/shared/utils/env-detect.js';
import type { ModelsCatalog } from '@codeagora/shared/data/models-dev.js';
import type { DetectedCli } from '@codeagora/shared/utils/cli-detect.js';

// ============================================================================
// Helpers — mock data
// ============================================================================

function makeEnv(providers: string[]): EnvironmentReport {
  return {
    apiProviders: providers.map((name) => ({
      provider: name,
      envVar: `${name.toUpperCase().replace(/-/g, '_')}_API_KEY`,
      available: true,
    })),
    cliBackends: [],
  };
}

function makeEmptyEnv(): EnvironmentReport {
  return {
    apiProviders: [],
    cliBackends: [],
  };
}

function makeCatalog(): ModelsCatalog {
  return {
    source: 'test',
    models: [
      {
        source: 'groq',
        model_id: 'groq/llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B',
        context: '128k',
        aa_intelligence: 30,
        aa_price_input: 0.00059,
        aa_price_output: 0.00079,
        aa_context: '128k',
        provider: 'groq',
        isFree: false,
        contextWindow: 131072,
        isReasoning: false,
      },
      {
        source: 'groq',
        model_id: 'groq/llama-3.1-8b-instant',
        name: 'Llama 3.1 8B',
        context: '128k',
        aa_intelligence: 15,
        aa_price_input: 0,
        aa_price_output: 0,
        aa_context: '128k',
        provider: 'groq',
        isFree: true,
        contextWindow: 131072,
        isReasoning: false,
      },
      {
        source: 'google',
        model_id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        context: '1000k',
        aa_intelligence: 40,
        aa_price_input: 0.00015,
        aa_price_output: 0.0006,
        aa_context: '1000k',
        provider: 'google',
        isFree: false,
        contextWindow: 1024000,
        isReasoning: false,
      },
      {
        source: 'cerebras',
        model_id: 'cerebras/llama-3.3-70b',
        name: 'Llama 3.3 70B (Cerebras)',
        context: '128k',
        aa_intelligence: 28,
        aa_price_input: 0,
        aa_price_output: 0,
        aa_context: '128k',
        provider: 'cerebras',
        isFree: true,
        contextWindow: 131072,
        isReasoning: false,
      },
      {
        source: 'mistral',
        model_id: 'mistral/mistral-large-latest',
        name: 'Mistral Large',
        context: '128k',
        aa_intelligence: 35,
        aa_price_input: 0.002,
        aa_price_output: 0.006,
        aa_context: '128k',
        provider: 'mistral',
        isFree: false,
        contextWindow: 131072,
        isReasoning: false,
      },
    ],
  };
}

function makeCli(available: string[]): DetectedCli[] {
  const all = ['claude', 'codex', 'gemini', 'copilot', 'opencode'];
  return all.map((backend) => ({
    backend,
    bin: backend,
    available: available.includes(backend),
  }));
}

// ============================================================================
// generatePresets
// ============================================================================

describe('generatePresets()', () => {
  it('returns fallback presets when no providers or CLIs detected', () => {
    const presets = generatePresets(makeEmptyEnv(), null);
    expect(presets).toHaveLength(3);
    expect(presets[0]!.id).toBe('quick');
    expect(presets[1]!.id).toBe('thorough');
    expect(presets[2]!.id).toBe('free');
    // All fallback presets use groq
    for (const p of presets) {
      expect(p.providers).toContain('groq');
    }
  });

  it('returns fallback presets when no providers detected and no CLI available', () => {
    const presets = generatePresets(makeEmptyEnv(), null, makeCli([]));
    expect(presets).toHaveLength(3);
    expect(presets[0]!.id).toBe('quick');
  });

  it('generates quick preset from first detected provider', () => {
    const presets = generatePresets(makeEnv(['google']), null);
    const quick = presets.find((p) => p.id === 'quick');
    expect(quick).toBeDefined();
    expect(quick!.providers).toEqual(['google']);
    expect(quick!.reviewerCount).toBe(1);
    expect(quick!.discussion).toBe(false);
  });

  it('generates free preset when groq is detected', () => {
    const presets = generatePresets(makeEnv(['groq']), null);
    const free = presets.find((p) => p.id === 'free');
    expect(free).toBeDefined();
    expect(free!.providers).toContain('groq');
  });

  it('generates free preset when cerebras is detected', () => {
    const presets = generatePresets(makeEnv(['cerebras']), null);
    const free = presets.find((p) => p.id === 'free');
    expect(free).toBeDefined();
    expect(free!.providers).toContain('cerebras');
  });

  it('does not generate free preset when only paid providers detected', () => {
    const presets = generatePresets(makeEnv(['google', 'mistral']), null);
    const free = presets.find((p) => p.id === 'free');
    expect(free).toBeUndefined();
  });

  it('generates thorough preset with multi-provider when 2+ detected', () => {
    const presets = generatePresets(makeEnv(['groq', 'google', 'mistral']), null);
    const thorough = presets.find((p) => p.id === 'thorough');
    expect(thorough).toBeDefined();
    expect(thorough!.providers.length).toBeGreaterThanOrEqual(2);
    expect(thorough!.discussion).toBe(true);
    expect(thorough!.reviewerCount).toBeGreaterThanOrEqual(3);
  });

  it('generates thorough preset with single provider when only 1 detected', () => {
    const presets = generatePresets(makeEnv(['google']), null);
    const thorough = presets.find((p) => p.id === 'thorough');
    expect(thorough).toBeDefined();
    expect(thorough!.providers).toEqual(['google']);
    expect(thorough!.reviewerCount).toBe(3);
    expect(thorough!.discussion).toBe(true);
  });

  it('generates CLI preset when CLI backends available', () => {
    const presets = generatePresets(makeEnv(['groq']), null, makeCli(['claude']));
    const cli = presets.find((p) => p.id === 'cli');
    expect(cli).toBeDefined();
    expect(cli!.providers).toContain('claude');
    expect(cli!.backend).toBe('cli');
  });

  it('does not generate CLI preset when no CLI backends available', () => {
    const presets = generatePresets(makeEnv(['groq']), null, makeCli([]));
    const cli = presets.find((p) => p.id === 'cli');
    expect(cli).toBeUndefined();
  });

  it('uses catalog model names when catalog available', () => {
    const presets = generatePresets(makeEnv(['groq']), makeCatalog());
    const quick = presets.find((p) => p.id === 'quick');
    expect(quick).toBeDefined();
    // Should use catalog's top model for groq
    expect(quick!.models['groq']).toBeDefined();
  });

  it('caps thorough preset providers at 4', () => {
    const presets = generatePresets(
      makeEnv(['groq', 'google', 'mistral', 'openrouter', 'cerebras', 'together']),
      null,
    );
    const thorough = presets.find((p) => p.id === 'thorough');
    expect(thorough).toBeDefined();
    expect(thorough!.providers.length).toBeLessThanOrEqual(4);
  });

  it('caps thorough preset reviewerCount at 5', () => {
    const presets = generatePresets(
      makeEnv(['groq', 'google', 'mistral', 'openrouter']),
      null,
    );
    const thorough = presets.find((p) => p.id === 'thorough');
    expect(thorough).toBeDefined();
    expect(thorough!.reviewerCount).toBeLessThanOrEqual(5);
  });
});

// ============================================================================
// buildMultiProviderConfig
// ============================================================================

describe('buildMultiProviderConfig()', () => {
  it('distributes reviewers across providers evenly', () => {
    const params: MultiProviderConfigParams = {
      selections: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', backend: 'api' },
        { provider: 'google', model: 'gemini-2.5-flash', backend: 'api' },
      ],
      reviewerCount: 4,
      discussion: true,
    };
    const config = buildMultiProviderConfig(params);
    const reviewers = config.reviewers;

    expect(reviewers).toHaveLength(4);
    // Even distribution: r1=groq, r2=google, r3=groq, r4=google
    expect(reviewers[0]!.provider).toBe('groq');
    expect(reviewers[1]!.provider).toBe('google');
    expect(reviewers[2]!.provider).toBe('groq');
    expect(reviewers[3]!.provider).toBe('google');
  });

  it('works with single provider', () => {
    const params: MultiProviderConfigParams = {
      selections: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', backend: 'api' },
      ],
      reviewerCount: 3,
      discussion: false,
    };
    const config = buildMultiProviderConfig(params);
    const reviewers = config.reviewers;

    expect(reviewers).toHaveLength(3);
    for (const r of reviewers) {
      expect(r.provider).toBe('groq');
      expect(r.model).toBe('llama-3.3-70b-versatile');
    }
  });

  it('gives reviewers sequential IDs r1, r2, r3', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', backend: 'api' },
        { provider: 'google', model: 'gemini-2.5-flash', backend: 'api' },
      ],
      reviewerCount: 3,
      discussion: true,
    });

    expect(config.reviewers[0]!.id).toBe('r1');
    expect(config.reviewers[1]!.id).toBe('r2');
    expect(config.reviewers[2]!.id).toBe('r3');
  });

  it('assigns descriptive labels to reviewers', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', backend: 'api' },
      ],
      reviewerCount: 1,
      discussion: false,
    });

    expect(config.reviewers[0]!.label).toContain('groq');
    expect(config.reviewers[0]!.label).toContain('llama-3.3-70b-versatile');
    expect(config.reviewers[0]!.label).toContain('Reviewer 1');
  });

  it('uses different provider for supporter when multiple providers available', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', backend: 'api' },
        { provider: 'google', model: 'gemini-2.5-flash', backend: 'api' },
      ],
      reviewerCount: 2,
      discussion: true,
    });

    const supporterPool = config.supporters.pool;
    expect(supporterPool).toHaveLength(1);
    // Supporter uses second provider for diversity
    expect(supporterPool[0]!.provider).toBe('google');
  });

  it('uses same provider for supporter when single provider', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', backend: 'api' },
      ],
      reviewerCount: 2,
      discussion: true,
    });

    expect(config.supporters.pool[0]!.provider).toBe('groq');
  });

  it('selects strongest model (highest context) for moderator', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', backend: 'api', contextWindow: 131072 },
        { provider: 'google', model: 'gemini-2.5-flash', backend: 'api', contextWindow: 1024000 },
      ],
      reviewerCount: 2,
      discussion: true,
    });

    expect(config.moderator.provider).toBe('google');
    expect(config.moderator.model).toBe('gemini-2.5-flash');
  });

  it('uses head with same model as moderator', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', backend: 'api', contextWindow: 131072 },
        { provider: 'google', model: 'gemini-2.5-flash', backend: 'api', contextWindow: 1024000 },
      ],
      reviewerCount: 2,
      discussion: true,
    });

    const head = config['head'] as Record<string, unknown>;
    expect(head['provider']).toBe('google');
    expect(head['model']).toBe('gemini-2.5-flash');
  });

  it('sets discussion maxRounds > 0 when discussion is true', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', backend: 'api' },
      ],
      reviewerCount: 3,
      discussion: true,
    });

    expect(config.discussion.maxRounds).toBeGreaterThan(0);
  });

  it('sets discussion maxRounds to 0 when discussion is false', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', backend: 'api' },
      ],
      reviewerCount: 3,
      discussion: false,
    });

    expect(config.discussion.maxRounds).toBe(0);
  });

  it('includes errorHandling defaults', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', backend: 'api' },
      ],
      reviewerCount: 1,
      discussion: false,
    });

    expect(config.errorHandling.maxRetries).toBe(2);
    expect(config.errorHandling.forfeitThreshold).toBe(0.7);
  });

  it('throws when reviewerCount is 0', () => {
    expect(() => buildMultiProviderConfig({
      selections: [{ provider: 'groq', model: 'x', backend: 'api' }],
      reviewerCount: 0,
      discussion: false,
    })).toThrow('reviewerCount must be between 1 and 10');
  });

  it('throws when reviewerCount exceeds 10', () => {
    expect(() => buildMultiProviderConfig({
      selections: [{ provider: 'groq', model: 'x', backend: 'api' }],
      reviewerCount: 11,
      discussion: false,
    })).toThrow('reviewerCount must be between 1 and 10');
  });

  it('throws when selections is empty', () => {
    expect(() => buildMultiProviderConfig({
      selections: [],
      reviewerCount: 1,
      discussion: false,
    })).toThrow('At least one provider/model selection is required');
  });

  it('distributes 3 providers across 5 reviewers correctly', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'groq', model: 'llama-3.3-70b', backend: 'api' },
        { provider: 'google', model: 'gemini-2.5-flash', backend: 'api' },
        { provider: 'mistral', model: 'mistral-large', backend: 'api' },
      ],
      reviewerCount: 5,
      discussion: true,
    });

    const reviewers = config.reviewers;
    expect(reviewers).toHaveLength(5);
    // r1=groq, r2=google, r3=mistral, r4=groq, r5=google
    expect(reviewers[0]!.provider).toBe('groq');
    expect(reviewers[1]!.provider).toBe('google');
    expect(reviewers[2]!.provider).toBe('mistral');
    expect(reviewers[3]!.provider).toBe('groq');
    expect(reviewers[4]!.provider).toBe('google');
  });

  it('supports cli backend', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'claude', model: 'claude', backend: 'cli' },
      ],
      reviewerCount: 1,
      discussion: false,
    });

    expect(config.reviewers[0]!.backend).toBe('cli');
    expect(config.moderator.backend).toBe('cli');
  });

  it('passes mode and language through', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', backend: 'api' },
      ],
      reviewerCount: 1,
      discussion: false,
      mode: 'strict',
      language: 'ko',
    });

    expect(config['mode']).toBe('strict');
    expect(config['language']).toBe('ko');
  });
});

// ============================================================================
// Backward compatibility — buildCustomConfig still works
// ============================================================================

describe('buildCustomConfig backward compatibility', () => {
  it('still creates config with single provider as before', () => {
    const config = buildCustomConfig({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      reviewerCount: 3,
      discussion: true,
    });

    expect(config.reviewers).toHaveLength(3);
    for (const r of config.reviewers) {
      expect(r.provider).toBe('groq');
    }
    expect(config.moderator.provider).toBe('groq');
  });

  it('maintains same structure as multi-provider config', () => {
    const single = buildCustomConfig({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      reviewerCount: 1,
      discussion: false,
    });

    const multi = buildMultiProviderConfig({
      selections: [{ provider: 'groq', model: 'llama-3.3-70b-versatile', backend: 'api' }],
      reviewerCount: 1,
      discussion: false,
    });

    // Both should have the same top-level keys
    expect(Object.keys(single).sort()).toEqual(Object.keys(multi).sort());
    // Both should have reviewers, supporters, moderator, discussion, errorHandling
    expect(single.reviewers).toHaveLength(1);
    expect(multi.reviewers).toHaveLength(1);
    expect(single.supporters.pool).toHaveLength(1);
    expect(multi.supporters.pool).toHaveLength(1);
  });
});

// ============================================================================
// Catalog unavailable — graceful fallback
// ============================================================================

describe('catalog unavailable fallback', () => {
  it('generatePresets works with null catalog', () => {
    const presets = generatePresets(makeEnv(['groq', 'google']), null);
    expect(presets.length).toBeGreaterThan(0);
    // Models should fall back to PROVIDER_DEFAULT_MODELS
    const quick = presets.find((p) => p.id === 'quick');
    expect(quick!.models['groq']).toBe('llama-3.3-70b-versatile');
  });

  it('generatePresets uses catalog models when available', () => {
    const catalog = makeCatalog();
    const presets = generatePresets(makeEnv(['groq']), catalog);
    const quick = presets.find((p) => p.id === 'quick');
    expect(quick).toBeDefined();
    // The model should come from catalog (top by intelligence)
    expect(quick!.models['groq']).toBeDefined();
  });
});
