/**
 * CLI env command tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  saveCredential: vi.fn(),
}));

vi.mock('@codeagora/core/config/credentials.js', () => ({
  getCredentialsPath: vi.fn(() => '/tmp/codeagora-test-credentials'),
  saveCredential: mocks.saveCredential,
}));

import {
  formatEnvironmentCredentials,
  formatEnvSetResult,
  listEnvironmentCredentials,
  setEnvironmentCredential,
} from '@codeagora/cli/commands/env.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('env command helpers', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envVars = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY',
    'OPENCODE_API_KEY',
    'GROQ_API_KEY',
  ];

  beforeEach(() => {
    mocks.saveCredential.mockReset();
    for (const envVar of envVars) {
      savedEnv[envVar] = process.env[envVar];
      delete process.env[envVar];
    }
  });

  afterEach(() => {
    for (const envVar of envVars) {
      if (savedEnv[envVar] === undefined) {
        delete process.env[envVar];
      } else {
        process.env[envVar] = savedEnv[envVar];
      }
    }
  });

  it('lists supported provider env vars', () => {
    process.env['OPENROUTER_API_KEY'] = 'sk-or-test';

    const statuses = listEnvironmentCredentials();
    expect(statuses.map((status) => status.provider).sort()).toEqual([
      'anthropic',
      'groq',
      'openai',
      'opencode-go',
      'opencode-zen',
      'openrouter',
    ]);
    expect(statuses.find((status) => status.provider === 'openrouter')?.isSet).toBe(true);
  });

  it('saves a raw key for a provider target', async () => {
    const result = await setEnvironmentCredential('openrouter', 'sk-or-test');

    expect(mocks.saveCredential).toHaveBeenCalledWith('OPENROUTER_API_KEY', 'sk-or-test');
    expect(process.env['OPENROUTER_API_KEY']).toBe('sk-or-test');
    expect(result).toEqual({
      provider: 'openrouter',
      envVar: 'OPENROUTER_API_KEY',
      credentialsPath: '/tmp/codeagora-test-credentials',
    });
  });

  it('saves a raw key for an ENV_VAR target', async () => {
    const result = await setEnvironmentCredential('GROQ_API_KEY', 'gsk_test');

    expect(mocks.saveCredential).toHaveBeenCalledWith('GROQ_API_KEY', 'gsk_test');
    expect(process.env['GROQ_API_KEY']).toBe('gsk_test');
    expect(result.provider).toBe('groq');
  });

  it('accepts pasted ENV_VAR=value assignments', async () => {
    const result = await setEnvironmentCredential('groq', 'OPENROUTER_API_KEY=sk-or-test');

    expect(mocks.saveCredential).toHaveBeenCalledWith('OPENROUTER_API_KEY', 'sk-or-test');
    expect(result.provider).toBe('openrouter');
  });

  it('rejects empty keys before writing', async () => {
    await expect(setEnvironmentCredential('openrouter', '   ')).rejects.toThrow('API key is required');
    expect(mocks.saveCredential).not.toHaveBeenCalled();
  });

  it('formats list output with the setup command', () => {
    const output = stripAnsi(formatEnvironmentCredentials(listEnvironmentCredentials()));
    expect(output).toContain('CodeAgora env');
    expect(output).toContain('agora env set openrouter <api-key>');
    expect(output).toContain('agora doctor --live');
  });

  it('formats set output without printing the secret', () => {
    const output = stripAnsi(formatEnvSetResult({
      provider: 'openrouter',
      envVar: 'OPENROUTER_API_KEY',
      credentialsPath: '/tmp/codeagora-test-credentials',
    }));
    expect(output).toContain('Saved OPENROUTER_API_KEY for openrouter');
    expect(output).not.toContain('sk-or-test');
  });
});
