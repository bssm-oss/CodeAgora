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
import { createFireworks } from '@ai-sdk/fireworks';
import { createCohere } from '@ai-sdk/cohere';
import { createDeepInfra } from '@ai-sdk/deepinfra';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { createPerplexity } from '@ai-sdk/perplexity';
import { createHuggingFace } from '@ai-sdk/huggingface';
import { createBaseten } from '@ai-sdk/baseten';
import type { LanguageModel } from 'ai';

// ============================================================================
// Types
// ============================================================================

/** A callable that returns a LanguageModel for a given model ID. */
type ProviderInstance = (modelId: string) => LanguageModel;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toProviderInstance(provider: any): ProviderInstance {
  return (modelId: string): LanguageModel => provider(modelId);
}

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
      toProviderInstance(createOpenAICompatible({
        name: 'nvidia-nim',
        baseURL: 'https://integrate.api.nvidia.com/v1',
        apiKey,
      })),
    apiKeyEnvVar: 'NVIDIA_API_KEY',
  },
  groq: {
    create: (apiKey: string) =>
      toProviderInstance(createGroq({ apiKey })),
    apiKeyEnvVar: 'GROQ_API_KEY',
  },
  openrouter: {
    create: (apiKey: string) =>
      toProviderInstance(createOpenRouter({ apiKey })),
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
  },
  google: {
    create: (apiKey: string) =>
      toProviderInstance(createGoogleGenerativeAI({ apiKey })),
    apiKeyEnvVar: 'GOOGLE_API_KEY',
  },
  mistral: {
    create: (apiKey: string) =>
      toProviderInstance(createOpenAICompatible({
        name: 'mistral',
        baseURL: 'https://api.mistral.ai/v1',
        apiKey,
      })),
    apiKeyEnvVar: 'MISTRAL_API_KEY',
  },
  cerebras: {
    create: (apiKey: string) =>
      toProviderInstance(createOpenAICompatible({
        name: 'cerebras',
        baseURL: 'https://api.cerebras.ai/v1',
        apiKey,
      })),
    apiKeyEnvVar: 'CEREBRAS_API_KEY',
  },
  together: {
    create: (apiKey: string) =>
      toProviderInstance(createOpenAICompatible({
        name: 'together',
        baseURL: 'https://api.together.xyz/v1',
        apiKey,
      })),
    apiKeyEnvVar: 'TOGETHER_API_KEY',
  },
  xai: {
    create: (apiKey: string) =>
      toProviderInstance(createOpenAICompatible({
        name: 'xai',
        baseURL: 'https://api.x.ai/v1',
        apiKey,
      })),
    apiKeyEnvVar: 'XAI_API_KEY',
  },
  openai: {
    create: (apiKey: string) =>
      toProviderInstance(createOpenAI({ apiKey })),
    apiKeyEnvVar: 'OPENAI_API_KEY',
  },
  anthropic: {
    create: (apiKey: string) =>
      toProviderInstance(createAnthropic({ apiKey })),
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  },
  deepseek: {
    create: (apiKey: string) =>
      toProviderInstance(createOpenAICompatible({
        name: 'deepseek',
        baseURL: 'https://api.deepseek.com/v1',
        apiKey,
      })),
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
  },
  qwen: {
    create: (apiKey: string) =>
      toProviderInstance(createOpenAICompatible({
        name: 'qwen',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey,
      })),
    apiKeyEnvVar: 'QWEN_API_KEY',
  },
  zai: {
    create: (apiKey: string) =>
      toProviderInstance(createOpenAICompatible({
        name: 'zai',
        baseURL: 'https://api.zai.chat/v1',
        apiKey,
      })),
    apiKeyEnvVar: 'ZAI_API_KEY',
  },
  'github-models': {
    create: (apiKey: string) =>
      toProviderInstance(createOpenAICompatible({
        name: 'github-models',
        baseURL: 'https://models.inference.ai.azure.com',
        apiKey,
      })),
    apiKeyEnvVar: 'GITHUB_TOKEN',
  },
  'github-copilot': {
    create: (apiKey: string) =>
      toProviderInstance(createOpenAICompatible({
        name: 'github-copilot',
        baseURL: 'https://api.githubcopilot.com',
        apiKey,
      })),
    apiKeyEnvVar: 'GITHUB_COPILOT_TOKEN',
  },
  fireworks: {
    create: (apiKey: string) =>
      toProviderInstance(createFireworks({ apiKey })),
    apiKeyEnvVar: 'FIREWORKS_API_KEY',
  },
  cohere: {
    create: (apiKey: string) =>
      toProviderInstance(createCohere({ apiKey })),
    apiKeyEnvVar: 'COHERE_API_KEY',
  },
  deepinfra: {
    create: (apiKey: string) =>
      toProviderInstance(createDeepInfra({ apiKey })),
    apiKeyEnvVar: 'DEEPINFRA_API_KEY',
  },
  moonshot: {
    create: (apiKey: string) =>
      toProviderInstance(createMoonshotAI({ apiKey })),
    apiKeyEnvVar: 'MOONSHOT_API_KEY',
  },
  perplexity: {
    create: (apiKey: string) =>
      toProviderInstance(createPerplexity({ apiKey })),
    apiKeyEnvVar: 'PERPLEXITY_API_KEY',
  },
  huggingface: {
    create: (apiKey: string) =>
      toProviderInstance(createHuggingFace({ apiKey })),
    apiKeyEnvVar: 'HUGGINGFACE_API_KEY',
  },
  baseten: {
    create: (apiKey: string) =>
      toProviderInstance(createBaseten({ apiKey })),
    apiKeyEnvVar: 'BASETEN_API_KEY',
  },
  siliconflow: {
    create: (apiKey: string) =>
      toProviderInstance(createOpenAICompatible({
        name: 'siliconflow',
        baseURL: 'https://api.siliconflow.cn/v1',
        apiKey,
      })),
    apiKeyEnvVar: 'SILICONFLOW_API_KEY',
  },
  novita: {
    create: (apiKey: string) =>
      toProviderInstance(createOpenAICompatible({
        name: 'novita',
        baseURL: 'https://api.novita.ai/v3/openai',
        apiKey,
      })),
    apiKeyEnvVar: 'NOVITA_API_KEY',
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
