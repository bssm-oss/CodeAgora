/**
 * CLI Doctor --live health check tests
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runLiveHealthCheck, formatLiveCheckReport } from '@codeagora/cli/commands/doctor.js';
import type { Config } from '@codeagora/core/types/config.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

// Mock provider registry
vi.mock('../../packages/core/src/l1/provider-registry.js', () => ({
  getModel: vi.fn(),
  getSupportedProviders: vi.fn(() => []),
  clearProviderCache: vi.fn(),
}));

// Mock ai SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { getModel } from '@codeagora/core/l1/provider-registry.js';
import { generateText } from 'ai';

const mockGetModel = vi.mocked(getModel);
const mockGenerateText = vi.mocked(generateText);

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
          model: 'gemini-pro',
          backend: 'api',
          provider: 'google',
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
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it('skips disabled agents', async () => {
    mockGenerateText.mockResolvedValue({ text: 'OK' } as any);

    const config = makeConfig({
      reviewers: [
        { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', timeout: 120, enabled: false },
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

  it('returns empty array when no enabled api-backend agents exist', async () => {
    const config = makeConfig({
      reviewers: [],
      supporters: {
        pool: [],
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

// ============================================================================
// formatLiveCheckReport
// ============================================================================

describe('formatLiveCheckReport()', () => {
  it('contains provider names in output', () => {
    const checks = [
      { provider: 'groq', model: 'llama-3.3-70b-versatile', status: 'ok' as const, latencyMs: 245 },
      { provider: 'google', model: 'gemini-pro', status: 'ok' as const, latencyMs: 380 },
    ];
    const output = formatLiveCheckReport(checks);
    expect(output).toContain('groq/llama-3.3-70b-versatile');
    expect(output).toContain('google/gemini-pro');
  });

  it('contains latency for ok checks', () => {
    const checks = [
      { provider: 'groq', model: 'llama-3.3-70b-versatile', status: 'ok' as const, latencyMs: 245 },
    ];
    const output = formatLiveCheckReport(checks);
    expect(output).toContain('245ms');
  });

  it('shows timeout for timeout status', () => {
    const checks = [
      { provider: 'mistral', model: 'mistral-large', status: 'timeout' as const, latencyMs: 10000, error: 'timeout (10s)' },
    ];
    const output = formatLiveCheckReport(checks);
    expect(output).toContain('timeout');
    expect(output).toContain('mistral/mistral-large');
  });

  it('shows error message for error status', () => {
    const checks = [
      { provider: 'groq', model: 'bad-model', status: 'error' as const, error: 'model not found' },
    ];
    const output = formatLiveCheckReport(checks);
    expect(output).toContain('model not found');
  });

  it('includes summary line with passed/failed counts', () => {
    const checks = [
      { provider: 'groq', model: 'llama', status: 'ok' as const, latencyMs: 100 },
      { provider: 'mistral', model: 'large', status: 'timeout' as const, error: 'timeout (10s)' },
    ];
    const output = stripAnsi(formatLiveCheckReport(checks));
    expect(output).toContain('1 passed');
    expect(output).toContain('1 failed');
  });

  it('shows ✓ for ok and ✗ for failed', () => {
    const checks = [
      { provider: 'groq', model: 'llama', status: 'ok' as const, latencyMs: 100 },
      { provider: 'bad', model: 'model', status: 'error' as const, error: 'fail' },
    ];
    const output = formatLiveCheckReport(checks);
    expect(output).toContain('✓');
    expect(output).toContain('✗');
  });
});
