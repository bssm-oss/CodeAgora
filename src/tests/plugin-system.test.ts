/**
 * Plugin System Tests
 * Covers PluginRegistry, validatePlugin, loadPlugins, filterEnabled.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry } from '@codeagora/core/plugins/registry.js';
import { validatePlugin, loadPlugins, filterEnabled } from '@codeagora/core/plugins/loader.js';
import type {
  ProviderPlugin,
  BackendPlugin,
  OutputPlugin,
  HookPlugin,
  Plugin,
} from '@codeagora/core/plugins/types.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeProvider(name = 'my-provider'): ProviderPlugin {
  return {
    name,
    version: '1.0.0',
    type: 'provider',
    apiKeyEnvVar: 'MY_API_KEY',
    createProvider: (_apiKey: string) => ({}),
    isAvailable: () => false,
  };
}

function makeBackend(name = 'my-backend'): BackendPlugin {
  return {
    name,
    version: '1.0.0',
    type: 'backend',
    execute: async (_input) => 'result',
  };
}

function makeOutput(name = 'my-output'): OutputPlugin {
  return {
    name,
    version: '1.0.0',
    type: 'output',
    format: async (_result) => 'formatted',
  };
}

function makeHook(name = 'my-hook'): HookPlugin {
  return {
    name,
    version: '1.0.0',
    type: 'hook',
    hooks: {
      'pre-review': async (_ctx) => {},
    },
  };
}

// ============================================================================
// PluginRegistry
// ============================================================================

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it('register → success', () => {
    const p = makeProvider();
    registry.register(p);
    expect(registry.has(p.name)).toBe(true);
  });

  it('register duplicate name → throws', () => {
    const p = makeProvider();
    registry.register(p);
    expect(() => registry.register(makeProvider())).toThrow(
      `Plugin "${p.name}" is already registered`,
    );
  });

  it('unregister existing → returns true', () => {
    const p = makeProvider();
    registry.register(p);
    expect(registry.unregister(p.name)).toBe(true);
    expect(registry.has(p.name)).toBe(false);
  });

  it('unregister non-existent → returns false', () => {
    expect(registry.unregister('ghost')).toBe(false);
  });

  it('get existing → returns plugin', () => {
    const p = makeBackend();
    registry.register(p);
    expect(registry.get(p.name)).toBe(p);
  });

  it('get non-existent → returns undefined', () => {
    expect(registry.get('nope')).toBeUndefined();
  });

  it('getByType → returns only matching type', () => {
    registry.register(makeProvider('p1'));
    registry.register(makeBackend('b1'));
    registry.register(makeBackend('b2'));
    registry.register(makeOutput('o1'));

    const backends = registry.getByType('backend');
    expect(backends).toHaveLength(2);
    expect(backends.every((x) => x.type === 'backend')).toBe(true);

    const providers = registry.getByType('provider');
    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe('p1');
  });

  it('getByType with no matches → returns empty array', () => {
    registry.register(makeProvider());
    expect(registry.getByType('hook')).toHaveLength(0);
  });

  it('list → returns all plugins', () => {
    registry.register(makeProvider('p1'));
    registry.register(makeBackend('b1'));
    registry.register(makeHook('h1'));
    expect(registry.list()).toHaveLength(3);
  });

  it('clear → empties registry', () => {
    registry.register(makeProvider('p1'));
    registry.register(makeBackend('b1'));
    registry.clear();
    expect(registry.list()).toHaveLength(0);
  });
});

// ============================================================================
// validatePlugin
// ============================================================================

describe('validatePlugin', () => {
  it('valid ProviderPlugin → true', () => {
    expect(validatePlugin(makeProvider())).toBe(true);
  });

  it('valid BackendPlugin → true', () => {
    expect(validatePlugin(makeBackend())).toBe(true);
  });

  it('valid OutputPlugin → true', () => {
    expect(validatePlugin(makeOutput())).toBe(true);
  });

  it('valid HookPlugin → true', () => {
    expect(validatePlugin(makeHook())).toBe(true);
  });

  it('missing name → false', () => {
    const p = { ...makeProvider(), name: '' };
    expect(validatePlugin(p)).toBe(false);
  });

  it('missing version → false', () => {
    const p = { ...makeProvider(), version: '' };
    expect(validatePlugin(p)).toBe(false);
  });

  it('invalid type → false', () => {
    const p = { ...makeProvider(), type: 'unknown' as Plugin['type'] };
    expect(validatePlugin(p)).toBe(false);
  });

  it('empty object → false', () => {
    expect(validatePlugin({})).toBe(false);
  });

  it('null → false', () => {
    expect(validatePlugin(null)).toBe(false);
  });

  it('ProviderPlugin missing createProvider → false', () => {
    const p = { ...makeProvider() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (p as any).createProvider;
    expect(validatePlugin(p)).toBe(false);
  });

  it('BackendPlugin missing execute → false', () => {
    const p = { ...makeBackend() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (p as any).execute;
    expect(validatePlugin(p)).toBe(false);
  });

  it('OutputPlugin missing format → false', () => {
    const p = { ...makeOutput() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (p as any).format;
    expect(validatePlugin(p)).toBe(false);
  });

  it('HookPlugin missing hooks → false', () => {
    const p = { ...makeHook() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (p as any).hooks;
    expect(validatePlugin(p)).toBe(false);
  });
});

// ============================================================================
// loadPlugins
// ============================================================================

describe('loadPlugins', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it('all valid → all loaded', () => {
    const plugins: Plugin[] = [makeProvider('p1'), makeBackend('b1'), makeOutput('o1')];
    const result = loadPlugins(plugins, registry);
    expect(result.loaded).toEqual(['p1', 'b1', 'o1']);
    expect(result.failed).toHaveLength(0);
  });

  it('some invalid → valid loaded, invalid in failed', () => {
    const invalid = { name: 'bad', version: '1.0.0', type: 'provider' } as unknown as Plugin;
    const valid = makeBackend('b1');
    const result = loadPlugins([invalid, valid], registry);
    expect(result.loaded).toEqual(['b1']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].name).toBe('bad');
  });

  it('duplicate plugin → first loaded, second in failed', () => {
    const p1 = makeProvider('dup');
    const p2 = makeProvider('dup');
    const result = loadPlugins([p1, p2], registry);
    expect(result.loaded).toEqual(['dup']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].name).toBe('dup');
  });

  it('empty array → empty result', () => {
    const result = loadPlugins([], registry);
    expect(result.loaded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });
});

// ============================================================================
// filterEnabled
// ============================================================================

describe('filterEnabled', () => {
  const plugins: Plugin[] = [
    makeProvider('p1'),
    makeBackend('b1'),
    makeOutput('o1'),
    makeHook('h1'),
  ];

  it('returns only plugins in enabledNames', () => {
    const result = filterEnabled(plugins, ['p1', 'o1']);
    expect(result.map((p) => p.name)).toEqual(['p1', 'o1']);
  });

  it('unknown names are ignored', () => {
    const result = filterEnabled(plugins, ['p1', 'ghost']);
    expect(result.map((p) => p.name)).toEqual(['p1']);
  });

  it('empty enabledNames → empty result', () => {
    expect(filterEnabled(plugins, [])).toHaveLength(0);
  });

  it('all names enabled → all returned', () => {
    const result = filterEnabled(plugins, ['p1', 'b1', 'o1', 'h1']);
    expect(result).toHaveLength(4);
  });
});
