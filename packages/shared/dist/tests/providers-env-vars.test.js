/**
 * Package-level tests for packages/shared/src/providers/env-vars.ts
 */
import { describe, it, expect } from 'vitest';
import { PROVIDER_ENV_VARS, getProviderEnvVar } from '@codeagora/shared/providers/env-vars.js';
describe('PROVIDER_ENV_VARS', () => {
    it('is a non-empty record', () => {
        expect(Object.keys(PROVIDER_ENV_VARS).length).toBeGreaterThan(0);
    });
    it('maps openai to OPENAI_API_KEY', () => {
        expect(PROVIDER_ENV_VARS['openai']).toBe('OPENAI_API_KEY');
    });
    it('maps anthropic to ANTHROPIC_API_KEY', () => {
        expect(PROVIDER_ENV_VARS['anthropic']).toBe('ANTHROPIC_API_KEY');
    });
    it('maps google to GOOGLE_API_KEY', () => {
        expect(PROVIDER_ENV_VARS['google']).toBe('GOOGLE_API_KEY');
    });
    it('maps groq to GROQ_API_KEY', () => {
        expect(PROVIDER_ENV_VARS['groq']).toBe('GROQ_API_KEY');
    });
    it('maps github-models to GITHUB_TOKEN', () => {
        expect(PROVIDER_ENV_VARS['github-models']).toBe('GITHUB_TOKEN');
    });
    it('maps github-copilot to GITHUB_COPILOT_TOKEN', () => {
        expect(PROVIDER_ENV_VARS['github-copilot']).toBe('GITHUB_COPILOT_TOKEN');
    });
    it('all values are non-empty strings', () => {
        for (const [, v] of Object.entries(PROVIDER_ENV_VARS)) {
            expect(typeof v).toBe('string');
            expect(v.length).toBeGreaterThan(0);
        }
    });
    it('all keys are lowercase strings', () => {
        for (const k of Object.keys(PROVIDER_ENV_VARS)) {
            expect(k).toBe(k.toLowerCase());
        }
    });
});
describe('getProviderEnvVar', () => {
    it('returns mapped env var for a known provider', () => {
        expect(getProviderEnvVar('openai')).toBe('OPENAI_API_KEY');
    });
    it('returns NVIDIA_API_KEY for nvidia-nim (not fallback convention)', () => {
        expect(getProviderEnvVar('nvidia-nim')).toBe('NVIDIA_API_KEY');
    });
    it('falls back to UPPER_API_KEY convention for unknown provider', () => {
        expect(getProviderEnvVar('unknown-llm')).toBe('UNKNOWN_LLM_API_KEY');
    });
    it('converts hyphens to underscores in fallback', () => {
        expect(getProviderEnvVar('my-custom-provider')).toBe('MY_CUSTOM_PROVIDER_API_KEY');
    });
    it('uppercases the provider name in fallback', () => {
        expect(getProviderEnvVar('testprovider')).toBe('TESTPROVIDER_API_KEY');
    });
    it('returns the known env var even when fallback would differ', () => {
        // groq fallback would be GROQ_API_KEY anyway, but it must come from map
        const result = getProviderEnvVar('groq');
        expect(result).toBe('GROQ_API_KEY');
    });
});
