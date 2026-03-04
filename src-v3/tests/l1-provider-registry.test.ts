/**
 * Provider Registry Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { getModel, getSupportedProviders, clearProviderCache } from '../l1/provider-registry.js';

// Mock all provider packages
vi.mock('@ai-sdk/groq', () => ({
  createGroq: vi.fn(() => {
    const provider = (modelId: string) => ({ modelId, provider: 'groq' });
    return provider;
  }),
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => {
    const provider = (modelId: string) => ({ modelId, provider: 'openai-compatible' });
    return provider;
  }),
}));

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(() => {
    const provider = (modelId: string) => ({ modelId, provider: 'openrouter' });
    return provider;
  }),
}));

const mockCreateGroq = vi.mocked(createGroq);

describe('Provider Registry', () => {
  beforeEach(() => {
    clearProviderCache();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getSupportedProviders', () => {
    it('should return all supported provider names', () => {
      const providers = getSupportedProviders();
      expect(providers).toContain('groq');
      expect(providers).toContain('nvidia-nim');
      expect(providers).toContain('openrouter');
      expect(providers.length).toBe(3);
    });
  });

  describe('getModel', () => {
    it('should create a groq model when API key is set', () => {
      vi.stubEnv('GROQ_API_KEY', 'test-key');
      const model = getModel('groq', 'llama-3.3-70b-versatile');
      expect(model).toBeDefined();
      expect((model as any).modelId).toBe('llama-3.3-70b-versatile');
    });

    it('should create a nvidia-nim model when API key is set', () => {
      vi.stubEnv('NVIDIA_API_KEY', 'test-key');
      const model = getModel('nvidia-nim', 'deepseek-r1');
      expect(model).toBeDefined();
      expect((model as any).modelId).toBe('deepseek-r1');
    });

    it('should create an openrouter model when API key is set', () => {
      vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
      const model = getModel('openrouter', 'anthropic/claude-3.5-sonnet');
      expect(model).toBeDefined();
      expect((model as any).modelId).toBe('anthropic/claude-3.5-sonnet');
    });

    it('should throw for unknown provider', () => {
      expect(() => getModel('unknown-provider', 'model'))
        .toThrow(/Unknown API provider: 'unknown-provider'/);
    });

    it('should throw when API key is missing', () => {
      // Ensure env var is not set
      delete process.env.GROQ_API_KEY;
      expect(() => getModel('groq', 'model'))
        .toThrow(/Set GROQ_API_KEY environment variable/);
    });

    it('should cache provider instances', () => {
      vi.stubEnv('GROQ_API_KEY', 'test-key');
      getModel('groq', 'model-a');
      getModel('groq', 'model-b');

      // createGroq should only be called once (cached)
      expect(mockCreateGroq).toHaveBeenCalledTimes(1);
    });

    it('should create fresh instances after cache clear', () => {
      vi.stubEnv('GROQ_API_KEY', 'test-key');
      getModel('groq', 'model-a');
      clearProviderCache();
      getModel('groq', 'model-b');

      expect(mockCreateGroq).toHaveBeenCalledTimes(2);
    });
  });
});
