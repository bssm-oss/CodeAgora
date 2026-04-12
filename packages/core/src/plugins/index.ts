/**
 * Plugin System — public API
 */

export type {
  Plugin,
  PluginType,
  PluginBase,
  ProviderPlugin,
  BackendPlugin,
  BackendPluginInput,
  OutputPlugin,
  HookPlugin,
  HookName,
  LoadResult,
  PluginManifest,
} from './types.js';

export {
  PluginRegistry,
  getPluginRegistry,
  resetPluginRegistry,
} from './registry.js';

export {
  validatePlugin,
  loadPlugins,
  filterEnabled,
  loadThirdPartyPlugins,
} from './loader.js';

export type { SandboxResult } from './sandbox.js';
export { sandboxExec, sandboxHook, sandboxBackend } from './sandbox.js';
