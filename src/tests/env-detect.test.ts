/**
 * Tests for CLI backend detection and unified environment detection.
 *
 * packages/shared/src/utils/cli-detect.ts
 * packages/shared/src/utils/env-detect.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLI_BACKENDS, detectCliBackends, type DetectedCli } from '@codeagora/shared/utils/cli-detect.js';
import { detectEnvironment, type EnvironmentReport, type ApiProviderStatus } from '@codeagora/shared/utils/env-detect.js';
import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';

// Mock child_process.execFileSync (safe binary lookup — no shell injection risk)
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'child_process';
const mockExecFileSync = vi.mocked(execFileSync);

describe('detectCliBackends', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns all curated CLI backends', async () => {
    // All binaries not found
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const results = await detectCliBackends();
    expect(results).toHaveLength(8);
  });

  it('returns correct structure for a found binary', async () => {
    mockExecFileSync.mockImplementation((_cmd, args) => {
      const bin = (args as string[])[0];
      if (bin === 'claude') return '/usr/local/bin/claude\n';
      throw new Error('not found');
    });

    const results = await detectCliBackends();
    const claude = results.find((r) => r.backend === 'claude');

    expect(claude).toBeDefined();
    expect(claude!.available).toBe(true);
    expect(claude!.path).toBe('/usr/local/bin/claude');
    expect(claude!.bin).toBe('claude');
  });

  it('returns available: false for missing binary', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const results = await detectCliBackends();
    const codex = results.find((r) => r.backend === 'codex');

    expect(codex).toBeDefined();
    expect(codex!.available).toBe(false);
    expect(codex!.path).toBeUndefined();
  });

  it('handles execFileSync throwing (binary not found)', async () => {
    mockExecFileSync.mockImplementation(() => {
      const err = new Error('Command failed: which nonexistent');
      (err as NodeJS.ErrnoException).code = 'ENOENT';
      throw err;
    });

    const results = await detectCliBackends();

    // Should not throw, all backends should be unavailable
    expect(results).toHaveLength(8);
    expect(results.every((r) => r.available === false)).toBe(true);
  });

  it('results are sorted alphabetically by backend name', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const results = await detectCliBackends();
    const backendNames = results.map((r) => r.backend);
    const sorted = [...backendNames].sort();

    expect(backendNames).toEqual(sorted);
  });

  it('detects multiple available backends simultaneously', async () => {
    const available = new Set(['claude', 'gemini', 'codex']);
    mockExecFileSync.mockImplementation((_cmd, args) => {
      const bin = (args as string[])[0];
      if (available.has(bin)) return `/usr/bin/${bin}\n`;
      throw new Error('not found');
    });

    const results = await detectCliBackends();
    const found = results.filter((r) => r.available);

    expect(found).toHaveLength(3);
    expect(found.map((r) => r.backend).sort()).toEqual(['claude', 'codex', 'gemini']);
  });

  it('maps cursor backend to agent binary', async () => {
    mockExecFileSync.mockImplementation((_cmd, args) => {
      const bin = (args as string[])[0];
      if (bin === 'agent') return '/usr/local/bin/agent\n';
      throw new Error('not found');
    });

    const results = await detectCliBackends();
    const cursor = results.find((r) => r.backend === 'cursor');

    expect(cursor).toBeDefined();
    expect(cursor!.bin).toBe('agent');
    expect(cursor!.available).toBe(true);
    expect(cursor!.path).toBe('/usr/local/bin/agent');
  });

  it('does not include the retired kiro backend', async () => {
    mockExecFileSync.mockImplementation((_cmd, args) => {
      const bin = (args as string[])[0];
      if (bin === 'kiro-cli') return '/usr/local/bin/kiro-cli\n';
      throw new Error('not found');
    });

    const results = await detectCliBackends();
    expect(results.find((r) => r.backend === 'kiro')).toBeUndefined();
  });

  it('maps antigravity backend to agy binary', async () => {
    mockExecFileSync.mockImplementation((_cmd, args) => {
      const bin = (args as string[])[0];
      if (bin === 'agy') return '/usr/local/bin/agy\n';
      throw new Error('not found');
    });

    const results = await detectCliBackends();
    const antigravity = results.find((r) => r.backend === 'antigravity');

    expect(antigravity).toBeDefined();
    expect(antigravity!.bin).toBe('agy');
    expect(antigravity!.available).toBe(true);
  });

  it('maps pi backend to pi binary', async () => {
    mockExecFileSync.mockImplementation((_cmd, args) => {
      const bin = (args as string[])[0];
      if (bin === 'pi') return '/usr/local/bin/pi\n';
      throw new Error('not found');
    });

    const results = await detectCliBackends();
    const pi = results.find((r) => r.backend === 'pi');

    expect(pi).toBeDefined();
    expect(pi!.bin).toBe('pi');
    expect(pi!.available).toBe(true);
  });

  it('does not include path property when binary is not found', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const results = await detectCliBackends();

    for (const result of results) {
      expect(result).not.toHaveProperty('path');
    }
  });
});

describe('CLI_BACKENDS constant', () => {
  it('contains exactly 8 entries', () => {
    expect(CLI_BACKENDS).toHaveLength(8);
  });

  it('each entry has backend and bin fields', () => {
    for (const entry of CLI_BACKENDS) {
      expect(typeof entry.backend).toBe('string');
      expect(typeof entry.bin).toBe('string');
      expect(entry.backend.length).toBeGreaterThan(0);
      expect(entry.bin.length).toBeGreaterThan(0);
    }
  });
});

describe('detectEnvironment', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    // Clear all provider env vars
    for (const envVar of Object.values(PROVIDER_ENV_VARS)) {
      delete process.env[envVar];
    }
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...savedEnv };
  });

  it('combines API providers and CLI backends', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const report = await detectEnvironment();

    expect(report).toHaveProperty('apiProviders');
    expect(report).toHaveProperty('cliBackends');
    expect(Array.isArray(report.apiProviders)).toBe(true);
    expect(Array.isArray(report.cliBackends)).toBe(true);
  });

  it('API providers check process.env correctly', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });
    process.env['OPENAI_API_KEY'] = 'sk-test-123';
    process.env['ANTHROPIC_API_KEY'] = 'ant-test-456';

    const report = await detectEnvironment();

    const openai = report.apiProviders.find((p) => p.provider === 'openai');
    const anthropic = report.apiProviders.find((p) => p.provider === 'anthropic');
    const groq = report.apiProviders.find((p) => p.provider === 'groq');

    expect(openai).toBeDefined();
    expect(openai!.available).toBe(true);
    expect(openai!.envVar).toBe('OPENAI_API_KEY');

    expect(anthropic).toBeDefined();
    expect(anthropic!.available).toBe(true);

    expect(groq).toBeDefined();
    expect(groq!.available).toBe(false);
  });

  it('works when no env vars are set', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const report = await detectEnvironment();

    expect(report.apiProviders.every((p) => p.available === false)).toBe(true);
    expect(report.cliBackends.every((c) => c.available === false)).toBe(true);
  });

  it('works when all env vars are set', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });
    for (const envVar of Object.values(PROVIDER_ENV_VARS)) {
      process.env[envVar] = 'test-key';
    }

    const report = await detectEnvironment();

    expect(report.apiProviders.every((p) => p.available === true)).toBe(true);
  });

  it('reports all providers from PROVIDER_ENV_VARS', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const report = await detectEnvironment();
    const providerNames = report.apiProviders.map((p) => p.provider);

    for (const provider of Object.keys(PROVIDER_ENV_VARS)) {
      expect(providerNames).toContain(provider);
    }
  });

  it('API providers are sorted alphabetically by provider name', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const report = await detectEnvironment();
    const providerNames = report.apiProviders.map((p) => p.provider);
    const sorted = [...providerNames].sort();

    expect(providerNames).toEqual(sorted);
  });
});
