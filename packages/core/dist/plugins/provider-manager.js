class ProviderPluginManager {
  constructor(registry) {
    this.registry = registry;
  }
  cache = /* @__PURE__ */ new Map();
  /**
   * Get a provider instance by name.
   * Throws if the plugin is not registered or the API key is missing.
   * Results are cached per provider name.
   */
  getProvider(name) {
    const cached = this.cache.get(name);
    if (cached !== void 0) return cached;
    const plugin = this.registry.get(name);
    if (!plugin || plugin.type !== "provider") {
      throw new Error(`Unknown provider plugin: '${name}'`);
    }
    const apiKey = process.env[plugin.apiKeyEnvVar];
    if (!apiKey) {
      throw new Error(
        `API key not found for provider '${name}'. Set ${plugin.apiKeyEnvVar} environment variable.`
      );
    }
    const instance = plugin.createProvider(apiKey);
    this.cache.set(name, instance);
    return instance;
  }
  /**
   * Returns true if the plugin is registered and its API key is present.
   */
  isAvailable(name) {
    const plugin = this.registry.get(name);
    if (!plugin || plugin.type !== "provider") return false;
    return plugin.isAvailable();
  }
  /**
   * Lists all registered provider plugins with their API key availability.
   */
  listAvailable() {
    const providers = this.registry.getByType("provider");
    return providers.map((p) => ({
      name: p.name,
      hasApiKey: p.isAvailable()
    }));
  }
  /**
   * Clears the provider instance cache.
   */
  clearCache() {
    this.cache.clear();
  }
}
export {
  ProviderPluginManager
};
