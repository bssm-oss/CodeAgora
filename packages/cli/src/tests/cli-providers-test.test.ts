/**
 * Tests for commands/providers-test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testProviders, formatProviderTestResults } from '../commands/providers-test.js';
import type { ProviderTestResult } from '../commands/providers-test.js';

vi.mock('../utils/colors.js', () => ({
  bold: (s: string) => s,
  dim: (s: string) => s,
  statusColor: {
    pass: (s: string) => s,
    fail: (s: string) => s,
    warn: (s: string) => s,
  },
}));

vi.mock('@codeagora/shared/i18n/index.js', () => ({
  t: (key: string) => key,
}));

describe('testProviders', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns an array of results', () => {
    const results = testProviders();
    expect(Array.isArray(results)).toBe(true);
  });

  it('returns a result for every known provider', () => {
    const results = testProviders();
    // All results have name, envVar, status
    for (const r of results) {
      expect(r).toHaveProperty('name');
      expect(r).toHaveProperty('envVar');
      expect(r).toHaveProperty('status');
      expect(['set', 'missing', 'unusual']).toContain(r.status);
    }
  });

  it('marks provider as missing when env var is not set', () => {
    // Remove OPENAI_API_KEY
    delete process.env['OPENAI_API_KEY'];

    const results = testProviders();
    const openai = results.find((r) => r.name === 'openai');
    expect(openai).toBeDefined();
    expect(openai!.status).toBe('missing');
  });

  it('marks provider as set when env var has a valid api key', () => {
    process.env['OPENAI_API_KEY'] = 'sk-abcdefghijklmnopqrstuvwxyz12345678';

    const results = testProviders();
    const openai = results.find((r) => r.name === 'openai');
    expect(openai).toBeDefined();
    expect(openai!.status).toBe('set');
  });

  it('marks provider as unusual when env var has a suspiciously short value', () => {
    process.env['OPENAI_API_KEY'] = 'short';

    const results = testProviders();
    const openai = results.find((r) => r.name === 'openai');
    expect(openai).toBeDefined();
    expect(openai!.status).toBe('unusual');
  });

  it('marks provider as unusual when env var contains whitespace', () => {
    process.env['OPENAI_API_KEY'] = 'sk-abc def ghi jkl';

    const results = testProviders();
    const openai = results.find((r) => r.name === 'openai');
    expect(openai!.status).toBe('unusual');
  });

  it('result includes the correct envVar name', () => {
    const results = testProviders();
    const anthropic = results.find((r) => r.name === 'anthropic');
    expect(anthropic).toBeDefined();
    expect(anthropic!.envVar).toBe('ANTHROPIC_API_KEY');
  });

  it('filters to a single provider by provider name', () => {
    const results = testProviders('openrouter');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      name: 'openrouter',
      envVar: 'OPENROUTER_API_KEY',
    });
  });

  it('filters to a single provider by env var name', () => {
    const results = testProviders('OPENROUTER_API_KEY');

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('openrouter');
  });
});

describe('formatProviderTestResults', () => {
  it('returns a string', () => {
    const results: ProviderTestResult[] = [
      { name: 'openai', envVar: 'OPENAI_API_KEY', status: 'set' },
      { name: 'anthropic', envVar: 'ANTHROPIC_API_KEY', status: 'missing' },
    ];
    const output = formatProviderTestResults(results);
    expect(typeof output).toBe('string');
  });

  it('includes set/unusual/missing counts in output', () => {
    const results: ProviderTestResult[] = [
      { name: 'openai', envVar: 'OPENAI_API_KEY', status: 'set' },
      { name: 'groq', envVar: 'GROQ_API_KEY', status: 'unusual' },
      { name: 'anthropic', envVar: 'ANTHROPIC_API_KEY', status: 'missing' },
    ];
    const output = formatProviderTestResults(results);
    // Should contain count numbers
    expect(output).toContain('1');
  });

  it('handles empty results without throwing', () => {
    const output = formatProviderTestResults([]);
    expect(typeof output).toBe('string');
  });

  it('includes provider name in output', () => {
    const results: ProviderTestResult[] = [
      { name: 'openai', envVar: 'OPENAI_API_KEY', status: 'set' },
    ];
    const output = formatProviderTestResults(results);
    expect(output).toContain('openai');
  });
});
