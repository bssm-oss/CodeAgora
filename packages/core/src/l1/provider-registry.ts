/**
 * Provider Registry
 * AI SDK provider instance creation and caching.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createGroq } from '@ai-sdk/groq';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import {
  PROVIDER_ENV_VARS,
  type SupportedProviderName,
} from '@codeagora/shared/providers/env-vars.js';
import type { LanguageModel } from 'ai';

// ============================================================================
// Types
// ============================================================================

/** A callable that returns a LanguageModel for a given model ID. */
type ProviderInstance = (modelId: string) => LanguageModel;

type ProviderFactoryConfig<Name extends SupportedProviderName> = {
  create: (apiKey: string) => ProviderInstance;
  apiKeyEnvVar: (typeof PROVIDER_ENV_VARS)[Name];
};

type ProviderFactoryRegistry = {
  [Name in SupportedProviderName]: ProviderFactoryConfig<Name>;
};

function toProviderInstance(provider: ProviderInstance): ProviderInstance {
  return provider;
}

// ============================================================================
// Provider Config
// ============================================================================

/**
 * Each provider entry knows how to construct its SDK instance.
 * Factories receive the merged options + apiKey and return a callable provider.
 */
const PROVIDER_FACTORIES = {
  anthropic: {
    create: (apiKey: string) =>
      toProviderInstance(createAnthropic({ apiKey })),
    apiKeyEnvVar: PROVIDER_ENV_VARS.anthropic,
  },
  openai: {
    create: (apiKey: string) =>
      toProviderInstance(createOpenAI({ apiKey })),
    apiKeyEnvVar: PROVIDER_ENV_VARS.openai,
  },
  openrouter: {
    create: (apiKey: string) =>
      toProviderInstance(createOpenRouter({ apiKey })),
    apiKeyEnvVar: PROVIDER_ENV_VARS.openrouter,
  },
  'opencode-go': {
    create: (apiKey: string) =>
      toProviderInstance(createOpenAICompatible({
        name: 'opencode-go',
        baseURL: 'https://opencode.ai/zen/go/v1',
        apiKey,
      })),
    apiKeyEnvVar: PROVIDER_ENV_VARS['opencode-go'],
  },
  'opencode-zen': {
    create: (apiKey: string) =>
      toProviderInstance(createOpenAI({
        baseURL: 'https://opencode.ai/zen/v1',
        apiKey,
      })),
    apiKeyEnvVar: PROVIDER_ENV_VARS['opencode-zen'],
  },
  groq: {
    create: (apiKey: string) =>
      toProviderInstance(createGroq({ apiKey })),
    apiKeyEnvVar: PROVIDER_ENV_VARS.groq,
  },
} satisfies ProviderFactoryRegistry;

export type ProviderName = keyof typeof PROVIDER_FACTORIES;

export const SUPPORTED_PROVIDER_NAMES = Object.freeze(
  Object.keys(PROVIDER_FACTORIES) as ProviderName[]
);

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

  if (!isSupportedProviderName(providerName)) {
    throw new Error(
      `Unknown API provider: '${providerName}'. Supported: ${SUPPORTED_PROVIDER_NAMES.join(', ')}`
    );
  }

  const config = PROVIDER_FACTORIES[providerName];
  const apiKey = process.env[config.apiKeyEnvVar];
  if (!apiKey) {
    throw new Error(
      `API key not found for provider '${providerName}'. Set ${config.apiKeyEnvVar} environment variable.\n` +
      `  export ${config.apiKeyEnvVar}=your_key_here`
    );
  }

  const provider = config.create(apiKey);
  providerCache.set(providerName, provider);
  return provider;
}

export function getSupportedProviders(): string[] {
  return [...SUPPORTED_PROVIDER_NAMES];
}

export function clearProviderCache(): void {
  providerCache.clear();
}

export function isSupportedProviderName(providerName: string): providerName is ProviderName {
  return Object.prototype.hasOwnProperty.call(PROVIDER_FACTORIES, providerName);
}
