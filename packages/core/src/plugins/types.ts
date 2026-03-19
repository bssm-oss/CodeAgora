/**
 * Plugin System Type Definitions
 * Defines the interfaces for all plugin types in the CodeAgora pipeline.
 */

// ============================================================================
// Base Plugin
// ============================================================================

export interface BasePlugin {
  name: string;
  version: string;
  description?: string;
}

// ============================================================================
// Plugin Type Discriminant
// ============================================================================

export type PluginType = 'provider' | 'backend' | 'output' | 'hook';

// ============================================================================
// Provider Plugin (extends L1 provider system)
// ============================================================================

export interface ProviderPlugin extends BasePlugin {
  type: 'provider';
  apiKeyEnvVar: string;
  createProvider(apiKey: string): unknown;
  isAvailable(): boolean;
}

// ============================================================================
// Backend Plugin (custom backend, e.g. Ollama)
// ============================================================================

export interface BackendPluginInput {
  prompt: string;
  systemPrompt?: string;
  model: string;
  signal?: AbortSignal;
}

export interface BackendPlugin extends BasePlugin {
  type: 'backend';
  execute(input: BackendPluginInput): Promise<string>;
}

// ============================================================================
// Output Plugin (custom formatter)
// ============================================================================

export interface OutputPlugin extends BasePlugin {
  type: 'output';
  format(result: unknown): Promise<string>;
}

// ============================================================================
// Hook Plugin (pipeline event listeners)
// ============================================================================

export type HookEventName =
  | 'pre-review'
  | 'post-review'
  | 'pre-discussion'
  | 'post-discussion'
  | 'pre-verdict'
  | 'post-verdict';

export interface HookPlugin extends BasePlugin {
  type: 'hook';
  hooks: {
    'pre-review'?: (context: unknown) => Promise<void>;
    'post-review'?: (context: unknown) => Promise<void>;
    'pre-discussion'?: (context: unknown) => Promise<void>;
    'post-discussion'?: (context: unknown) => Promise<void>;
    'pre-verdict'?: (context: unknown) => Promise<void>;
    'post-verdict'?: (context: unknown) => Promise<void>;
  };
}

// ============================================================================
// Union
// ============================================================================

export type Plugin = ProviderPlugin | BackendPlugin | OutputPlugin | HookPlugin;

// ============================================================================
// Plugin Config (stored in .ca/config.json)
// ============================================================================

export interface PluginConfig {
  enabled: string[];
  settings?: Record<string, unknown>;
}
