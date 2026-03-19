import { describe, it, expect } from 'vitest';
import { strictValidateConfig } from '@codeagora/core/config/validator.js';
import type { Config } from '@codeagora/core/types/config.js';

// ============================================================================
// Helper
// ============================================================================

function makeConfig(overrides?: Record<string, unknown>): Config {
  return {
    reviewers: [
      { id: 'r1', backend: 'api', model: 'test', provider: 'groq', timeout: 120, enabled: true },
      { id: 'r2', backend: 'api', model: 'test', provider: 'groq', timeout: 120, enabled: true },
      { id: 'r3', backend: 'api', model: 'test', provider: 'groq', timeout: 120, enabled: true },
    ],
    supporters: {
      pool: [
        { id: 's1', backend: 'api', model: 'test', provider: 'groq', timeout: 120, enabled: true },
      ],
      pickCount: 1,
      pickStrategy: 'random',
      devilsAdvocate: {
        id: 'da1',
        backend: 'api',
        model: 'test',
        provider: 'groq',
        timeout: 120,
        enabled: true,
      },
      personaPool: ['skeptic', 'optimist'],
      personaAssignment: 'random',
    },
    moderator: { backend: 'api', model: 'test', provider: 'groq' },
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
    errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
    ...overrides,
  } as Config;
}

// ============================================================================
// Tests
// ============================================================================

describe('strictValidateConfig', () => {
  // Test 1: valid provider 'groq' — no errors
  it('valid provider groq produces no errors', () => {
    const config = makeConfig();
    const result = strictValidateConfig(config);
    expect(result.errors).toEqual([]);
  });

  // Test 2: unsupported provider — error with supported list
  it('unsupported provider produces an error containing supported list', () => {
    const config = makeConfig({
      reviewers: [
        {
          id: 'r1',
          backend: 'opencode',
          model: 'test',
          provider: 'invalid-provider',
          timeout: 120,
          enabled: true,
        },
      ],
    });
    const result = strictValidateConfig(config);
    expect(result.errors.length).toBeGreaterThan(0);
    const errorMsg = result.errors.join(' ');
    expect(errorMsg).toContain('invalid-provider');
    expect(errorMsg).toContain('groq');
  });

  // Test 3: backend='api' without provider — error
  it('backend api without provider produces an error', () => {
    const config = makeConfig({
      reviewers: [
        {
          id: 'r1',
          backend: 'api',
          model: 'test',
          provider: undefined,
          timeout: 120,
          enabled: true,
        },
      ],
    });
    const result = strictValidateConfig(config);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.join(' ')).toMatch(/provider.*required|required.*provider/i);
  });

  // Test 4: model='' — error
  it('empty model string produces an error', () => {
    const config = makeConfig({
      reviewers: [
        {
          id: 'r1',
          backend: 'api',
          model: '',
          provider: 'groq',
          timeout: 120,
          enabled: true,
        },
      ],
    });
    const result = strictValidateConfig(config);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.join(' ')).toContain('model');
  });

  // Test 5: valid backends produce no errors
  it.each(['api', 'codex', 'opencode', 'gemini', 'claude'] as const)(
    'valid backend %s produces no errors',
    (backend) => {
      // For backends that require provider, supply one
      const needsProvider = backend === 'api' || backend === 'opencode';
      const config = makeConfig({
        reviewers: [
          {
            id: 'r1',
            backend,
            model: 'test',
            ...(needsProvider ? { provider: 'groq' } : {}),
            timeout: 120,
            enabled: true,
          },
        ],
      });
      const result = strictValidateConfig(config);
      // No backend-related errors
      const backendErrors = result.errors.filter((e) => e.includes('backend'));
      expect(backendErrors).toEqual([]);
    }
  );

  // Test 6: unsupported backend — zod catches it, validator skips; confirm no double-error
  // (zod-level validation prevents invalid backend from reaching strictValidateConfig normally,
  //  but we test that if somehow an unsupported backend reaches the validator it is caught)
  it('unsupported backend unknown produces a backend error', () => {
    const config = makeConfig({
      reviewers: [
        {
          id: 'r1',
          backend: 'unknown' as 'api',
          model: 'test',
          provider: 'groq',
          timeout: 120,
          enabled: true,
        },
      ],
    });
    const result = strictValidateConfig(config);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.join(' ')).toContain('backend');
  });

  // Test 7: backend='api' + unsupported provider → warning (not error)
  it('backend api with unsupported provider produces a warning, not an error', () => {
    const config = makeConfig({
      reviewers: [
        {
          id: 'r1',
          backend: 'api',
          model: 'test',
          provider: 'some-custom-provider',
          timeout: 120,
          enabled: true,
        },
      ],
    });
    const result = strictValidateConfig(config);
    const providerErrors = result.errors.filter((e) => e.includes('some-custom-provider'));
    expect(providerErrors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join(' ')).toContain('some-custom-provider');
  });

  // Test 8: timeout < 10 → warning
  it('timeout less than 10 produces a warning', () => {
    const config = makeConfig({
      reviewers: [
        {
          id: 'r1',
          backend: 'api',
          model: 'test',
          provider: 'groq',
          timeout: 5,
          enabled: true,
        },
      ],
    });
    const result = strictValidateConfig(config);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join(' ')).toContain('5');
  });

  // Test 9: timeout > 600 → warning
  it('timeout greater than 600 produces a warning', () => {
    const config = makeConfig({
      reviewers: [
        {
          id: 'r1',
          backend: 'api',
          model: 'test',
          provider: 'groq',
          timeout: 700,
          enabled: true,
        },
      ],
    });
    const result = strictValidateConfig(config);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join(' ')).toContain('700');
  });

  // Test 10: moderator validation
  it('moderator with invalid backend produces an error', () => {
    const config = makeConfig({
      moderator: { backend: 'bad-backend' as 'api', model: 'test', provider: 'groq' },
    });
    const result = strictValidateConfig(config);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.join(' ')).toContain('moderator');
    expect(result.errors.join(' ')).toContain('bad-backend');
  });

  // Test 11: fully valid config → valid: true
  it('fully valid config returns valid true with no errors or warnings', () => {
    const config = makeConfig();
    const result = strictValidateConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
