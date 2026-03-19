/**
 * Config Loader Tests
 */

import { describe, it, expect } from 'vitest';
import { validateConfigData, getEnabledReviewers, checkMinReviewers } from '@codeagora/core/config/loader.js';
import type { Config } from '@codeagora/core/types/config.js';

describe('Config Validation', () => {
  const validConfig: Config = {
    reviewers: [
      {
        id: 'r1',
        backend: 'opencode',
        provider: 'kimi',
        model: 'kimi-k2.5',
        enabled: true,
        timeout: 120,
      },
      {
        id: 'r2',
        backend: 'codex',
        model: 'o4-mini',
        enabled: true,
        timeout: 120,
      },
      {
        id: 'r3',
        backend: 'gemini',
        model: 'gemini-flash',
        enabled: false,
        timeout: 120,
      },
    ],
    supporters: {
      pool: [
        {
          id: 'sp1',
          backend: 'codex',
          model: 'o4-mini',
          enabled: true,
          timeout: 120,
        },
        {
          id: 'sp2',
          backend: 'gemini',
          model: 'gemini-flash',
          enabled: true,
          timeout: 120,
        },
      ],
      pickCount: 2,
      pickStrategy: 'random',
      devilsAdvocate: {
        id: 's-devil',
        backend: 'opencode',
        provider: 'opencode-zen',
        model: 'grok-fast',
        persona: '.ca/personas/devil.md',
        enabled: true,
        timeout: 120,
      },
      personaPool: [
        '.ca/personas/strict.md',
        '.ca/personas/pragmatic.md',
      ],
      personaAssignment: 'random',
    },
    moderator: {
      backend: 'codex',
      model: 'claude-sonnet',
    },
    discussion: {
      maxRounds: 3,
      registrationThreshold: {
        HARSHLY_CRITICAL: 1,
        CRITICAL: 1,
        WARNING: 2,
        SUGGESTION: null,
      },
      codeSnippetRange: 10,
    },
    errorHandling: {
      maxRetries: 2,
      forfeitThreshold: 0.7,
    },
  };

  it('should validate valid config', () => {
    expect(() => validateConfigData(validConfig)).not.toThrow();
  });

  it('should reject invalid backend', () => {
    const invalidConfig = {
      ...validConfig,
      reviewers: [
        {
          ...(validConfig.reviewers as Array<Record<string, unknown>>)[0],
          backend: 'invalid',
        },
      ],
    };

    expect(() => validateConfigData(invalidConfig)).toThrow();
  });

  it('should get enabled reviewers', () => {
    const enabled = getEnabledReviewers(validConfig);
    expect(enabled).toHaveLength(2);
    expect(enabled.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('should check minimum reviewers', () => {
    const result = checkMinReviewers(validConfig, 2);
    expect(result.valid).toBe(true);

    const failResult = checkMinReviewers(validConfig, 5);
    expect(failResult.valid).toBe(false);
    expect(failResult.message).toContain('Insufficient reviewers');
  });

  it('should require provider when backend is opencode', () => {
    const invalidConfig = {
      ...validConfig,
      reviewers: [
        {
          id: 'r1',
          backend: 'opencode' as const,
          model: 'kimi-k2.5',
          enabled: true,
          timeout: 120,
          // Missing provider
        },
      ],
    };

    expect(() => validateConfigData(invalidConfig)).toThrow(/provider is required/i);
  });

  it('should not require provider for non-opencode backends', () => {
    const configWithoutProvider = {
      ...validConfig,
      reviewers: [
        {
          id: 'r1',
          backend: 'codex' as const,
          model: 'o4-mini',
          enabled: true,
          timeout: 120,
          // No provider needed for codex
        },
      ],
    };

    expect(() => validateConfigData(configWithoutProvider)).not.toThrow();
  });

  it('should accept claude backend', () => {
    const configWithClaude = {
      ...validConfig,
      reviewers: [
        {
          id: 'r1',
          backend: 'claude' as const,
          model: 'claude-opus-4',
          enabled: true,
          timeout: 120,
        },
      ],
    };

    expect(() => validateConfigData(configWithClaude)).not.toThrow();
  });

  it('should accept api backend with provider', () => {
    const configWithApi = {
      ...validConfig,
      reviewers: [
        {
          id: 'r1',
          backend: 'api' as const,
          model: 'deepseek-r1-distill-llama-70b',
          provider: 'groq',
          enabled: true,
          timeout: 120,
        },
      ],
    };

    expect(() => validateConfigData(configWithApi)).not.toThrow();
  });

  it('should require provider when backend is api', () => {
    const invalidConfig = {
      ...validConfig,
      reviewers: [
        {
          id: 'r1',
          backend: 'api' as const,
          model: 'deepseek-r1',
          enabled: true,
          timeout: 120,
          // Missing provider
        },
      ],
    };

    expect(() => validateConfigData(invalidConfig)).toThrow(/provider is required/i);
  });

  it('should accept mixed CLI and API backends', () => {
    const mixedConfig = {
      ...validConfig,
      reviewers: [
        {
          id: 'r1',
          backend: 'opencode' as const,
          provider: 'kimi',
          model: 'kimi-k2.5',
          enabled: true,
          timeout: 120,
        },
        {
          id: 'r2',
          backend: 'api' as const,
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
          enabled: true,
          timeout: 120,
        },
        {
          id: 'r3',
          backend: 'gemini' as const,
          model: 'gemini-2.5-flash',
          enabled: true,
          timeout: 120,
        },
      ],
    };

    expect(() => validateConfigData(mixedConfig)).not.toThrow();
  });
});
