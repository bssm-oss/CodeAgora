/**
 * Prompt tier resolver tests (#464)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolvePromptTier } from '../l1/prompt-tier.js';
import { setRegistry } from '../l0/model-registry.js';
import type { AgentConfig } from '../types/config.js';
import type { ModelMetadata } from '../types/l0.js';

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'r1',
    model: 'some-model',
    backend: 'api',
    provider: 'openrouter',
    timeout: 120,
    enabled: true,
    ...overrides,
  } as AgentConfig;
}

function makeMeta(tier: ModelMetadata['tier']): ModelMetadata {
  return {
    source: 'openrouter',
    modelId: 'some-model',
    name: 'Some Model',
    tier,
    context: '128k',
    family: 'openai',
    isReasoning: false,
  };
}

let savedRegistry: Map<string, ModelMetadata> | null = null;

beforeEach(() => {
  savedRegistry = null;
});

afterEach(() => {
  // Reset to empty registry so each test's state is isolated.
  setRegistry(new Map());
});

describe('resolvePromptTier', () => {
  it('explicit config.promptTier overrides auto-detection', () => {
    // Register as S+ (would normally auto-resolve to 'standard'), but config
    // overrides to 'lite'.
    const map = new Map();
    map.set('openrouter/some-model', makeMeta('S+'));
    setRegistry(map);

    expect(resolvePromptTier(makeConfig({ promptTier: 'lite' }))).toBe('lite');
    expect(resolvePromptTier(makeConfig({ promptTier: 'standard' }))).toBe('standard');
  });

  it('maps S+/S/A+/A/A- to standard', () => {
    const strongTiers: ModelMetadata['tier'][] = ['S+', 'S', 'A+', 'A', 'A-'];
    for (const tier of strongTiers) {
      const map = new Map();
      map.set('openrouter/some-model', makeMeta(tier));
      setRegistry(map);
      expect(resolvePromptTier(makeConfig())).toBe('standard');
    }
  });

  it('maps B+/B/C to lite', () => {
    const weakTiers: ModelMetadata['tier'][] = ['B+', 'B', 'C'];
    for (const tier of weakTiers) {
      const map = new Map();
      map.set('openrouter/some-model', makeMeta(tier));
      setRegistry(map);
      expect(resolvePromptTier(makeConfig())).toBe('lite');
    }
  });

  it('maps unknown tier (registry hit but no tier field) to lite', () => {
    const meta = makeMeta('S+');
    delete (meta as Partial<ModelMetadata>).tier;
    const map = new Map();
    map.set('openrouter/some-model', meta);
    setRegistry(map);
    expect(resolvePromptTier(makeConfig())).toBe('lite');
  });

  it('returns lite when model is not in the registry at all', () => {
    // Empty registry set in afterEach; no entry for 'some-model'
    expect(resolvePromptTier(makeConfig())).toBe('lite');
  });

  it('returns standard when provider is undefined (CLI backend)', () => {
    // CLI backends (claude / codex / gemini) have no provider — we cannot
    // look them up in the registry, so assume standard (these are typically
    // frontier subscriptions).
    const config: AgentConfig = {
      id: 'r1',
      model: 'claude-sonnet',
      backend: 'claude',
      timeout: 120,
      enabled: true,
    };
    expect(resolvePromptTier(config)).toBe('standard');
  });

  it('returns standard on explicit config override even without registry', () => {
    expect(
      resolvePromptTier(makeConfig({ promptTier: 'standard' })),
    ).toBe('standard');
  });
});

// Silence unused-variable warning — kept for potential future use.
void savedRegistry;
