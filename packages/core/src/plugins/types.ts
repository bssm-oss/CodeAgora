/**
 * Plugin System Type Definitions
 */

export type PluginType = 'provider' | 'backend' | 'output' | 'hook';

export interface PluginBase {
  name: string;
  version: string;
  type: PluginType;
}

export interface ProviderPlugin extends PluginBase {
  type: 'provider';
  apiKeyEnvVar: string;
  createProvider(apiKey: string): unknown;
  isAvailable(): boolean;
}

export interface BackendPlugin extends PluginBase {
  type: 'backend';
  execute(input: BackendPluginInput): Promise<string>;
}

export interface BackendPluginInput {
  prompt: string;
  model: string;
  timeout?: number;
}

export interface OutputPlugin extends PluginBase {
  type: 'output';
  format(result: unknown): Promise<string>;
}

export type HookName =
  | 'pre-review'
  | 'post-review'
  | 'pre-discussion'
  | 'post-discussion'
  | 'pre-verdict'
  | 'post-verdict';

export interface HookPlugin extends PluginBase {
  type: 'hook';
  hooks: Partial<Record<HookName, (context: unknown) => Promise<void>>>;
}

export type Plugin = ProviderPlugin | BackendPlugin | OutputPlugin | HookPlugin;

export interface LoadResult {
  loaded: string[];
  failed: Array<{ name: string; error: string }>;
}

export interface PluginManifest {
  name: string;
  version: string;
  type: PluginType;
  main: string;
}
