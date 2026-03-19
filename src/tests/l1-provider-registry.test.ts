/**
 * Provider Registry Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { getModel, getSupportedProviders, clearProviderCache } from '@codeagora/core/l1/provider-registry.js';

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

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => {
    const provider = (modelId: string) => ({ modelId, provider: 'google' });
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
      expect(providers).toContain('google');
      expect(providers).toContain('mistral');
      expect(providers).toContain('cerebras');
      expect(providers).toContain('together');
      expect(providers).toContain('xai');
      expect(providers.length).toBeGreaterThanOrEqual(8);
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

    // --- Google (#1) ---
    it('should create a google model when API key is set', () => {
      vi.stubEnv('GOOGLE_API_KEY', 'test-key');
      const model = getModel('google', 'gemini-2.5-flash');
      expect(model).toBeDefined();
      expect((model as any).modelId).toBe('gemini-2.5-flash');
    });

    it('should throw when GOOGLE_API_KEY is missing', () => {
      delete process.env.GOOGLE_API_KEY;
      expect(() => getModel('google', 'gemini-2.5-pro'))
        .toThrow(/Set GOOGLE_API_KEY environment variable/);
    });

    // --- Mistral (#2) ---
    it('should create a mistral model when API key is set', () => {
      vi.stubEnv('MISTRAL_API_KEY', 'test-key');
      const model = getModel('mistral', 'mistral-large-latest');
      expect(model).toBeDefined();
      expect((model as any).modelId).toBe('mistral-large-latest');
    });

    it('should throw when MISTRAL_API_KEY is missing', () => {
      delete process.env.MISTRAL_API_KEY;
      expect(() => getModel('mistral', 'model'))
        .toThrow(/Set MISTRAL_API_KEY environment variable/);
    });

    // --- Cerebras (#2) ---
    it('should create a cerebras model when API key is set', () => {
      vi.stubEnv('CEREBRAS_API_KEY', 'test-key');
      const model = getModel('cerebras', 'llama-3.3-70b');
      expect(model).toBeDefined();
      expect((model as any).modelId).toBe('llama-3.3-70b');
    });

    it('should throw when CEREBRAS_API_KEY is missing', () => {
      delete process.env.CEREBRAS_API_KEY;
      expect(() => getModel('cerebras', 'model'))
        .toThrow(/Set CEREBRAS_API_KEY environment variable/);
    });

    // --- Together (#2) ---
    it('should create a together model when API key is set', () => {
      vi.stubEnv('TOGETHER_API_KEY', 'test-key');
      const model = getModel('together', 'meta-llama/Llama-3-70b');
      expect(model).toBeDefined();
      expect((model as any).modelId).toBe('meta-llama/Llama-3-70b');
    });

    it('should throw when TOGETHER_API_KEY is missing', () => {
      delete process.env.TOGETHER_API_KEY;
      expect(() => getModel('together', 'model'))
        .toThrow(/Set TOGETHER_API_KEY environment variable/);
    });

    // --- xAI (#2) ---
    it('should create a xai model when API key is set', () => {
      vi.stubEnv('XAI_API_KEY', 'test-key');
      const model = getModel('xai', 'grok-3');
      expect(model).toBeDefined();
      expect((model as any).modelId).toBe('grok-3');
    });

    it('should throw when XAI_API_KEY is missing', () => {
      delete process.env.XAI_API_KEY;
      expect(() => getModel('xai', 'model'))
        .toThrow(/Set XAI_API_KEY environment variable/);
    });
  });
});
