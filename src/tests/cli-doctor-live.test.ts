/**
 * CLI Doctor --live health check tests
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { runLiveHealthCheck, runDoctorWithLive, formatLiveCheckReport, formatDoctorReport, type LiveCheckResult } from '@codeagora/cli/commands/doctor.js';
import type { Config } from '@codeagora/core/types/config.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

// Mock provider registry
vi.mock('../../packages/core/src/l1/provider-registry.js', () => ({
  getModel: vi.fn(),
  getSupportedProviders: vi.fn(() => ['groq', 'openrouter']),
  clearProviderCache: vi.fn(),
}));

vi.mock('@codeagora/shared/utils/cli-detect.js', () => ({
  detectCliBackends: vi.fn(() => Promise.resolve([
    { backend: 'claude', bin: 'claude', available: false },
    { backend: 'codex', bin: 'codex', available: false },
  ])),
}));

vi.mock('@codeagora/shared/data/models-dev.js', () => ({
  loadModelsCatalog: vi.fn(() => Promise.resolve({})),
  getTopModels: vi.fn((_catalog, provider: string) => {
    if (provider === 'groq') return [{ id: 'llama-3.3-70b-versatile' }];
    if (provider === 'openrouter') return [{ id: 'openai/gpt-oss-120b' }, { id: 'qwen/qwen3-235b-a22b-2507' }];
    return [];
  }),
}));

// Mock ai SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { getModel } from '@codeagora/core/l1/provider-registry.js';
import { loadModelsCatalog } from '@codeagora/shared/data/models-dev.js';
import { generateText } from 'ai';

const mockGetModel = vi.mocked(getModel);
const mockLoadModelsCatalog = vi.mocked(loadModelsCatalog);
const mockGenerateText = vi.mocked(generateText);

function liveCheck(overrides: Partial<LiveCheckResult> = {}): LiveCheckResult {
  return { ...baseLiveCheck(), ...overrides };
}

function baseLiveCheck(): LiveCheckResult {
  return {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    envVar: 'GROQ_API_KEY',
    agents: ['reviewer:r1'],
    status: 'ok' as const,
    latencyMs: 245,
  };
}

async function writeConfig(baseDir: string, config: Config): Promise<void> {
  const caDir = path.join(baseDir, '.ca');
  await fs.mkdir(caDir, { recursive: true });
  await fs.writeFile(path.join(caDir, 'config.json'), JSON.stringify(config, null, 2));
}

// ============================================================================
// Minimal valid config fixture
// ============================================================================

function makeConfig(overrides: Partial<Config> = {}): Config {
  const base: Config = {
    reviewers: [
      {
        id: 'r1',
        model: 'llama-3.3-70b-versatile',
        backend: 'api',
        provider: 'groq',
        timeout: 120,
        enabled: true,
      },
    ],
    supporters: {
      pool: [
        {
          id: 's1',
          model: 'openai/gpt-oss-120b',
          backend: 'api',
          provider: 'openrouter',
          timeout: 120,
          enabled: true,
        },
      ],
      pickCount: 1,
      pickStrategy: 'random',
      devilsAdvocate: {
        id: 'da',
        model: 'llama-3.3-70b-versatile',
        backend: 'api',
        provider: 'groq',
        timeout: 120,
        enabled: true,
      },
      personaPool: ['critic'],
      personaAssignment: 'random',
    },
    moderator: {
      backend: 'api',
      model: 'mistral-large',
      provider: 'mistral',
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
  return { ...base, ...overrides };
}

// ============================================================================
// Tests
// ============================================================================

describe('runLiveHealthCheck()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetModel.mockReturnValue({ modelId: 'test-model' } as any);
    mockLoadModelsCatalog.mockResolvedValue({} as any);
  });

  it('returns ok status with latencyMs on successful ping', async () => {
    mockGenerateText.mockResolvedValue({ text: 'OK' } as any);

    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', timeout: 120, enabled: true },
      ],
      supporters: {
        pool: [],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'opencode', model: 'claude-3', provider: 'anthropic' },
    });

    const results = await runLiveHealthCheck(config);
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe('groq');
    expect(results[0].model).toBe('llama-3.3-70b-versatile');
    expect(results[0].envVar).toBe('GROQ_API_KEY');
    expect(results[0].agents).toEqual(['reviewer:r1']);
    expect(results[0].status).toBe('ok');
    expect(typeof results[0].latencyMs).toBe('number');
  });

  it('returns error status with error message on API error', async () => {
    mockGenerateText.mockRejectedValue(new Error('authentication failed: invalid API key'));

    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', timeout: 120, enabled: true },
      ],
      supporters: {
        pool: [],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'opencode', model: 'claude-3', provider: 'anthropic' },
    });

    const results = await runLiveHealthCheck(config);
    expect(results[0].status).toBe('error');
    expect(results[0].error).toContain('authentication failed');
  });

  it('returns timeout status when AbortError is thrown', async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    mockGenerateText.mockRejectedValue(abortErr);

    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', timeout: 120, enabled: true },
      ],
      supporters: {
        pool: [],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'opencode', model: 'claude-3', provider: 'anthropic' },
    });

    const results = await runLiveHealthCheck(config);
    expect(results[0].status).toBe('timeout');
    expect(results[0].error).toContain('timeout');
  });

  it('deduplicates same provider/model across multiple agents', async () => {
    mockGenerateText.mockResolvedValue({ text: 'OK' } as any);

    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', timeout: 120, enabled: true },
        { id: 'r2', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', timeout: 120, enabled: true },
      ],
      supporters: {
        pool: [],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'opencode', model: 'claude-3', provider: 'anthropic' },
    });

    const results = await runLiveHealthCheck(config);
    // Should only ping once for groq/llama-3.3-70b-versatile
    expect(results).toHaveLength(1);
    expect(results[0].agents).toEqual(['reviewer:r1', 'reviewer:r2']);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it('includes enabled head agent in live checks', async () => {
    mockGenerateText.mockResolvedValue({ text: 'OK' } as any);

    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
      ],
      supporters: {
        pool: [{ id: 's1', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false }],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'opencode', model: 'claude-3', provider: 'anthropic' },
      head: { backend: 'api', provider: 'openrouter', model: 'qwen/qwen3-235b-a22b-2507', timeout: 120, enabled: true },
    });

    const results = await runLiveHealthCheck(config);
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe('openrouter');
    expect(results[0].model).toBe('qwen/qwen3-235b-a22b-2507');
  });

  it('skips disabled head agent', async () => {
    mockGenerateText.mockResolvedValue({ text: 'OK' } as any);

    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
      ],
      supporters: {
        pool: [{ id: 's1', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false }],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'opencode', model: 'claude-3', provider: 'anthropic' },
      head: { backend: 'api', provider: 'openrouter', model: 'qwen/qwen3-235b-a22b-2507', timeout: 120, enabled: false },
    });

    const results = await runLiveHealthCheck(config);
    expect(results).toHaveLength(0);
  });

  it('skips disabled agents', async () => {
    mockGenerateText.mockResolvedValue({ text: 'OK' } as any);

    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
      ],
      supporters: {
        pool: [{ id: 's1', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false }],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'opencode', model: 'claude-3', provider: 'anthropic' },
    });

    const results = await runLiveHealthCheck(config);
    expect(results).toHaveLength(0);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('skips non-api backend agents', async () => {
    mockGenerateText.mockResolvedValue({ text: 'OK' } as any);

    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'claude-3', backend: 'claude', provider: undefined, timeout: 120, enabled: true },
      ],
      supporters: {
        pool: [{ id: 's1', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false }],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'opencode', model: 'claude-3', provider: 'anthropic' },
    });

    const results = await runLiveHealthCheck(config);
    expect(results).toHaveLength(0);
  });

  it('runs pings in parallel (Promise.allSettled)', async () => {
    const callOrder: string[] = [];
    mockGenerateText.mockImplementation(async ({ model: m }: any) => {
      callOrder.push(m.modelId ?? 'unknown');
      return { text: 'OK' } as any;
    });
    mockGetModel.mockImplementation((_provider: string, modelId: string) => ({ modelId } as any));

    const config = makeConfig();
    const results = await runLiveHealthCheck(config);
    // All unique pairs should be pinged
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.status === 'ok')).toBe(true);
  });

  it('resolves model:auto to a provider health-check model and records the configured model', async () => {
    mockGenerateText.mockResolvedValue({ text: 'OK' } as any);

    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'auto', backend: 'api', provider: 'groq', timeout: 120, enabled: true },
      ],
      supporters: {
        pool: [{ id: 's1', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false }],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'opencode', model: 'claude-3', provider: 'anthropic' },
    });

    const results = await runLiveHealthCheck(config);
    expect(results).toHaveLength(1);
    expect(results[0].configuredModel).toBe('auto');
    expect(results[0].model).toBe('llama-3.3-70b-versatile');
  });

  it('uses curated smoke defaults for OpenRouter auto instead of the cheapest catalog entry', async () => {
    mockGenerateText.mockResolvedValue({ text: 'OK' } as any);

    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'auto', backend: 'api', provider: 'openrouter', timeout: 120, enabled: true },
      ],
      supporters: {
        pool: [{ id: 's1', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false }],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'opencode', model: 'claude-3', provider: 'anthropic' },
    });

    const results = await runLiveHealthCheck(config);
    expect(results).toHaveLength(1);
    expect(results[0].configuredModel).toBe('auto');
    expect(results[0].model).toBe('qwen/qwen3-235b-a22b-2507');
  });

  it('keeps static smoke defaults when the model catalog cannot load', async () => {
    mockLoadModelsCatalog.mockRejectedValueOnce(new Error('catalog unavailable'));
    mockGenerateText.mockResolvedValue({ text: 'OK' } as any);

    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'auto', backend: 'api', provider: 'openrouter', timeout: 120, enabled: true },
      ],
      supporters: {
        pool: [{ id: 's1', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false }],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'opencode', model: 'claude-3', provider: 'anthropic' },
    });

    const results = await runLiveHealthCheck(config);
    expect(results).toHaveLength(1);
    expect(results[0].configuredModel).toBe('auto');
    expect(results[0].model).toBe('qwen/qwen3-235b-a22b-2507');
  });

  it('returns empty array when no enabled api-backend agents exist', async () => {
    const config = makeConfig({
      reviewers: [],
      supporters: {
        pool: [{ id: 's1', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false }],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'claude', model: 'claude-3' },
    });

    const results = await runLiveHealthCheck(config);
    expect(results).toHaveLength(0);
  });
});

describe('runDoctorWithLive()', () => {
  let tmpDir: string;
  let savedGroq: string | undefined;
  let savedOpenRouter: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-doctor-live-'));
    savedGroq = process.env['GROQ_API_KEY'];
    savedOpenRouter = process.env['OPENROUTER_API_KEY'];
    process.env['GROQ_API_KEY'] = 'gsk_test_key_for_live_doctor';
    delete process.env['OPENROUTER_API_KEY'];
    vi.clearAllMocks();
    mockGetModel.mockReturnValue({ modelId: 'test-model' } as any);
  });

  afterEach(async () => {
    if (savedGroq === undefined) {
      delete process.env['GROQ_API_KEY'];
    } else {
      process.env['GROQ_API_KEY'] = savedGroq;
    }
    if (savedOpenRouter === undefined) {
      delete process.env['OPENROUTER_API_KEY'];
    } else {
      process.env['OPENROUTER_API_KEY'] = savedOpenRouter;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('adds live API health to doctor summary when live checks pass', async () => {
    mockGenerateText.mockResolvedValue({ text: 'OK' } as any);
    await writeConfig(tmpDir, makeConfig({
      reviewers: [
        { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', timeout: 120, enabled: true },
      ],
      supporters: {
        pool: [{ id: 's1', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false }],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'api', model: 'llama-3.3-70b-versatile', provider: 'groq' },
    }));

    const result = await runDoctorWithLive(tmpDir);
    const liveHealth = result.checks.find((check) => check.name === 'Live API health');

    expect(liveHealth?.status).toBe('pass');
    expect(result.liveChecks).toHaveLength(1);
    expect(result.liveChecks?.[0].agents).toContain('reviewer:r1');
    expect(result.liveChecks?.[0].agents).toContain('moderator');
    expect(result.summary.fail).toBe(0);
  });

  it('turns live API errors into blocking doctor checks with redacted messages', async () => {
    mockGenerateText.mockRejectedValue(new Error('authentication failed for sk-1234567890secret'));
    await writeConfig(tmpDir, makeConfig({
      reviewers: [
        { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', timeout: 120, enabled: true },
      ],
      supporters: {
        pool: [{ id: 's1', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false }],
        pickCount: 1,
        pickStrategy: 'random',
        devilsAdvocate: { id: 'da', model: 'x', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
        personaPool: ['critic'],
        personaAssignment: 'random',
      },
      moderator: { backend: 'api', model: 'llama-3.3-70b-versatile', provider: 'groq' },
    }));

    const result = await runDoctorWithLive(tmpDir);
    const liveHealth = result.checks.find((check) => check.name === 'Live API health');
    const report = stripAnsi(formatDoctorReport(result));

    expect(liveHealth?.status).toBe('fail');
    expect(result.summary.fail).toBeGreaterThan(0);
    expect(result.liveChecks?.[0].error).toContain('[REDACTED]');
    expect(result.liveChecks?.[0].error).not.toContain('sk-1234567890secret');
    expect(report).toContain('Fix the live provider errors above');
  });
});

// ============================================================================
// formatLiveCheckReport
// ============================================================================

describe('formatLiveCheckReport()', () => {
  it('contains provider names in output', () => {
    const checks = [
      liveCheck(),
      liveCheck({
        provider: 'openrouter',
        model: 'qwen/qwen3-235b-a22b-2507',
        envVar: 'OPENROUTER_API_KEY',
        agents: ['head'],
        latencyMs: 380,
      }),
    ];
    const output = formatLiveCheckReport(checks);
    expect(output).toContain('groq/llama-3.3-70b-versatile');
    expect(output).toContain('openrouter/qwen/qwen3-235b-a22b-2507');
  });

  it('contains latency for ok checks', () => {
    const checks = [
      liveCheck({ latencyMs: 245 }),
    ];
    const output = formatLiveCheckReport(checks);
    expect(output).toContain('245ms');
  });

  it('contains env var and configured agent labels', () => {
    const output = stripAnsi(formatLiveCheckReport([
      liveCheck({ envVar: 'GROQ_API_KEY', agents: ['reviewer:r1', 'moderator'] }),
    ]));
    expect(output).toContain('GROQ_API_KEY');
    expect(output).toContain('used by reviewer:r1, moderator');
  });

  it('shows configured auto model when a health-check model was substituted', () => {
    const output = stripAnsi(formatLiveCheckReport([
      liveCheck({ configuredModel: 'auto', model: 'llama-3.3-70b-versatile' }),
    ]));
    expect(output).toContain('configured=auto');
  });

  it('shows timeout for timeout status', () => {
    const checks = [
      liveCheck({
        provider: 'mistral',
        model: 'mistral-large',
        envVar: 'MISTRAL_API_KEY',
        status: 'timeout',
        latencyMs: 10000,
        error: 'timeout (30s)',
      }),
    ];
    const output = formatLiveCheckReport(checks);
    expect(output).toContain('timeout');
    expect(output).toContain('mistral/mistral-large');
  });

  it('shows error message for error status', () => {
    const checks = [
      liveCheck({ model: 'bad-model', status: 'error', error: 'model not found' }),
    ];
    const output = formatLiveCheckReport(checks);
    expect(output).toContain('model not found');
  });

  it('includes summary line with passed/failed counts', () => {
    const checks = [
      liveCheck({ model: 'llama', latencyMs: 100 }),
      liveCheck({
        provider: 'mistral',
        model: 'large',
        envVar: 'MISTRAL_API_KEY',
        agents: ['head'],
        status: 'timeout',
        error: 'timeout (30s)',
      }),
    ];
    const output = stripAnsi(formatLiveCheckReport(checks));
    expect(output).toContain('1 passed');
    expect(output).toContain('1 failed');
  });

  it('shows ✓ for ok and ✗ for failed', () => {
    const checks = [
      liveCheck({ model: 'llama', latencyMs: 100 }),
      liveCheck({ provider: 'bad', model: 'model', envVar: 'BAD_API_KEY', status: 'error', error: 'fail' }),
    ];
    const output = formatLiveCheckReport(checks);
    expect(output).toContain('✓');
    expect(output).toContain('✗');
  });
});
