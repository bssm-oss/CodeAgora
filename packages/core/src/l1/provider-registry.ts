/**
 * Provider Registry
 * AI SDK provider instance creation and caching.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createGroq } from '@ai-sdk/groq';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
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
  google: {
    create: (apiKey: string) =>
      createGoogleGenerativeAI({ apiKey }) as unknown as ProviderInstance,
    apiKeyEnvVar: 'GOOGLE_API_KEY',
  },
  mistral: {
    create: (apiKey: string) =>
      createOpenAICompatible({
        name: 'mistral',
        baseURL: 'https://api.mistral.ai/v1',
        apiKey,
      }) as unknown as ProviderInstance,
    apiKeyEnvVar: 'MISTRAL_API_KEY',
  },
  cerebras: {
    create: (apiKey: string) =>
      createOpenAICompatible({
        name: 'cerebras',
        baseURL: 'https://api.cerebras.ai/v1',
        apiKey,
      }) as unknown as ProviderInstance,
    apiKeyEnvVar: 'CEREBRAS_API_KEY',
  },
  together: {
    create: (apiKey: string) =>
      createOpenAICompatible({
        name: 'together',
        baseURL: 'https://api.together.xyz/v1',
        apiKey,
      }) as unknown as ProviderInstance,
    apiKeyEnvVar: 'TOGETHER_API_KEY',
  },
  xai: {
    create: (apiKey: string) =>
      createOpenAICompatible({
        name: 'xai',
        baseURL: 'https://api.x.ai/v1',
        apiKey,
      }) as unknown as ProviderInstance,
    apiKeyEnvVar: 'XAI_API_KEY',
  },
  openai: {
    create: (apiKey: string) =>
      createOpenAI({ apiKey }) as unknown as ProviderInstance,
    apiKeyEnvVar: 'OPENAI_API_KEY',
  },
  anthropic: {
    create: (apiKey: string) =>
      createAnthropic({ apiKey }) as unknown as ProviderInstance,
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  },
  deepseek: {
    create: (apiKey: string) =>
      createOpenAICompatible({
        name: 'deepseek',
        baseURL: 'https://api.deepseek.com/v1',
        apiKey,
      }) as unknown as ProviderInstance,
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
  },
  qwen: {
    create: (apiKey: string) =>
      createOpenAICompatible({
        name: 'qwen',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey,
      }) as unknown as ProviderInstance,
    apiKeyEnvVar: 'QWEN_API_KEY',
  },
  zai: {
    create: (apiKey: string) =>
      createOpenAICompatible({
        name: 'zai',
        baseURL: 'https://api.zai.chat/v1',
        apiKey,
      }) as unknown as ProviderInstance,
    apiKeyEnvVar: 'ZAI_API_KEY',
  },
  'github-models': {
    create: (apiKey: string) =>
      createOpenAICompatible({
        name: 'github-models',
        baseURL: 'https://models.inference.ai.azure.com',
        apiKey,
      }) as unknown as ProviderInstance,
    apiKeyEnvVar: 'GITHUB_TOKEN',
  },
  'github-copilot': {
    create: (apiKey: string) =>
      createOpenAICompatible({
        name: 'github-copilot',
        baseURL: 'https://api.githubcopilot.com',
        apiKey,
      }) as unknown as ProviderInstance,
    apiKeyEnvVar: 'GITHUB_COPILOT_TOKEN',
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
