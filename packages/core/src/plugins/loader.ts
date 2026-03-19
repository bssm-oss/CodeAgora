/**
 * Plugin Loader
 * Validates and loads plugin objects into a registry.
 */

import type { Plugin, PluginType } from './types.js';
import type { PluginRegistry } from './registry.js';

// ============================================================================
// Types
// ============================================================================

export interface LoadResult {
  loaded: string[];
  failed: Array<{ name: string; error: string }>;
}

// ============================================================================
// Validation
// ============================================================================

const VALID_TYPES: PluginType[] = ['provider', 'backend', 'output', 'hook'];

export function validatePlugin(plugin: unknown): plugin is Plugin {
  if (typeof plugin !== 'object' || plugin === null) return false;

  const p = plugin as Record<string, unknown>;

  if (typeof p['name'] !== 'string' || p['name'].length === 0) return false;
  if (typeof p['version'] !== 'string' || p['version'].length === 0) return false;
  if (!VALID_TYPES.includes(p['type'] as PluginType)) return false;

  const type = p['type'] as PluginType;

  switch (type) {
    case 'provider':
      return (
        typeof p['apiKeyEnvVar'] === 'string' &&
        typeof p['createProvider'] === 'function' &&
        typeof p['isAvailable'] === 'function'
      );
    case 'backend':
      return typeof p['execute'] === 'function';
    case 'output':
      return typeof p['format'] === 'function';
    case 'hook':
      return typeof p['hooks'] === 'object' && p['hooks'] !== null;
    default:
      return false;
  }
}

// ============================================================================
// Loader
// ============================================================================

export function loadPlugins(plugins: Plugin[], registry: PluginRegistry): LoadResult {
  const result: LoadResult = { loaded: [], failed: [] };

  for (const plugin of plugins) {
    if (!validatePlugin(plugin)) {
      const name = typeof (plugin as Record<string, unknown>)['name'] === 'string'
        ? (plugin as Record<string, unknown>)['name'] as string
        : '<unknown>';
      result.failed.push({ name, error: 'Plugin failed validation' });
      continue;
    }

    try {
      registry.register(plugin);
      result.loaded.push(plugin.name);
    } catch (e) {
      result.failed.push({
        name: plugin.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}

// ============================================================================
// Filter
// ============================================================================

export function filterEnabled(plugins: Plugin[], enabledNames: string[]): Plugin[] {
  const nameSet = new Set(enabledNames);
  return plugins.filter((p) => nameSet.has(p.name));
}
