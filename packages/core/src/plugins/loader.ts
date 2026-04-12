/**
 * Plugin Loader — validates and loads plugins from filesystem paths.
 * Supports:
 * - Built-in plugins (passed directly)
 * - Third-party plugins via dynamic import from .ca/plugins/ or absolute paths
 */

import fs from 'fs/promises';
import path from 'path';
import { validateDiffPath } from '@codeagora/shared/utils/path-validation.js';
import type { Plugin, PluginManifest, LoadResult, PluginType } from './types.js';
import type { PluginRegistry } from './registry.js';

const VALID_TYPES: PluginType[] = ['provider', 'backend', 'output', 'hook'];

// ============================================================================
// Validation
// ============================================================================

/** Structural validation of a plugin object. */
export function validatePlugin(plugin: unknown): plugin is Plugin {
  if (typeof plugin !== 'object' || plugin === null) return false;
  const p = plugin as Record<string, unknown>;
  if (typeof p['name'] !== 'string' || (p['name'] as string).length === 0) return false;
  if (typeof p['version'] !== 'string' || (p['version'] as string).length === 0) return false;
  if (!VALID_TYPES.includes(p['type'] as PluginType)) return false;

  switch (p['type']) {
    case 'provider':
      return typeof p['apiKeyEnvVar'] === 'string'
        && typeof p['createProvider'] === 'function'
        && typeof p['isAvailable'] === 'function';
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
// Loading
// ============================================================================

/** Load an array of already-constructed plugin objects into the registry. */
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

/** Filter plugins by a list of enabled names. */
export function filterEnabled(plugins: Plugin[], enabledNames: string[]): Plugin[] {
  const nameSet = new Set(enabledNames);
  return plugins.filter((p) => nameSet.has(p.name));
}

// ============================================================================
// Third-Party Loading (Dynamic Import)
// ============================================================================

/** Default plugin directory relative to project root. */
const PLUGIN_DIR = path.join('.ca', 'plugins');

/**
 * Discover and load third-party plugins from a directory.
 * Each plugin must be a directory containing a package.json with:
 *   { name, version, codeagora: { type, main } }
 * or a codeagora-plugin.json manifest file.
 *
 * Plugins are loaded via dynamic import() and validated before registration.
 * Invalid plugins are reported in the failed array, never crash the pipeline.
 */
export async function loadThirdPartyPlugins(
  registry: PluginRegistry,
  pluginDir?: string,
): Promise<LoadResult> {
  const dir = pluginDir ?? PLUGIN_DIR;
  const result: LoadResult = { loaded: [], failed: [] };

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    // Plugin directory doesn't exist — not an error, just no third-party plugins
    return result;
  }

  for (const entry of entries) {
    const pluginPath = path.join(dir, entry);

    // Security: validate path is within allowed directory
    const validation = validateDiffPath(pluginPath, {
      allowedRoots: [path.resolve(dir)],
    });
    if (!validation.success) {
      result.failed.push({ name: entry, error: 'Path traversal blocked' });
      continue;
    }

    try {
      const stat = await fs.stat(pluginPath);
      if (!stat.isDirectory()) continue;

      // Try to read manifest
      const manifest = await readPluginManifest(pluginPath);
      if (!manifest) {
        result.failed.push({ name: entry, error: 'No valid manifest found' });
        continue;
      }

      // Dynamic import of the plugin's main module
      const mainPath = path.resolve(pluginPath, manifest.main);
      const mod = await import(mainPath);
      const plugin: unknown = mod.default ?? mod.plugin ?? mod;

      if (!validatePlugin(plugin)) {
        result.failed.push({ name: manifest.name, error: 'Plugin export failed validation' });
        continue;
      }

      registry.register(plugin as Plugin);
      result.loaded.push(manifest.name);
    } catch (e) {
      result.failed.push({
        name: entry,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}

/** Read plugin manifest from package.json or codeagora-plugin.json. */
async function readPluginManifest(pluginDir: string): Promise<PluginManifest | null> {
  // Try codeagora-plugin.json first
  try {
    const raw = await fs.readFile(path.join(pluginDir, 'codeagora-plugin.json'), 'utf-8');
    const json = JSON.parse(raw) as Record<string, unknown>;
    if (isValidManifest(json)) return json as unknown as PluginManifest;
  } catch { /* try package.json */ }

  // Try package.json with codeagora field
  try {
    const raw = await fs.readFile(path.join(pluginDir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const ca = pkg['codeagora'] as Record<string, unknown> | undefined;
    if (ca && typeof ca === 'object') {
      const manifest = {
        name: pkg['name'] as string,
        version: pkg['version'] as string,
        type: ca['type'] as PluginType,
        main: (ca['main'] as string) ?? (pkg['main'] as string) ?? 'index.js',
      };
      if (isValidManifest(manifest)) return manifest;
    }
  } catch { /* no manifest found */ }

  return null;
}

function isValidManifest(obj: Record<string, unknown>): boolean {
  return typeof obj['name'] === 'string'
    && typeof obj['version'] === 'string'
    && VALID_TYPES.includes(obj['type'] as PluginType)
    && typeof obj['main'] === 'string';
}
