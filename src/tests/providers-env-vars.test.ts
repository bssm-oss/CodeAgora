/**
 * Tests for provider env var mapping.
 */

import { describe, it, expect } from 'vitest';
import { PROVIDER_ENV_VARS, getProviderEnvVar } from '@codeagora/shared/providers/env-vars.js';

const expected = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  'opencode-go': 'OPENCODE_API_KEY',
  'opencode-zen': 'OPENCODE_API_KEY',
  groq: 'GROQ_API_KEY',
};

describe('PROVIDER_ENV_VARS', () => {
  it('maps the retained API provider set', () => {
    expect(PROVIDER_ENV_VARS).toEqual(expected);
  });
});

describe('getProviderEnvVar', () => {
  it('returns mapped env vars for known providers', () => {
    for (const [provider, envVar] of Object.entries(expected)) {
      expect(getProviderEnvVar(provider)).toBe(envVar);
    }
  });

  it('falls back and replaces hyphens for unknown providers', () => {
    expect(getProviderEnvVar('my-provider')).toBe('MY_PROVIDER_API_KEY');
  });
});
