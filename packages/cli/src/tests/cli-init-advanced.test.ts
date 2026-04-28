/**
 * CLI Init Advanced Tests
 * Tests buildMultiProviderConfig() and generatePresets() from commands/init.ts
 */

import { describe, it, expect } from 'vitest';
import {
  buildMultiProviderConfig,
  generatePresets,
  resolvePresetAlias,
  PRESET_ALIAS_ENTRIES,
} from '../commands/init.js';
import type {
  MultiProviderConfigParams,
  ProviderModelSelection,
} from '../commands/init.js';
import type { EnvironmentReport, ApiProviderStatus } from '@codeagora/shared/utils/env-detect.js';
import type { DetectedCli } from '@codeagora/shared/utils/cli-detect.js';

// ============================================================================
// Helpers
// ============================================================================

function makeApiProvider(provider: string, available: boolean): ApiProviderStatus {
  return { provider, available, envVar: `${provider.toUpperCase()}_API_KEY` };
}

function makeEnv(providers: Array<{ name: string; available: boolean }>): EnvironmentReport {
  return {
    apiProviders: providers.map((p) => makeApiProvider(p.name, p.available)),
    cliTools: [],
    nodeVersion: '20.0.0',
    platform: 'linux',
  } as unknown as EnvironmentReport;
}

function makeCli(backend: string, available: boolean): DetectedCli {
  return { backend, available, bin: backend, version: '1.0.0' } as DetectedCli;
}

function makeSelection(
  provider: string,
  model: string,
  backend: 'api' | 'cli' = 'api',
  contextWindow?: number,
): ProviderModelSelection {
  return { provider, model, backend, contextWindow };
}

// ============================================================================
// buildMultiProviderConfig
// ============================================================================

describe('buildMultiProviderConfig()', () => {
  it('distributes reviewers evenly across providers (round-robin)', () => {
    const params: MultiProviderConfigParams = {
      selections: [
        makeSelection('groq', 'llama-3.3-70b', 'api'),
        makeSelection('anthropic', 'claude-3-5-sonnet', 'api'),
      ],
      reviewerCount: 4,
      discussion: false,
    };
    const config = buildMultiProviderConfig(params);

    expect(config.reviewers).toHaveLength(4);
    const providers = config.reviewers.map((r) => r.provider);
    // Round-robin: groq, anthropic, groq, anthropic
    expect(providers[0]).toBe('groq');
    expect(providers[1]).toBe('anthropic');
    expect(providers[2]).toBe('groq');
    expect(providers[3]).toBe('anthropic');
  });

  it('uses the provider with the highest context window as moderator/head', () => {
    const params: MultiProviderConfigParams = {
      selections: [
        makeSelection('groq', 'llama-3.3-70b', 'api', 8000),
        makeSelection('anthropic', 'claude-3-5-sonnet', 'api', 200000),
      ],
      reviewerCount: 2,
      discussion: false,
    };
    const config = buildMultiProviderConfig(params);

    expect(config.moderator.provider).toBe('anthropic');
    expect((config.head as Record<string, unknown>)['provider']).toBe('anthropic');
  });

  it('falls back to first selection as moderator when context windows are equal', () => {
    const params: MultiProviderConfigParams = {
      selections: [
        makeSelection('groq', 'model-a', 'api'),
        makeSelection('openai', 'model-b', 'api'),
      ],
      reviewerCount: 2,
      discussion: true,
    };
    const config = buildMultiProviderConfig(params);
    // Both have undefined contextWindow (0 after coerce) — first wins sort
    expect(config.moderator.provider).toBe('groq');
  });

  it('uses second selection for supporters when 2+ selections exist (diversity)', () => {
    const params: MultiProviderConfigParams = {
      selections: [
        makeSelection('groq', 'model-a', 'api'),
        makeSelection('anthropic', 'claude-3', 'api'),
      ],
      reviewerCount: 2,
      discussion: false,
    };
    const config = buildMultiProviderConfig(params);

    const supporterPool = config.supporters.pool;
    expect(supporterPool[0]?.provider).toBe('anthropic');
  });

  it('uses first selection for supporters when only one selection exists', () => {
    const params: MultiProviderConfigParams = {
      selections: [makeSelection('groq', 'model-a', 'api')],
      reviewerCount: 2,
      discussion: false,
    };
    const config = buildMultiProviderConfig(params);

    const supporterPool = config.supporters.pool;
    expect(supporterPool[0]?.provider).toBe('groq');
  });

  it('sets discussion.enabled to false when discussion=false', () => {
    const params: MultiProviderConfigParams = {
      selections: [makeSelection('groq', 'model-a')],
      reviewerCount: 1,
      discussion: false,
    };
    const config = buildMultiProviderConfig(params);
    expect(config.discussion.enabled).toBe(false);
  });

  it('sets discussion.enabled to true and maxRounds > 0 when discussion=true', () => {
    const params: MultiProviderConfigParams = {
      selections: [makeSelection('groq', 'model-a')],
      reviewerCount: 1,
      discussion: true,
    };
    const config = buildMultiProviderConfig(params);
    expect(config.discussion.enabled).toBe(true);
    expect(config.discussion.maxRounds).toBeGreaterThan(0);
  });

  it('always sets a valid maxRounds (>= 1) regardless of discussion flag', () => {
    const params: MultiProviderConfigParams = {
      selections: [makeSelection('groq', 'model-a')],
      reviewerCount: 1,
      discussion: false,
    };
    const config = buildMultiProviderConfig(params);
    expect(config.discussion.maxRounds).toBeGreaterThanOrEqual(1);
  });

  it('throws when reviewerCount is 0', () => {
    expect(() =>
      buildMultiProviderConfig({
        selections: [makeSelection('groq', 'model')],
        reviewerCount: 0,
        discussion: false,
      }),
    ).toThrow();
  });

  it('throws when reviewerCount exceeds 10', () => {
    expect(() =>
      buildMultiProviderConfig({
        selections: [makeSelection('groq', 'model')],
        reviewerCount: 11,
        discussion: false,
      }),
    ).toThrow();
  });

  it('throws when selections array is empty', () => {
    expect(() =>
      buildMultiProviderConfig({
        selections: [],
        reviewerCount: 3,
        discussion: false,
      }),
    ).toThrow();
  });

  it('assigns sequential ids to reviewers (r1, r2, ...)', () => {
    const params: MultiProviderConfigParams = {
      selections: [makeSelection('groq', 'model-a')],
      reviewerCount: 3,
      discussion: false,
    };
    const config = buildMultiProviderConfig(params);
    expect(config.reviewers.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
  });

  it('uses cli backend type when selection backend is cli', () => {
    const params: MultiProviderConfigParams = {
      selections: [makeSelection('claude', 'claude', 'cli')],
      reviewerCount: 2,
      discussion: false,
    };
    const config = buildMultiProviderConfig(params);
    // For CLI selections, backend is set to the provider name, provider is undefined
    for (const reviewer of config.reviewers) {
      expect(reviewer.backend).toBe('claude');
      expect(reviewer.provider).toBeUndefined();
    }
  });

  it('respects language parameter', () => {
    const params: MultiProviderConfigParams = {
      selections: [makeSelection('groq', 'model-a')],
      reviewerCount: 1,
      discussion: false,
      language: 'ko',
    };
    const config = buildMultiProviderConfig(params);
    expect((config as Record<string, unknown>)['language']).toBe('ko');
  });

  it('sets mode from params', () => {
    const params: MultiProviderConfigParams = {
      selections: [makeSelection('groq', 'model-a')],
      reviewerCount: 1,
      discussion: false,
      mode: 'strict',
    };
    const config = buildMultiProviderConfig(params);
    expect((config as Record<string, unknown>)['mode']).toBe('strict');
  });
});

// ============================================================================
// generatePresets
// ============================================================================

describe('generatePresets()', () => {
  it('returns fallback presets when no providers or CLI detected', () => {
    const env = makeEnv([{ name: 'groq', available: false }]);
    const presets = generatePresets(env, null);
    // Fallback contains quick/thorough/free
    expect(presets.length).toBeGreaterThan(0);
    const ids = presets.map((p) => p.id);
    expect(ids).toContain('quick');
  });

  it('generates a "quick" preset from the first detected provider', () => {
    const env = makeEnv([{ name: 'groq', available: true }]);
    const presets = generatePresets(env, null);
    const quick = presets.find((p) => p.id === 'quick');
    expect(quick).toBeDefined();
    expect(quick!.providers).toContain('groq');
    expect(quick!.reviewerCount).toBe(1);
    expect(quick!.discussion).toBe(false);
  });

  it('generates a "free" preset when a free provider is detected', () => {
    const env = makeEnv([{ name: 'groq', available: true }]);
    const presets = generatePresets(env, null);
    const free = presets.find((p) => p.id === 'free');
    expect(free).toBeDefined();
    expect(free!.providers).toContain('groq');
  });

  it('does NOT generate "free" preset when only paid provider is detected', () => {
    const env = makeEnv([{ name: 'openai', available: true }]);
    const presets = generatePresets(env, null);
    const free = presets.find((p) => p.id === 'free');
    expect(free).toBeUndefined();
  });

  it('generates "thorough" preset with multiple providers when 2+ detected', () => {
    const env = makeEnv([
      { name: 'groq', available: true },
      { name: 'anthropic', available: true },
    ]);
    const presets = generatePresets(env, null);
    const thorough = presets.find((p) => p.id === 'thorough');
    expect(thorough).toBeDefined();
    expect(thorough!.providers.length).toBeGreaterThanOrEqual(2);
    expect(thorough!.discussion).toBe(true);
  });

  it('generates "thorough" preset with single provider when only 1 detected', () => {
    const env = makeEnv([{ name: 'anthropic', available: true }]);
    const presets = generatePresets(env, null);
    const thorough = presets.find((p) => p.id === 'thorough');
    expect(thorough).toBeDefined();
    expect(thorough!.reviewerCount).toBe(3);
  });

  it('caps thorough preset providers at 4', () => {
    const env = makeEnv([
      { name: 'groq', available: true },
      { name: 'anthropic', available: true },
      { name: 'openai', available: true },
      { name: 'google', available: true },
      { name: 'mistral', available: true },
    ]);
    const presets = generatePresets(env, null);
    const thorough = presets.find((p) => p.id === 'thorough');
    expect(thorough).toBeDefined();
    expect(thorough!.providers.length).toBeLessThanOrEqual(4);
  });

  it('generates a "cli" preset when CLI backends are available', () => {
    const env = makeEnv([]);
    const cli = [makeCli('claude', true), makeCli('codex', true)];
    const presets = generatePresets(env, null, cli);
    const cliPreset = presets.find((p) => p.id === 'cli');
    expect(cliPreset).toBeDefined();
    expect(cliPreset!.backend).toBe('cli');
  });

  it('does NOT generate "cli" preset when no CLI backends available', () => {
    const env = makeEnv([{ name: 'groq', available: true }]);
    const presets = generatePresets(env, null, []);
    const cliPreset = presets.find((p) => p.id === 'cli');
    expect(cliPreset).toBeUndefined();
  });

  it('uses default model when catalog is null', () => {
    const env = makeEnv([{ name: 'groq', available: true }]);
    const presets = generatePresets(env, null);
    const quick = presets.find((p) => p.id === 'quick');
    expect(quick).toBeDefined();
    expect(quick!.models['groq']).toBe('llama-3.3-70b-versatile');
  });

  it('includes label with provider name for quick preset', () => {
    const env = makeEnv([{ name: 'anthropic', available: true }]);
    const presets = generatePresets(env, null);
    const quick = presets.find((p) => p.id === 'quick');
    expect(quick!.label).toContain('anthropic');
  });
});

describe('resolvePresetAlias()', () => {
  it('maps legacy aliases to canonical presets', () => {
    for (const { alias, target } of PRESET_ALIAS_ENTRIES) {
      expect(resolvePresetAlias(alias)).toBe(target);
    }
  });

  it('returns provided preset name when no alias applies', () => {
    expect(resolvePresetAlias('thorough')).toBe('thorough');
    expect(resolvePresetAlias('free')).toBe('free');
    expect(resolvePresetAlias('quick')).toBe('quick');
  });

  it('trims and normalizes case', () => {
    expect(resolvePresetAlias('  BuDGeT  ')).toBe('quick');
    expect(resolvePresetAlias('  QUICK  ')).toBe('quick');
  });

  it('returns undefined for empty input', () => {
    expect(resolvePresetAlias(undefined)).toBeUndefined();
    expect(resolvePresetAlias('   ')).toBeUndefined();
  });
});
