/**
 * Package-level tests for packages/shared/src/providers/env-vars.ts
 */

import { describe, it, expect } from 'vitest';
import { PROVIDER_ENV_VARS, getProviderEnvVar } from '@codeagora/shared/providers/env-vars.js';

describe('PROVIDER_ENV_VARS', () => {
  it('contains the retained API provider set', () => {
    expect(PROVIDER_ENV_VARS).toEqual({
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      'opencode-go': 'OPENCODE_API_KEY',
      'opencode-zen': 'OPENCODE_API_KEY',
      groq: 'GROQ_API_KEY',
    });
  });

  it('all keys and values are non-empty lowercase/provider env strings', () => {
    for (const [k, v] of Object.entries(PROVIDER_ENV_VARS)) {
      expect(k).toBe(k.toLowerCase());
      expect(v).toMatch(/^[A-Z0-9_]+$/);
    }
  });
});

describe('getProviderEnvVar', () => {
  it('returns mapped env var for a known provider', () => {
    expect(getProviderEnvVar('opencode-zen')).toBe('OPENCODE_API_KEY');
  });

  it('falls back to UPPER_API_KEY convention for unknown provider', () => {
    expect(getProviderEnvVar('unknown-llm')).toBe('UNKNOWN_LLM_API_KEY');
  });
});
