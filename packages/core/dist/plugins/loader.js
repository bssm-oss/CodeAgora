const VALID_TYPES = ["provider", "backend", "output", "hook"];
function validatePlugin(plugin) {
  if (typeof plugin !== "object" || plugin === null) return false;
  const p = plugin;
  if (typeof p["name"] !== "string" || p["name"].length === 0) return false;
  if (typeof p["version"] !== "string" || p["version"].length === 0) return false;
  if (!VALID_TYPES.includes(p["type"])) return false;
  const type = p["type"];
  switch (type) {
    case "provider":
      return typeof p["apiKeyEnvVar"] === "string" && typeof p["createProvider"] === "function" && typeof p["isAvailable"] === "function";
    case "backend":
      return typeof p["execute"] === "function";
    case "output":
      return typeof p["format"] === "function";
    case "hook":
      return typeof p["hooks"] === "object" && p["hooks"] !== null;
    default:
      return false;
  }
}
function loadPlugins(plugins, registry) {
  const result = { loaded: [], failed: [] };
  for (const plugin of plugins) {
    if (!validatePlugin(plugin)) {
      const name = typeof plugin["name"] === "string" ? plugin["name"] : "<unknown>";
      result.failed.push({ name, error: "Plugin failed validation" });
      continue;
    }
    try {
      registry.register(plugin);
      result.loaded.push(plugin.name);
    } catch (e) {
      result.failed.push({
        name: plugin.name,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }
  return result;
}
function filterEnabled(plugins, enabledNames) {
  const nameSet = new Set(enabledNames);
  return plugins.filter((p) => nameSet.has(p.name));
}
export {
  filterEnabled,
  loadPlugins,
  validatePlugin
};
