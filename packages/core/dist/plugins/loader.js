import fs from "fs/promises";
import path from "path";
import { validateDiffPath } from "@codeagora/shared/utils/path-validation.js";
const VALID_TYPES = ["provider", "backend", "output", "hook"];
function validatePlugin(plugin) {
  if (typeof plugin !== "object" || plugin === null) return false;
  const p = plugin;
  if (typeof p["name"] !== "string" || p["name"].length === 0) return false;
  if (typeof p["version"] !== "string" || p["version"].length === 0) return false;
  if (!VALID_TYPES.includes(p["type"])) return false;
  switch (p["type"]) {
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
const PLUGIN_DIR = path.join(".ca", "plugins");
async function loadThirdPartyPlugins(registry, pluginDir) {
  const dir = pluginDir ?? PLUGIN_DIR;
  const result = { loaded: [], failed: [] };
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return result;
  }
  for (const entry of entries) {
    const pluginPath = path.join(dir, entry);
    const validation = validateDiffPath(pluginPath, {
      allowedRoots: [path.resolve(dir)]
    });
    if (!validation.success) {
      result.failed.push({ name: entry, error: "Path traversal blocked" });
      continue;
    }
    try {
      const stat = await fs.stat(pluginPath);
      if (!stat.isDirectory()) continue;
      const manifest = await readPluginManifest(pluginPath);
      if (!manifest) {
        result.failed.push({ name: entry, error: "No valid manifest found" });
        continue;
      }
      const mainPath = path.resolve(pluginPath, manifest.main);
      const mod = await import(mainPath);
      const plugin = mod.default ?? mod.plugin ?? mod;
      if (!validatePlugin(plugin)) {
        result.failed.push({ name: manifest.name, error: "Plugin export failed validation" });
        continue;
      }
      registry.register(plugin);
      result.loaded.push(manifest.name);
    } catch (e) {
      result.failed.push({
        name: entry,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }
  return result;
}
async function readPluginManifest(pluginDir) {
  try {
    const raw = await fs.readFile(path.join(pluginDir, "codeagora-plugin.json"), "utf-8");
    const json = JSON.parse(raw);
    if (isValidManifest(json)) return json;
  } catch {
  }
  try {
    const raw = await fs.readFile(path.join(pluginDir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    const ca = pkg["codeagora"];
    if (ca && typeof ca === "object") {
      const manifest = {
        name: pkg["name"],
        version: pkg["version"],
        type: ca["type"],
        main: ca["main"] ?? pkg["main"] ?? "index.js"
      };
      if (isValidManifest(manifest)) return manifest;
    }
  } catch {
  }
  return null;
}
function isValidManifest(obj) {
  return typeof obj["name"] === "string" && typeof obj["version"] === "string" && VALID_TYPES.includes(obj["type"]) && typeof obj["main"] === "string";
}
export {
  filterEnabled,
  loadPlugins,
  loadThirdPartyPlugins,
  validatePlugin
};
