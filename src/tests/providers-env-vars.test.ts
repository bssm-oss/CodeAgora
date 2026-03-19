/**
 * Tests for src/providers/env-vars.ts
 */

import { describe, it, expect } from 'vitest';
import { PROVIDER_ENV_VARS, getProviderEnvVar } from '@codeagora/shared/providers/env-vars.js';

describe('PROVIDER_ENV_VARS', () => {
  it('should map all 15 known providers', () => {
    expect(Object.keys(PROVIDER_ENV_VARS)).toHaveLength(15);
  });

  it('should map nvidia-nim to NVIDIA_API_KEY', () => {
    expect(PROVIDER_ENV_VARS['nvidia-nim']).toBe('NVIDIA_API_KEY');
  });

  it('should map groq to GROQ_API_KEY', () => {
    expect(PROVIDER_ENV_VARS['groq']).toBe('GROQ_API_KEY');
  });

  it('should map openrouter to OPENROUTER_API_KEY', () => {
    expect(PROVIDER_ENV_VARS['openrouter']).toBe('OPENROUTER_API_KEY');
  });

  it('should map google to GOOGLE_API_KEY', () => {
    expect(PROVIDER_ENV_VARS['google']).toBe('GOOGLE_API_KEY');
  });

  it('should map mistral to MISTRAL_API_KEY', () => {
    expect(PROVIDER_ENV_VARS['mistral']).toBe('MISTRAL_API_KEY');
  });

  it('should map cerebras to CEREBRAS_API_KEY', () => {
    expect(PROVIDER_ENV_VARS['cerebras']).toBe('CEREBRAS_API_KEY');
  });

  it('should map together to TOGETHER_API_KEY', () => {
    expect(PROVIDER_ENV_VARS['together']).toBe('TOGETHER_API_KEY');
  });

  it('should map xai to XAI_API_KEY', () => {
    expect(PROVIDER_ENV_VARS['xai']).toBe('XAI_API_KEY');
  });
});

describe('getProviderEnvVar', () => {
  it('should return mapped env var for known provider: groq', () => {
    expect(getProviderEnvVar('groq')).toBe('GROQ_API_KEY');
  });

  it('should return mapped env var for known provider: openrouter', () => {
    expect(getProviderEnvVar('openrouter')).toBe('OPENROUTER_API_KEY');
  });

  it('should return mapped env var for known provider: google', () => {
    expect(getProviderEnvVar('google')).toBe('GOOGLE_API_KEY');
  });

  it('should return mapped env var for known provider: mistral', () => {
    expect(getProviderEnvVar('mistral')).toBe('MISTRAL_API_KEY');
  });

  it('should return mapped env var for known provider: cerebras', () => {
    expect(getProviderEnvVar('cerebras')).toBe('CEREBRAS_API_KEY');
  });

  it('should return mapped env var for known provider: together', () => {
    expect(getProviderEnvVar('together')).toBe('TOGETHER_API_KEY');
  });

  it('should return mapped env var for known provider: xai', () => {
    expect(getProviderEnvVar('xai')).toBe('XAI_API_KEY');
  });

  it('should return NVIDIA_API_KEY for nvidia-nim (not NVIDIA_NIM_API_KEY)', () => {
    expect(getProviderEnvVar('nvidia-nim')).toBe('NVIDIA_API_KEY');
  });

  it('should fall back to uppercase convention for unknown provider: anthropic', () => {
    expect(getProviderEnvVar('anthropic')).toBe('ANTHROPIC_API_KEY');
  });

  it('should fall back and replace hyphens for unknown hyphenated provider: my-provider', () => {
    expect(getProviderEnvVar('my-provider')).toBe('MY_PROVIDER_API_KEY');
  });

  it('should fall back to uppercase for unknown provider: openai', () => {
    expect(getProviderEnvVar('openai')).toBe('OPENAI_API_KEY');
  });

  it('should fall back to uppercase for unknown provider: cohere', () => {
    expect(getProviderEnvVar('cohere')).toBe('COHERE_API_KEY');
  });
});
