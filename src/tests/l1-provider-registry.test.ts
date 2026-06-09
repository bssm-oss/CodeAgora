/**
 * Provider Registry Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { getModel, getSupportedProviders, clearProviderCache } from '@codeagora/core/l1/provider-registry.js';

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (modelId: string) => ({ modelId, provider: 'anthropic' })),
}));

vi.mock('@ai-sdk/groq', () => ({
  createGroq: vi.fn(() => (modelId: string) => ({ modelId, provider: 'groq' })),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (modelId: string) => ({ modelId, provider: 'openai' })),
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => (modelId: string) => ({ modelId, provider: 'openai-compatible' })),
}));

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(() => (modelId: string) => ({ modelId, provider: 'openrouter' })),
}));

const supportedProviders = [
  'anthropic',
  'openai',
  'openrouter',
  'opencode-go',
  'opencode-zen',
  'groq',
];

describe('Provider Registry', () => {
  beforeEach(() => {
    clearProviderCache();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the retained API provider set', () => {
    expect(getSupportedProviders()).toEqual(supportedProviders);
  });

  it('creates Anthropic, OpenAI, OpenRouter, and Groq models with their own env vars', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubEnv('GROQ_API_KEY', 'test-key');

    expect((getModel('anthropic', 'claude-haiku-4-5') as any).modelId).toBe('claude-haiku-4-5');
    expect((getModel('openai', 'gpt-4o-mini') as any).modelId).toBe('gpt-4o-mini');
    expect((getModel('openrouter', 'qwen/qwen3.7-max') as any).modelId).toBe('qwen/qwen3.7-max');
    expect((getModel('groq', 'llama-3.3-70b-versatile') as any).modelId).toBe('llama-3.3-70b-versatile');

    expect(createAnthropic).toHaveBeenCalledOnce();
    expect(createOpenAI).toHaveBeenCalledOnce();
    expect(createOpenRouter).toHaveBeenCalledOnce();
    expect(createGroq).toHaveBeenCalledOnce();
  });

  it('creates OpenCode Go and Zen models with OPENCODE_API_KEY', () => {
    vi.stubEnv('OPENCODE_API_KEY', 'test-key');

    expect((getModel('opencode-go', 'deepseek-v4-flash') as any).modelId).toBe('deepseek-v4-flash');
    expect((getModel('opencode-zen', 'gpt-5.4-mini') as any).modelId).toBe('gpt-5.4-mini');

    expect(createOpenAICompatible).toHaveBeenCalledWith({
      name: 'opencode-go',
      baseURL: 'https://opencode.ai/zen/go/v1',
      apiKey: 'test-key',
    });
    expect(createOpenAI).toHaveBeenCalledWith({
      baseURL: 'https://opencode.ai/zen/v1',
      apiKey: 'test-key',
    });
  });

  it('throws for unknown provider', () => {
    expect(() => getModel('unknown-provider', 'model'))
      .toThrow(/Unknown API provider: 'unknown-provider'/);
  });

  it('throws when API key is missing', () => {
    expect(() => getModel('groq', 'model'))
      .toThrow(/Set GROQ_API_KEY environment variable/);
  });

  it('caches provider instances', () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    getModel('groq', 'model-a');
    getModel('groq', 'model-b');

    expect(createGroq).toHaveBeenCalledTimes(1);
  });

  it('creates fresh instances after cache clear', () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    getModel('groq', 'model-a');
    clearProviderCache();
    getModel('groq', 'model-b');

    expect(createGroq).toHaveBeenCalledTimes(2);
  });
});
