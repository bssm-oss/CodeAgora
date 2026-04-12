/**
 * Plugin System Tests — registry, loader, validation, sandbox
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PluginRegistry,
  getPluginRegistry,
  resetPluginRegistry,
  validatePlugin,
  loadPlugins,
  filterEnabled,
  sandboxExec,
  sandboxHook,
  sandboxBackend,
} from '../plugins/index.js';
import type { Plugin, HookPlugin, BackendPlugin } from '../plugins/index.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeHookPlugin(overrides: Partial<HookPlugin> = {}): HookPlugin {
  return {
    name: 'test-hook',
    version: '1.0.0',
    type: 'hook',
    hooks: {},
    ...overrides,
  };
}

function makeBackendPlugin(overrides: Partial<BackendPlugin> = {}): BackendPlugin {
  return {
    name: 'test-backend',
    version: '1.0.0',
    type: 'backend',
    execute: async () => 'response',
    ...overrides,
  };
}

function makeProviderPlugin(name = 'test-provider'): Plugin {
  return {
    name,
    version: '1.0.0',
    type: 'provider',
    apiKeyEnvVar: 'TEST_API_KEY',
    createProvider: () => ({}),
    isAvailable: () => true,
  } as Plugin;
}

// ============================================================================
// Registry
// ============================================================================

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it('should register and retrieve a plugin', () => {
    const plugin = makeProviderPlugin();
    registry.register(plugin);

    expect(registry.has('test-provider')).toBe(true);
    expect(registry.get('test-provider')).toBe(plugin);
  });

  it('should throw on duplicate registration', () => {
    registry.register(makeProviderPlugin());

    expect(() => registry.register(makeProviderPlugin())).toThrow(
      'Plugin "test-provider" is already registered',
    );
  });

  it('should throw on invalid type', () => {
    const plugin = { name: 'bad', version: '1.0.0', type: 'invalid' } as unknown as Plugin;

    expect(() => registry.register(plugin)).toThrow('invalid type');
  });

  it('should unregister a plugin', () => {
    registry.register(makeProviderPlugin());
    expect(registry.unregister('test-provider')).toBe(true);
    expect(registry.has('test-provider')).toBe(false);
  });

  it('should return false for unregistering nonexistent plugin', () => {
    expect(registry.unregister('nope')).toBe(false);
  });

  it('should list all plugins', () => {
    registry.register(makeProviderPlugin('a'));
    registry.register(makeProviderPlugin('b'));

    expect(registry.list()).toHaveLength(2);
  });

  it('should filter by type', () => {
    registry.register(makeProviderPlugin());
    registry.register(makeHookPlugin());

    expect(registry.getByType('provider')).toHaveLength(1);
    expect(registry.getByType('hook')).toHaveLength(1);
    expect(registry.getByType('backend')).toHaveLength(0);
  });

  it('should clear all plugins', () => {
    registry.register(makeProviderPlugin());
    registry.clear();

    expect(registry.list()).toHaveLength(0);
  });
});

describe('Singleton registry', () => {
  beforeEach(() => {
    resetPluginRegistry();
  });

  it('should return the same instance', () => {
    const a = getPluginRegistry();
    const b = getPluginRegistry();
    expect(a).toBe(b);
  });

  it('should create new instance after reset', () => {
    const a = getPluginRegistry();
    resetPluginRegistry();
    const b = getPluginRegistry();
    expect(a).not.toBe(b);
  });
});

// ============================================================================
// Validation
// ============================================================================

describe('validatePlugin', () => {
  it('should accept valid provider plugin', () => {
    expect(validatePlugin(makeProviderPlugin())).toBe(true);
  });

  it('should accept valid hook plugin', () => {
    expect(validatePlugin(makeHookPlugin())).toBe(true);
  });

  it('should accept valid backend plugin', () => {
    expect(validatePlugin(makeBackendPlugin())).toBe(true);
  });

  it('should reject null', () => {
    expect(validatePlugin(null)).toBe(false);
  });

  it('should reject missing name', () => {
    expect(validatePlugin({ version: '1.0.0', type: 'hook', hooks: {} })).toBe(false);
  });

  it('should reject empty name', () => {
    expect(validatePlugin({ name: '', version: '1.0.0', type: 'hook', hooks: {} })).toBe(false);
  });

  it('should reject invalid type', () => {
    expect(validatePlugin({ name: 'x', version: '1.0.0', type: 'unknown', hooks: {} })).toBe(false);
  });

  it('should reject provider without createProvider', () => {
    expect(validatePlugin({
      name: 'x', version: '1.0.0', type: 'provider',
      apiKeyEnvVar: 'KEY', isAvailable: () => true,
    })).toBe(false);
  });

  it('should reject backend without execute', () => {
    expect(validatePlugin({ name: 'x', version: '1.0.0', type: 'backend' })).toBe(false);
  });

  it('should reject output without format', () => {
    expect(validatePlugin({ name: 'x', version: '1.0.0', type: 'output' })).toBe(false);
  });
});

// ============================================================================
// Loader
// ============================================================================

describe('loadPlugins', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it('should load valid plugins', () => {
    const result = loadPlugins([makeProviderPlugin(), makeHookPlugin()], registry);

    expect(result.loaded).toEqual(['test-provider', 'test-hook']);
    expect(result.failed).toHaveLength(0);
  });

  it('should report invalid plugins as failed', () => {
    const invalid = { name: 'bad' } as unknown as Plugin;
    const result = loadPlugins([invalid], registry);

    expect(result.loaded).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].name).toBe('bad');
  });

  it('should report duplicate as failed', () => {
    const result = loadPlugins(
      [makeProviderPlugin(), makeProviderPlugin()],
      registry,
    );

    expect(result.loaded).toEqual(['test-provider']);
    expect(result.failed).toHaveLength(1);
  });

  it('should handle empty array', () => {
    const result = loadPlugins([], registry);
    expect(result.loaded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });
});

describe('filterEnabled', () => {
  it('should filter by enabled names', () => {
    const plugins = [makeProviderPlugin('a'), makeProviderPlugin('b'), makeProviderPlugin('c')];
    const result = filterEnabled(plugins, ['a', 'c']);

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.name)).toEqual(['a', 'c']);
  });

  it('should return empty for no matches', () => {
    const plugins = [makeProviderPlugin('a')];
    expect(filterEnabled(plugins, ['b'])).toHaveLength(0);
  });
});

// ============================================================================
// Sandbox
// ============================================================================

describe('sandboxExec', () => {
  it('should return success for resolved promise', async () => {
    const result = await sandboxExec(async () => 42);

    expect(result.success).toBe(true);
    expect(result.value).toBe(42);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should catch thrown errors', async () => {
    const result = await sandboxExec(async () => {
      throw new Error('boom');
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('should timeout slow functions', async () => {
    const result = await sandboxExec(
      () => new Promise((resolve) => setTimeout(resolve, 5000)),
      50, // 50ms timeout
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });
});

describe('sandboxHook', () => {
  it('should execute a hook successfully', async () => {
    let called = false;
    const plugin = makeHookPlugin({
      hooks: {
        'pre-review': async () => { called = true; },
      },
    });

    const result = await sandboxHook(plugin, 'pre-review', {});
    expect(result.success).toBe(true);
    expect(called).toBe(true);
  });

  it('should return success for missing hook (no-op)', async () => {
    const plugin = makeHookPlugin({ hooks: {} });
    const result = await sandboxHook(plugin, 'pre-review', {});

    expect(result.success).toBe(true);
    expect(result.durationMs).toBe(0);
  });

  it('should catch hook errors', async () => {
    const plugin = makeHookPlugin({
      hooks: {
        'pre-review': async () => { throw new Error('hook failed'); },
      },
    });

    const result = await sandboxHook(plugin, 'pre-review', {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('hook failed');
  });
});

describe('sandboxBackend', () => {
  it('should execute backend successfully', async () => {
    const plugin = makeBackendPlugin({
      execute: async (input) => `result for ${input.model}`,
    });

    const result = await sandboxBackend(plugin, { prompt: 'test', model: 'gpt-4' });
    expect(result.success).toBe(true);
    expect(result.value).toBe('result for gpt-4');
  });

  it('should catch backend errors', async () => {
    const plugin = makeBackendPlugin({
      execute: async () => { throw new Error('backend crash'); },
    });

    const result = await sandboxBackend(plugin, { prompt: 'test', model: 'gpt-4' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('backend crash');
  });

  it('should timeout slow backends', async () => {
    const plugin = makeBackendPlugin({
      execute: () => new Promise((resolve) => setTimeout(() => resolve('late'), 5000)),
    });

    const result = await sandboxBackend(plugin, { prompt: 'test', model: 'gpt-4' }, 50);
    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });
});
