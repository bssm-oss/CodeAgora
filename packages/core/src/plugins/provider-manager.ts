/**
 * Provider Plugin Manager
 * Looks up ProviderPlugin instances from a PluginRegistry and creates provider instances.
 */

import type { ProviderPlugin } from './types.js';
import type { PluginRegistry } from './registry.js';

// ============================================================================
// Manager Class
// ============================================================================

export class ProviderPluginManager {
  private cache = new Map<string, unknown>();

  constructor(private registry: PluginRegistry) {}

  /**
   * Get a provider instance by name.
   * Throws if the plugin is not registered or the API key is missing.
   * Results are cached per provider name.
   */
  getProvider(name: string): unknown {
    const cached = this.cache.get(name);
    if (cached !== undefined) return cached;

    const plugin = this.registry.get<ProviderPlugin>(name);
    if (!plugin || plugin.type !== 'provider') {
      throw new Error(`Unknown provider plugin: '${name}'`);
    }

    const apiKey = process.env[plugin.apiKeyEnvVar];
    if (!apiKey) {
      throw new Error(
        `API key not found for provider '${name}'. Set ${plugin.apiKeyEnvVar} environment variable.`,
      );
    }

    const instance = plugin.createProvider(apiKey);
    this.cache.set(name, instance);
    return instance;
  }

  /**
   * Returns true if the plugin is registered and its API key is present.
   */
  isAvailable(name: string): boolean {
    const plugin = this.registry.get<ProviderPlugin>(name);
    if (!plugin || plugin.type !== 'provider') return false;
    return plugin.isAvailable();
  }

  /**
   * Lists all registered provider plugins with their API key availability.
   */
  listAvailable(): Array<{ name: string; hasApiKey: boolean }> {
    const providers = this.registry.getByType<ProviderPlugin>('provider');
    return providers.map((p) => ({
      name: p.name,
      hasApiKey: p.isAvailable(),
    }));
  }

  /**
   * Clears the provider instance cache.
   */
  clearCache(): void {
    this.cache.clear();
  }
}
