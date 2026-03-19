/**
 * Plugin Registry
 * In-memory registry for managing plugin instances.
 */

import type { Plugin, PluginType } from './types.js';

// ============================================================================
// Registry Class
// ============================================================================

export class PluginRegistry {
  private plugins = new Map<string, Plugin>();

  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }
    const validTypes: PluginType[] = ['provider', 'backend', 'output', 'hook'];
    if (!validTypes.includes(plugin.type)) {
      throw new Error(`Plugin "${plugin.name}" has invalid type: "${plugin.type}"`);
    }
    this.plugins.set(plugin.name, plugin);
  }

  unregister(name: string): boolean {
    return this.plugins.delete(name);
  }

  get<T extends Plugin>(name: string): T | undefined {
    return this.plugins.get(name) as T | undefined;
  }

  getByType<T extends Plugin>(type: PluginType): T[] {
    const result: T[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.type === type) {
        result.push(plugin as T);
      }
    }
    return result;
  }

  has(name: string): boolean {
    return this.plugins.has(name);
  }

  list(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  clear(): void {
    this.plugins.clear();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let _instance: PluginRegistry | null = null;

export function getPluginRegistry(): PluginRegistry {
  if (_instance === null) {
    _instance = new PluginRegistry();
  }
  return _instance;
}

export function resetPluginRegistry(): void {
  _instance = null;
}
