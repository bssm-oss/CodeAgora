/**
 * Builtin Provider Plugins
 * Wraps the 8 hardcoded providers from l1/provider-registry as ProviderPlugin instances.
 */

import { createRequire } from 'node:module';
import type { ProviderPlugin } from './types.js';

const require = createRequire(import.meta.url);

// ============================================================================
// Factory Helper
// ============================================================================

/**
 * Creates a ProviderPlugin from a provider name, API key env var, and factory function.
 */
export function createBuiltinProviderPlugin(
  name: string,
  apiKeyEnvVar: string,
  factory: (apiKey: string) => unknown,
): ProviderPlugin {
  return {
    name,
    version: '1.0.0',
    type: 'provider' as const,
    apiKeyEnvVar,
    createProvider: factory,
    isAvailable: () => !!process.env[apiKeyEnvVar],
  };
}

// ============================================================================
// Builtin Provider Definitions
// ============================================================================

/**
 * Returns all 8 builtin provider plugins.
 * Factory functions use createRequire for ESM-safe synchronous imports.
 */
export function getBuiltinProviderPlugins(): ProviderPlugin[] {
  return [
    createBuiltinProviderPlugin('groq', 'GROQ_API_KEY', (apiKey: string) => {
      const { createGroq } = require('@ai-sdk/groq');
      return createGroq({ apiKey });
    }),

    createBuiltinProviderPlugin('nvidia-nim', 'NVIDIA_API_KEY', (apiKey: string) => {
      const { createOpenAICompatible } = require('@ai-sdk/openai-compatible');
      return createOpenAICompatible({
        name: 'nvidia-nim',
        baseURL: 'https://integrate.api.nvidia.com/v1',
        apiKey,
      });
    }),

    createBuiltinProviderPlugin('openrouter', 'OPENROUTER_API_KEY', (apiKey: string) => {
      const { createOpenRouter } = require('@openrouter/ai-sdk-provider');
      return createOpenRouter({ apiKey });
    }),

    createBuiltinProviderPlugin('google', 'GOOGLE_API_KEY', (apiKey: string) => {
      const { createGoogleGenerativeAI } = require('@ai-sdk/google');
      return createGoogleGenerativeAI({ apiKey });
    }),

    createBuiltinProviderPlugin('mistral', 'MISTRAL_API_KEY', (apiKey: string) => {
      const { createOpenAICompatible } = require('@ai-sdk/openai-compatible');
      return createOpenAICompatible({
        name: 'mistral',
        baseURL: 'https://api.mistral.ai/v1',
        apiKey,
      });
    }),

    createBuiltinProviderPlugin('cerebras', 'CEREBRAS_API_KEY', (apiKey: string) => {
      const { createOpenAICompatible } = require('@ai-sdk/openai-compatible');
      return createOpenAICompatible({
        name: 'cerebras',
        baseURL: 'https://api.cerebras.ai/v1',
        apiKey,
      });
    }),

    createBuiltinProviderPlugin('together', 'TOGETHER_API_KEY', (apiKey: string) => {
      const { createOpenAICompatible } = require('@ai-sdk/openai-compatible');
      return createOpenAICompatible({
        name: 'together',
        baseURL: 'https://api.together.xyz/v1',
        apiKey,
      });
    }),

    createBuiltinProviderPlugin('xai', 'XAI_API_KEY', (apiKey: string) => {
      const { createOpenAICompatible } = require('@ai-sdk/openai-compatible');
      return createOpenAICompatible({
        name: 'xai',
        baseURL: 'https://api.x.ai/v1',
        apiKey,
      });
    }),
  ];
}
