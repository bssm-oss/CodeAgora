const VALID_TYPES = ["provider", "backend", "output", "hook"];
class PluginRegistry {
  plugins = /* @__PURE__ */ new Map();
  register(plugin) {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }
    if (!VALID_TYPES.includes(plugin.type)) {
      throw new Error(`Plugin "${plugin.name}" has invalid type: "${plugin.type}"`);
    }
    this.plugins.set(plugin.name, plugin);
  }
  unregister(name) {
    return this.plugins.delete(name);
  }
  get(name) {
    return this.plugins.get(name);
  }
  getByType(type) {
    const result = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.type === type) {
        result.push(plugin);
      }
    }
    return result;
  }
  has(name) {
    return this.plugins.has(name);
  }
  list() {
    return Array.from(this.plugins.values());
  }
  clear() {
    this.plugins.clear();
  }
}
let _instance = null;
function getPluginRegistry() {
  if (_instance === null) {
    _instance = new PluginRegistry();
  }
  return _instance;
}
function resetPluginRegistry() {
  _instance = null;
}
export {
  PluginRegistry,
  getPluginRegistry,
  resetPluginRegistry
};
