/**
 * Plugin Provider Tests
 * Covers createBuiltinProviderPlugin, getBuiltinProviderPlugins, and ProviderPluginManager.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createBuiltinProviderPlugin, getBuiltinProviderPlugins } from '@codeagora/core/plugins/builtin-providers.js';
import { ProviderPluginManager } from '@codeagora/core/plugins/provider-manager.js';
import { PluginRegistry } from '@codeagora/core/plugins/registry.js';
import type { ProviderPlugin } from '@codeagora/core/plugins/types.js';

// Mock SDK packages used inside builtin-providers factory functions
vi.mock('@ai-sdk/groq', () => ({
  createGroq: vi.fn((opts: { apiKey: string }) => {
    return (modelId: string) => ({ modelId, provider: 'groq', apiKey: opts.apiKey });
  }),
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn((opts: { name: string; baseURL: string; apiKey: string }) => {
    return (modelId: string) => ({ modelId, provider: opts.name, apiKey: opts.apiKey });
  }),
}));

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn((opts: { apiKey: string }) => {
    return (modelId: string) => ({ modelId, provider: 'openrouter', apiKey: opts.apiKey });
  }),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn((opts: { apiKey: string }) => {
    return (modelId: string) => ({ modelId, provider: 'google', apiKey: opts.apiKey });
  }),
}));

// ============================================================================
// createBuiltinProviderPlugin
// ============================================================================

describe('createBuiltinProviderPlugin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns correct ProviderPlugin structure', () => {
    const factory = vi.fn(() => ({}));
    const plugin = createBuiltinProviderPlugin('test-provider', 'TEST_API_KEY', factory);

    expect(plugin.name).toBe('test-provider');
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.type).toBe('provider');
    expect(plugin.apiKeyEnvVar).toBe('TEST_API_KEY');
    expect(typeof plugin.createProvider).toBe('function');
    expect(typeof plugin.isAvailable).toBe('function');
  });

  it('isAvailable returns false when API key env var is not set', () => {
    delete process.env['TEST_API_KEY'];
    const plugin = createBuiltinProviderPlugin('test-provider', 'TEST_API_KEY', vi.fn());
    expect(plugin.isAvailable()).toBe(false);
  });

  it('isAvailable returns true when API key env var is set', () => {
    vi.stubEnv('TEST_API_KEY', 'some-key');
    const plugin = createBuiltinProviderPlugin('test-provider', 'TEST_API_KEY', vi.fn());
    expect(plugin.isAvailable()).toBe(true);
  });

  it('createProvider calls factory with the provided API key', () => {
    const factory = vi.fn(() => ({ instance: true }));
    const plugin = createBuiltinProviderPlugin('test-provider', 'TEST_API_KEY', factory);
    const result = plugin.createProvider('my-key');
    expect(factory).toHaveBeenCalledWith('my-key');
    expect(result).toEqual({ instance: true });
  });
});

// ============================================================================
// getBuiltinProviderPlugins
// ============================================================================

describe('getBuiltinProviderPlugins', () => {
  it('returns exactly 8 plugins', () => {
    const plugins = getBuiltinProviderPlugins();
    expect(plugins).toHaveLength(8);
  });

  it('all plugins have type "provider"', () => {
    const plugins = getBuiltinProviderPlugins();
    for (const p of plugins) {
      expect(p.type).toBe('provider');
    }
  });

  it('all plugins have non-empty name and apiKeyEnvVar', () => {
    const plugins = getBuiltinProviderPlugins();
    for (const p of plugins) {
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
      expect(typeof p.apiKeyEnvVar).toBe('string');
      expect(p.apiKeyEnvVar.length).toBeGreaterThan(0);
    }
  });

  it('includes groq with GROQ_API_KEY', () => {
    const plugins = getBuiltinProviderPlugins();
    const groq = plugins.find((p) => p.name === 'groq');
    expect(groq).toBeDefined();
    expect(groq!.apiKeyEnvVar).toBe('GROQ_API_KEY');
  });

  it('includes nvidia-nim with NVIDIA_API_KEY', () => {
    const plugins = getBuiltinProviderPlugins();
    const p = plugins.find((x) => x.name === 'nvidia-nim');
    expect(p).toBeDefined();
    expect(p!.apiKeyEnvVar).toBe('NVIDIA_API_KEY');
  });

  it('includes openrouter with OPENROUTER_API_KEY', () => {
    const plugins = getBuiltinProviderPlugins();
    const p = plugins.find((x) => x.name === 'openrouter');
    expect(p).toBeDefined();
    expect(p!.apiKeyEnvVar).toBe('OPENROUTER_API_KEY');
  });

  it('includes google with GOOGLE_API_KEY', () => {
    const plugins = getBuiltinProviderPlugins();
    const p = plugins.find((x) => x.name === 'google');
    expect(p).toBeDefined();
    expect(p!.apiKeyEnvVar).toBe('GOOGLE_API_KEY');
  });

  it('includes mistral with MISTRAL_API_KEY', () => {
    const plugins = getBuiltinProviderPlugins();
    const p = plugins.find((x) => x.name === 'mistral');
    expect(p).toBeDefined();
    expect(p!.apiKeyEnvVar).toBe('MISTRAL_API_KEY');
  });

  it('includes cerebras with CEREBRAS_API_KEY', () => {
    const plugins = getBuiltinProviderPlugins();
    const p = plugins.find((x) => x.name === 'cerebras');
    expect(p).toBeDefined();
    expect(p!.apiKeyEnvVar).toBe('CEREBRAS_API_KEY');
  });

  it('includes together with TOGETHER_API_KEY', () => {
    const plugins = getBuiltinProviderPlugins();
    const p = plugins.find((x) => x.name === 'together');
    expect(p).toBeDefined();
    expect(p!.apiKeyEnvVar).toBe('TOGETHER_API_KEY');
  });

  it('includes xai with XAI_API_KEY', () => {
    const plugins = getBuiltinProviderPlugins();
    const p = plugins.find((x) => x.name === 'xai');
    expect(p).toBeDefined();
    expect(p!.apiKeyEnvVar).toBe('XAI_API_KEY');
  });
});

// ============================================================================
// ProviderPluginManager
// ============================================================================

describe('ProviderPluginManager', () => {
  let registry: PluginRegistry;
  let manager: ProviderPluginManager;

  function makePlugin(
    name: string,
    envVar: string,
    factory?: (apiKey: string) => unknown,
  ): ProviderPlugin {
    return {
      name,
      version: '1.0.0',
      type: 'provider',
      apiKeyEnvVar: envVar,
      createProvider: factory ?? ((key) => ({ provider: name, key })),
      isAvailable: () => !!process.env[envVar],
    };
  }

  beforeEach(() => {
    registry = new PluginRegistry();
    manager = new ProviderPluginManager(registry);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('getProvider returns provider instance when API key is set', () => {
    vi.stubEnv('MY_KEY', 'abc123');
    registry.register(makePlugin('my-provider', 'MY_KEY'));
    const instance = manager.getProvider('my-provider');
    expect(instance).toBeDefined();
    expect((instance as { provider: string }).provider).toBe('my-provider');
  });

  it('getProvider throws when API key is missing', () => {
    delete process.env['MY_KEY'];
    registry.register(makePlugin('my-provider', 'MY_KEY'));
    expect(() => manager.getProvider('my-provider')).toThrow(/MY_KEY/);
  });

  it('getProvider throws for unknown provider name', () => {
    expect(() => manager.getProvider('nonexistent')).toThrow(/Unknown provider plugin/);
  });

  it('getProvider caches: factory called only once on repeated calls', () => {
    vi.stubEnv('MY_KEY', 'abc123');
    const factory = vi.fn((key: string) => ({ provider: 'my-provider', key }));
    registry.register(makePlugin('my-provider', 'MY_KEY', factory));

    manager.getProvider('my-provider');
    manager.getProvider('my-provider');

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('clearCache causes factory to be called again', () => {
    vi.stubEnv('MY_KEY', 'abc123');
    const factory = vi.fn((key: string) => ({ provider: 'my-provider', key }));
    registry.register(makePlugin('my-provider', 'MY_KEY', factory));

    manager.getProvider('my-provider');
    manager.clearCache();
    manager.getProvider('my-provider');

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('isAvailable returns true when plugin registered and key present', () => {
    vi.stubEnv('MY_KEY', 'abc123');
    registry.register(makePlugin('my-provider', 'MY_KEY'));
    expect(manager.isAvailable('my-provider')).toBe(true);
  });

  it('isAvailable returns false when key missing', () => {
    delete process.env['MY_KEY'];
    registry.register(makePlugin('my-provider', 'MY_KEY'));
    expect(manager.isAvailable('my-provider')).toBe(false);
  });

  it('isAvailable returns false when plugin not registered', () => {
    expect(manager.isAvailable('ghost')).toBe(false);
  });

  it('listAvailable returns entry for each registered provider plugin', () => {
    vi.stubEnv('KEY_A', 'val');
    delete process.env['KEY_B'];
    registry.register(makePlugin('provider-a', 'KEY_A'));
    registry.register(makePlugin('provider-b', 'KEY_B'));

    const list = manager.listAvailable();
    expect(list).toHaveLength(2);

    const a = list.find((x) => x.name === 'provider-a');
    const b = list.find((x) => x.name === 'provider-b');
    expect(a).toBeDefined();
    expect(a!.hasApiKey).toBe(true);
    expect(b).toBeDefined();
    expect(b!.hasApiKey).toBe(false);
  });

  it('listAvailable returns empty array when no provider plugins registered', () => {
    expect(manager.listAvailable()).toHaveLength(0);
  });
});
