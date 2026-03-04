/**
 * Provider Registry
 * AI SDK provider instance creation and caching.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createGroq } from '@ai-sdk/groq';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';

// ============================================================================
// Types
// ============================================================================

/** A callable that returns a LanguageModel for a given model ID. */
type ProviderInstance = (modelId: string) => LanguageModel;

// ============================================================================
// Provider Config
// ============================================================================

/**
 * Each provider entry knows how to construct its SDK instance.
 * Factories receive the merged options + apiKey and return a callable provider.
 */
const PROVIDER_FACTORIES = {
  'nvidia-nim': {
    create: (apiKey: string) =>
      createOpenAICompatible({
        name: 'nvidia-nim',
        baseURL: 'https://integrate.api.nvidia.com/v1',
        apiKey,
      }) as unknown as ProviderInstance,
    apiKeyEnvVar: 'NVIDIA_API_KEY',
  },
  groq: {
    create: (apiKey: string) =>
      createGroq({ apiKey }) as unknown as ProviderInstance,
    apiKeyEnvVar: 'GROQ_API_KEY',
  },
  openrouter: {
    create: (apiKey: string) =>
      createOpenRouter({ apiKey }) as unknown as ProviderInstance,
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
  },
} as const;

type ProviderName = keyof typeof PROVIDER_FACTORIES;

// ============================================================================
// Singleton Cache
// ============================================================================

const providerCache = new Map<string, ProviderInstance>();

// ============================================================================
// Public API
// ============================================================================

/**
 * Get a language model from the specified provider.
 * Provider instances are cached for reuse.
 */
export function getModel(providerName: string, modelId: string): LanguageModel {
  const provider = getOrCreateProvider(providerName);
  return provider(modelId);
}

/**
 * Get or create a provider instance.
 */
function getOrCreateProvider(providerName: string): ProviderInstance {
  const cached = providerCache.get(providerName);
  if (cached) return cached;

  const config = PROVIDER_FACTORIES[providerName as ProviderName];
  if (!config) {
    throw new Error(
      `Unknown API provider: '${providerName}'. Supported: ${Object.keys(PROVIDER_FACTORIES).join(', ')}`
    );
  }

  const apiKey = process.env[config.apiKeyEnvVar];
  if (!apiKey) {
    throw new Error(
      `API key not found. Set ${config.apiKeyEnvVar} environment variable.`
    );
  }

  const provider = config.create(apiKey);
  providerCache.set(providerName, provider);
  return provider;
}

export function getSupportedProviders(): string[] {
  return Object.keys(PROVIDER_FACTORIES);
}

export function clearProviderCache(): void {
  providerCache.clear();
}
