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
        source: 'openai',
        model_id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini',
        context: '1000k',
        aa_intelligence: 40,
        aa_price_input: 0.00015,
        aa_price_output: 0.0006,
        aa_context: '1000k',
        provider: 'openai',
        isFree: false,
        contextWindow: 1024000,
        isReasoning: false,
      },
      {
        source: 'opencode-go',
        model_id: 'opencode-go/deepseek-v4-flash',
        name: 'DeepSeek V4 Flash (OpenCode Go)',
        context: '128k',
        aa_intelligence: 28,
        aa_price_input: 0,
        aa_price_output: 0,
        aa_context: '128k',
        provider: 'opencode-go',
        isFree: true,
        contextWindow: 131072,
        isReasoning: false,
      },
      {
        source: 'anthropic',
        model_id: 'anthropic/claude-haiku-4-5',
        name: 'Claude Haiku',
        context: '128k',
        aa_intelligence: 35,
        aa_price_input: 0.002,
        aa_price_output: 0.006,
        aa_context: '128k',
        provider: 'anthropic',
        isFree: false,
        contextWindow: 131072,
        isReasoning: false,
      },
    ],
  };
}

function makeCli(available: string[]): DetectedCli[] {
  const all = ['claude', 'codex', 'gemini', 'copilot', 'cursor', 'antigravity', 'opencode'];
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
  const openrouterFastModels = [
    'google/gemini-2.5-flash',
    'deepseek/deepseek-v4-flash',
    'z-ai/glm-4.7-flash',
    'qwen/qwen3-coder-flash',
  ];
  const openrouterStarterModels = [
    'qwen/qwen3-coder-flash',
    'qwen/qwen3-next-80b-a3b-instruct',
  ];
  const openrouterActionModels = [
    'qwen/qwen3-235b-a22b-2507',
    'deepseek/deepseek-v4-flash',
    'qwen/qwen3.5-9b',
    'z-ai/glm-4.7-flash',
    'openai/gpt-oss-120b',
  ];

  it('returns fallback presets when no providers or CLIs detected', () => {
    const presets = generatePresets(makeEmptyEnv(), null);
    expect(presets).toHaveLength(4);
    expect(presets[0]!.id).toBe('action');
    expect(presets[1]!.id).toBe('quick');
    expect(presets[2]!.id).toBe('thorough');
    expect(presets[3]!.id).toBe('free');
    // Fallback presets use the OpenRouter starter lineup.
    for (const p of presets) {
      expect(p.providers).toContain('openrouter');
    }
    expect(presets[1]!.reviewerCount).toBe(4);
    expect(presets[1]!.reviewerModels).toEqual(openrouterFastModels);
  });

  it('returns fallback presets when no providers detected and no CLI available', () => {
    const presets = generatePresets(makeEmptyEnv(), null, makeCli([]));
    expect(presets).toHaveLength(4);
    expect(presets[0]!.id).toBe('action');
  });

  it('generates quick preset from first detected provider', () => {
    const presets = generatePresets(makeEnv(['openai']), null);
    const quick = presets.find((p) => p.id === 'quick');
    expect(quick).toBeDefined();
    expect(quick!.providers).toEqual(['openai']);
    expect(quick!.reviewerCount).toBe(1);
    expect(quick!.discussion).toBe(false);
  });

  it('generates OpenRouter quick preset with the flash lineup', () => {
    const presets = generatePresets(makeEnv(['openrouter']), null);
    const quick = presets.find((p) => p.id === 'quick');
    expect(quick).toBeDefined();
    expect(quick!.providers).toEqual(['openrouter']);
    expect(quick!.reviewerCount).toBe(4);
    expect(quick!.reviewerModels).toEqual(openrouterFastModels);
  });

  it('generates OpenRouter starter preset for balanced aliases', () => {
    const presets = generatePresets(makeEnv(['openrouter']), null);
    const starter = presets.find((p) => p.id === 'free');
    expect(starter).toBeDefined();
    expect(starter!.providers).toEqual(['openrouter']);
    expect(starter!.reviewerCount).toBe(2);
    expect(starter!.reviewerModels).toEqual(openrouterStarterModels);
  });

  it('generates OpenRouter Action preset with cheap reviewers and direct head escalation', () => {
    const presets = generatePresets(makeEnv(['openrouter']), null);
    const action = presets.find((p) => p.id === 'action');
    expect(action).toBeDefined();
    expect(action!.providers).toEqual(['openrouter']);
    expect(action!.backend).toBe('api');
    expect(action!.reviewerCount).toBe(5);
    expect(action!.reviewerModels).toEqual(openrouterActionModels);
    expect(action!.discussion).toBe(true);
    expect(action!.maxRounds).toBe(1);
    expect(action!.roleSelections).toMatchObject({
      supporter: { provider: 'openrouter', model: 'z-ai/glm-5.1', backend: 'api' },
      devilsAdvocate: { provider: 'openrouter', model: 'moonshotai/kimi-k2.5', backend: 'api' },
      moderator: { provider: 'openrouter', model: 'z-ai/glm-5.1', backend: 'api' },
      moderatorEnabled: false,
      head: { provider: 'openrouter', model: 'z-ai/glm-5.1', backend: 'api' },
    });
  });

  it('keeps Action preset available even when OpenRouter is not detected in the shell', () => {
    const presets = generatePresets(makeEnv(['openai']), null, makeCli(['codex']));
    expect(presets.find((p) => p.id === 'action')).toBeDefined();
  });

  it('does not generate free preset when groq is detected', () => {
    const presets = generatePresets(makeEnv(['groq']), null);
    const free = presets.find((p) => p.id === 'free');
    expect(free).toBeUndefined();
  });

  it('does not generate free preset when only OpenCode Go is detected', () => {
    const presets = generatePresets(makeEnv(['opencode-go']), null);
    const free = presets.find((p) => p.id === 'free');
    expect(free).toBeUndefined();
  });

  it('does not generate free preset when only paid providers detected', () => {
    const presets = generatePresets(makeEnv(['openai', 'anthropic']), null);
    const free = presets.find((p) => p.id === 'free');
    expect(free).toBeUndefined();
  });

  it('generates thorough preset with multi-provider when 2+ detected', () => {
    const presets = generatePresets(makeEnv(['groq', 'openai', 'anthropic']), null);
    const thorough = presets.find((p) => p.id === 'thorough');
    expect(thorough).toBeDefined();
    expect(thorough!.providers.length).toBeGreaterThanOrEqual(2);
    expect(thorough!.discussion).toBe(true);
    expect(thorough!.reviewerCount).toBeGreaterThanOrEqual(3);
  });

  it('generates thorough preset with single provider when only 1 detected', () => {
    const presets = generatePresets(makeEnv(['openai']), null);
    const thorough = presets.find((p) => p.id === 'thorough');
    expect(thorough).toBeDefined();
    expect(thorough!.providers).toEqual(['openai']);
    expect(thorough!.reviewerCount).toBe(3);
    expect(thorough!.discussion).toBe(true);
  });

  it('generates CLI preset when CLI backends available', () => {
    const presets = generatePresets(makeEnv(['groq']), null, makeCli(['claude', 'codex', 'opencode']));
    const cli = presets.find((p) => p.id === 'cli');
    expect(cli).toBeDefined();
    expect(cli!.label).toContain('Local CLI ensemble');
    expect(cli!.providers).toEqual(['codex', 'claude', 'opencode']);
    expect(cli!.models).toMatchObject({
      codex: 'gpt-5.4-mini',
      claude: 'haiku',
      opencode: 'deepseek-v4-flash',
    });
    expect(cli!.runtimeProviders).toMatchObject({
      opencode: 'opencode-go',
    });
    expect(cli!.reviewerCount).toBe(3);
    expect(cli!.discussion).toBe(true);
    expect(cli!.backend).toBe('cli');
    expect(cli!.roleSelections).toMatchObject({
      supporter: { provider: 'codex', model: 'gpt-5.3-codex-spark', backend: 'cli' },
      devilsAdvocate: {
        provider: 'opencode',
        model: 'kimi-k2.7-code',
        backend: 'cli',
        runtimeProvider: 'opencode-go',
      },
      moderator: { provider: 'codex', model: 'gpt-5.5', backend: 'cli' },
      head: { provider: 'codex', model: 'gpt-5.5', backend: 'cli' },
    });
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
      makeEnv(['groq', 'openai', 'anthropic', 'openrouter', 'opencode-go', 'together']),
      null,
    );
    const thorough = presets.find((p) => p.id === 'thorough');
    expect(thorough).toBeDefined();
    expect(thorough!.providers.length).toBeLessThanOrEqual(4);
  });

  it('caps thorough preset reviewerCount at 5', () => {
    const presets = generatePresets(
      makeEnv(['groq', 'openai', 'anthropic', 'openrouter']),
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
        { provider: 'openai', model: 'gpt-4o-mini', backend: 'api' },
      ],
      reviewerCount: 4,
      discussion: true,
    };
    const config = buildMultiProviderConfig(params);
    const reviewers = config.reviewers;

    expect(reviewers).toHaveLength(4);
    // Even distribution: r1=groq, r2=openai, r3=groq, r4=openai
    expect(reviewers[0]!.provider).toBe('groq');
    expect(reviewers[1]!.provider).toBe('openai');
    expect(reviewers[2]!.provider).toBe('groq');
    expect(reviewers[3]!.provider).toBe('openai');
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
        { provider: 'openai', model: 'gpt-4o-mini', backend: 'api' },
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
        { provider: 'openai', model: 'gpt-4o-mini', backend: 'api' },
      ],
      reviewerCount: 2,
      discussion: true,
    });

    const supporterPool = config.supporters.pool;
    expect(supporterPool).toHaveLength(1);
    // Supporter uses second provider for diversity
    expect(supporterPool[0]!.provider).toBe('openai');
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
        { provider: 'openai', model: 'gpt-4o-mini', backend: 'api', contextWindow: 1024000 },
      ],
      reviewerCount: 2,
      discussion: true,
    });

    expect(config.moderator.provider).toBe('openai');
    expect(config.moderator.model).toBe('gpt-4o-mini');
  });

  it('uses head with same model as moderator', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', backend: 'api', contextWindow: 131072 },
        { provider: 'openai', model: 'gpt-4o-mini', backend: 'api', contextWindow: 1024000 },
      ],
      reviewerCount: 2,
      discussion: true,
    });

    const head = config['head'] as Record<string, unknown>;
    expect(head['provider']).toBe('openai');
    expect(head['model']).toBe('gpt-4o-mini');
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

  it('sets discussion enabled to false when discussion is false', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', backend: 'api' },
      ],
      reviewerCount: 3,
      discussion: false,
    });

    expect((config.discussion as Record<string, unknown>)['enabled']).toBe(false);
    expect(config.discussion.maxRounds).toBeGreaterThanOrEqual(1);
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
        { provider: 'openai', model: 'gpt-4o-mini', backend: 'api' },
        { provider: 'anthropic', model: 'claude-haiku-4-5', backend: 'api' },
      ],
      reviewerCount: 5,
      discussion: true,
    });

    const reviewers = config.reviewers;
    expect(reviewers).toHaveLength(5);
    // r1=groq, r2=openai, r3=anthropic, r4=groq, r5=openai
    expect(reviewers[0]!.provider).toBe('groq');
    expect(reviewers[1]!.provider).toBe('openai');
    expect(reviewers[2]!.provider).toBe('anthropic');
    expect(reviewers[3]!.provider).toBe('groq');
    expect(reviewers[4]!.provider).toBe('openai');
  });

  it('supports cli backend', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'claude', model: 'claude', backend: 'cli' },
      ],
      reviewerCount: 1,
      discussion: false,
    });

    expect(config.reviewers[0]!.backend).toBe('claude');
    expect(config.reviewers[0]!.provider).toBeUndefined();
    expect(config.moderator.backend).toBe('claude');
    expect(config.moderator.provider).toBeUndefined();
    expect((config.head as Record<string, unknown>)['backend']).toBe('claude');
  });

  it('supports opencode CLI runtime provider', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'opencode', model: 'deepseek-v4-flash', backend: 'cli', runtimeProvider: 'opencode-go' },
      ],
      reviewerCount: 1,
      discussion: false,
    });

    expect(config.reviewers[0]).toMatchObject({
      backend: 'opencode',
      provider: 'opencode-go',
      model: 'deepseek-v4-flash',
    });
    expect(config.moderator).toMatchObject({
      backend: 'opencode',
      provider: 'opencode-go',
      model: 'deepseek-v4-flash',
    });
  });

  it('supports explicit local CLI role selections', () => {
    const config = buildMultiProviderConfig({
      selections: [
        { provider: 'codex', model: 'gpt-5.4-mini', backend: 'cli' },
        { provider: 'claude', model: 'haiku', backend: 'cli' },
        { provider: 'opencode', model: 'deepseek-v4-flash', backend: 'cli', runtimeProvider: 'opencode-go' },
      ],
      reviewerCount: 3,
      discussion: true,
      supporterSelection: { provider: 'codex', model: 'gpt-5.3-codex-spark', backend: 'cli' },
      devilsAdvocateSelection: {
        provider: 'opencode',
        model: 'kimi-k2.7-code',
        backend: 'cli',
        runtimeProvider: 'opencode-go',
      },
      moderatorSelection: { provider: 'codex', model: 'gpt-5.5', backend: 'cli' },
      headSelection: { provider: 'codex', model: 'gpt-5.5', backend: 'cli' },
    });

    expect(config.supporters.pool[0]).toMatchObject({
      backend: 'codex',
      model: 'gpt-5.3-codex-spark',
    });
    expect(config.supporters.devilsAdvocate).toMatchObject({
      backend: 'opencode',
      provider: 'opencode-go',
      model: 'kimi-k2.7-code',
    });
    expect(config.moderator).toMatchObject({
      backend: 'codex',
      model: 'gpt-5.5',
    });
    expect(config.head).toMatchObject({
      backend: 'codex',
      model: 'gpt-5.5',
    });
    expect(config.discussion.enabled).toBe(true);
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
    const presets = generatePresets(makeEnv(['groq', 'openai']), null);
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
