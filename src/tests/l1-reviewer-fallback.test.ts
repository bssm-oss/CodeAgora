/**
 * L1 Reviewer Fallback Tests
 *
 * Verifies that executeReviewers falls back to the configured fallback
 * backend+model when the primary backend fails all retries.
 * Supports both single-object and array fallback chains (#89).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../packages/core/src/l1/backend.js', () => ({
  executeBackend: vi.fn(),
}));

import { executeReviewers, normalizeFallbacks } from '@codeagora/core/l1/reviewer.js';
import { executeBackend } from '@codeagora/core/l1/backend.js';
import { CircuitBreaker } from '@codeagora/core/l1/circuit-breaker.js';
import { HealthMonitor } from '@codeagora/core/l0/health-monitor.js';
import type { ReviewerInput } from '@codeagora/core/l1/reviewer.js';
import type { BackendInput } from '@codeagora/core/l1/backend.js';
import { AgentConfigSchema } from '@codeagora/core/types/config.js';

const mockExecuteBackend = vi.mocked(executeBackend);

// ============================================================================
// Helpers
// ============================================================================

const MOCK_RESPONSE = `## Issue: Test Issue

### 문제
In file.ts:1-1

Test problem description.

### 근거
1. Evidence point

### 심각도
WARNING

### 제안
Fix it
`;

function makeInput(
  configOverrides: Partial<ReviewerInput['config']> = {}
): ReviewerInput {
  return {
    config: {
      id: 'reviewer-1',
      backend: 'api',
      model: 'gpt-4o',
      provider: 'openai',
      timeout: 30,
      enabled: true,
      ...configOverrides,
    },
    groupName: 'test-group',
    diffContent: '--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new',
    prSummary: 'Test PR',
  };
}

// ============================================================================
// Tests
// ============================================================================

const freshOptions = () => ({ circuitBreaker: new CircuitBreaker(), healthMonitor: new HealthMonitor() });

describe('executeReviewers — fallback mechanism', () => {
  beforeEach(() => {
    mockExecuteBackend.mockReset();
  });

  it('1. primary succeeds — fallback is never called', async () => {
    mockExecuteBackend.mockResolvedValueOnce(MOCK_RESPONSE);

    const results = await executeReviewers([makeInput()], 0, 5, freshOptions());
    const result = results[0];

    expect(result.status).toBe('success');
    expect(mockExecuteBackend).toHaveBeenCalledTimes(1);
  });

  it('2. primary fails with timeout — fallback called and succeeds', async () => {
    const timeoutError = new Error('Backend timeout after 30s');
    mockExecuteBackend
      .mockRejectedValueOnce(timeoutError)   // primary attempt 0
      .mockResolvedValueOnce(MOCK_RESPONSE); // fallback

    const input = makeInput({
      fallback: { model: 'claude-3-haiku', backend: 'claude' },
    });

    const results = await executeReviewers([input], 0, 5, freshOptions());
    const result = results[0];

    expect(result.status).toBe('success');
    expect(mockExecuteBackend).toHaveBeenCalledTimes(2);
  });

  it('3. primary fails with generic error — fallback called and succeeds', async () => {
    const networkError = new Error('network error');
    mockExecuteBackend
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(MOCK_RESPONSE);

    const input = makeInput({
      fallback: { model: 'gemini-pro', backend: 'gemini' },
    });

    const results = await executeReviewers([input], 0, 5, freshOptions());
    const result = results[0];

    expect(result.status).toBe('success');
    expect(result.model).toBe('gemini-pro');
  });

  it('4. primary + fallback both fail — returns forfeit', async () => {
    mockExecuteBackend.mockRejectedValue(new Error('all backends down'));

    const input = makeInput({
      fallback: { model: 'claude-3-haiku', backend: 'claude' },
    });

    const results = await executeReviewers([input], 0, 5, freshOptions());
    const result = results[0];

    expect(result.status).toBe('forfeit');
    expect(result.error).toBeDefined();
    // primary (1 attempt) + fallback (1 attempt) = 2 calls
    expect(mockExecuteBackend).toHaveBeenCalledTimes(2);
  });

  it('5. no fallback configured — permanent error skips retries, returns forfeit', async () => {
    // Permanent errors (unclassified) skip remaining retries
    mockExecuteBackend.mockRejectedValue(new Error('primary error'));

    const input = makeInput();

    const results = await executeReviewers([input], 1, 5, freshOptions()); // retries=1
    const result = results[0];

    expect(result.status).toBe('forfeit');
    // Permanent error breaks after first attempt (no retry)
    expect(mockExecuteBackend).toHaveBeenCalledTimes(1);
  });

  it('5b. no fallback configured — transient error retries, returns forfeit', async () => {
    // Transient errors (5xx) do retry
    mockExecuteBackend.mockRejectedValue(Object.assign(new Error('server error'), { statusCode: 500 }));

    const input = makeInput();

    const results = await executeReviewers([input], 1, 5, freshOptions()); // retries=1 → 2 attempts
    const result = results[0];

    expect(result.status).toBe('forfeit');
    // Transient: 1 initial + 1 retry = 2 calls
    expect(mockExecuteBackend).toHaveBeenCalledTimes(2);
  });

  it('6. fallback config passes zod validation (valid config)', () => {
    const raw = {
      id: 'r1',
      model: 'gpt-4o',
      backend: 'api',
      provider: 'openai',
      fallback: {
        model: 'claude-3-haiku',
        backend: 'claude',
      },
    };

    expect(() => AgentConfigSchema.parse(raw)).not.toThrow();
    const parsed = AgentConfigSchema.parse(raw);
    expect(parsed.fallback?.model).toBe('claude-3-haiku');
    expect(parsed.fallback?.backend).toBe('claude');
  });

  it('7. config without fallback passes zod validation (optional field)', () => {
    const raw = {
      id: 'r1',
      model: 'gpt-4o',
      backend: 'api',
      provider: 'openai',
    };

    expect(() => AgentConfigSchema.parse(raw)).not.toThrow();
    const parsed = AgentConfigSchema.parse(raw);
    expect(parsed.fallback).toBeUndefined();
  });

  it('8. fallback backend/model/provider are passed exactly to executeBackend', async () => {
    mockExecuteBackend
      .mockRejectedValueOnce(new Error('primary failed'))
      .mockResolvedValueOnce(MOCK_RESPONSE);

    const input = makeInput({
      fallback: {
        model: 'claude-3-5-sonnet',
        backend: 'claude',
        provider: undefined,
      },
    });

    await executeReviewers([input], 0, 5, freshOptions());

    expect(mockExecuteBackend).toHaveBeenCalledTimes(2);
    const fallbackCall = mockExecuteBackend.mock.calls[1][0] as BackendInput;
    expect(fallbackCall.backend).toBe('claude');
    expect(fallbackCall.model).toBe('claude-3-5-sonnet');
    expect(fallbackCall.provider).toBeUndefined();
    expect(fallbackCall.timeout).toBe(30); // inherited from primary config
  });
});

// ============================================================================
// Fallback Chain (Array) Tests — #89
// ============================================================================

describe('normalizeFallbacks helper', () => {
  it('returns empty array for undefined', () => {
    expect(normalizeFallbacks(undefined)).toEqual([]);
  });

  it('wraps single object in array', () => {
    const single = { model: 'gpt-4o', backend: 'api' as const, provider: 'openai' };
    expect(normalizeFallbacks(single)).toEqual([single]);
  });

  it('returns array as-is', () => {
    const arr = [
      { model: 'gpt-4o', backend: 'api' as const },
      { model: 'claude-3-haiku', backend: 'claude' as const },
    ];
    expect(normalizeFallbacks(arr)).toEqual(arr);
  });

  it('returns empty array for empty array input', () => {
    expect(normalizeFallbacks([])).toEqual([]);
  });
});

describe('executeReviewers — fallback chain (array)', () => {
  beforeEach(() => {
    mockExecuteBackend.mockReset();
  });

  it('9. array fallback: first fallback fails, second succeeds', async () => {
    mockExecuteBackend
      .mockRejectedValueOnce(new Error('primary failed'))    // primary
      .mockRejectedValueOnce(new Error('fallback-1 failed')) // fallback[0]
      .mockResolvedValueOnce(MOCK_RESPONSE);                 // fallback[1]

    const input = makeInput({
      fallback: [
        { model: 'claude-3-haiku', backend: 'claude' },
        { model: 'gemini-pro', backend: 'gemini' },
      ],
    });

    const results = await executeReviewers([input], 0, 5, freshOptions());
    const result = results[0];

    expect(result.status).toBe('success');
    expect(result.model).toBe('gemini-pro');
    expect(mockExecuteBackend).toHaveBeenCalledTimes(3);
  });

  it('10. array fallback: all fallbacks fail → forfeit', async () => {
    mockExecuteBackend.mockRejectedValue(new Error('everything down'));

    const input = makeInput({
      fallback: [
        { model: 'claude-3-haiku', backend: 'claude' },
        { model: 'gemini-pro', backend: 'gemini' },
        { model: 'gpt-4o-mini', backend: 'api', provider: 'openai' },
      ],
    });

    const results = await executeReviewers([input], 0, 5, freshOptions());
    const result = results[0];

    expect(result.status).toBe('forfeit');
    expect(result.error).toBeDefined();
    // primary (1) + 3 fallbacks = 4 calls
    expect(mockExecuteBackend).toHaveBeenCalledTimes(4);
  });

  it('11. array fallback: first succeeds — rest not called', async () => {
    mockExecuteBackend
      .mockRejectedValueOnce(new Error('primary failed'))
      .mockResolvedValueOnce(MOCK_RESPONSE); // fallback[0] succeeds

    const input = makeInput({
      fallback: [
        { model: 'claude-3-haiku', backend: 'claude' },
        { model: 'gemini-pro', backend: 'gemini' },
      ],
    });

    const results = await executeReviewers([input], 0, 5, freshOptions());
    const result = results[0];

    expect(result.status).toBe('success');
    expect(result.model).toBe('claude-3-haiku');
    // primary (1) + fallback[0] (1) = 2, fallback[1] never called
    expect(mockExecuteBackend).toHaveBeenCalledTimes(2);
  });

  it('12. empty fallback array → no fallback attempted, forfeit', async () => {
    mockExecuteBackend.mockRejectedValue(new Error('primary failed'));

    const input = makeInput({ fallback: [] });

    const results = await executeReviewers([input], 0, 5, freshOptions());
    const result = results[0];

    expect(result.status).toBe('forfeit');
    // only primary attempt
    expect(mockExecuteBackend).toHaveBeenCalledTimes(1);
  });

  it('13. array fallback passes correct backend/model/provider for each entry', async () => {
    mockExecuteBackend
      .mockRejectedValueOnce(new Error('primary failed'))
      .mockRejectedValueOnce(new Error('fallback-1 failed'))
      .mockResolvedValueOnce(MOCK_RESPONSE);

    const input = makeInput({
      fallback: [
        { model: 'claude-3-haiku', backend: 'claude' },
        { model: 'gpt-4o-mini', backend: 'api', provider: 'openai' },
      ],
    });

    await executeReviewers([input], 0, 5, freshOptions());

    // Verify fallback[0] call args
    const fb0Call = mockExecuteBackend.mock.calls[1][0] as BackendInput;
    expect(fb0Call.backend).toBe('claude');
    expect(fb0Call.model).toBe('claude-3-haiku');
    expect(fb0Call.provider).toBeUndefined();

    // Verify fallback[1] call args
    const fb1Call = mockExecuteBackend.mock.calls[2][0] as BackendInput;
    expect(fb1Call.backend).toBe('api');
    expect(fb1Call.model).toBe('gpt-4o-mini');
    expect(fb1Call.provider).toBe('openai');
  });
});

describe('AgentConfigSchema — fallback array validation (#89)', () => {
  it('14. accepts single fallback object (backward compat)', () => {
    const raw = {
      id: 'r1',
      model: 'gpt-4o',
      backend: 'api',
      provider: 'openai',
      fallback: { model: 'claude-3-haiku', backend: 'claude' },
    };

    expect(() => AgentConfigSchema.parse(raw)).not.toThrow();
    const parsed = AgentConfigSchema.parse(raw);
    expect(parsed.fallback).toBeDefined();
  });

  it('15. accepts fallback array', () => {
    const raw = {
      id: 'r1',
      model: 'gpt-4o',
      backend: 'api',
      provider: 'openai',
      fallback: [
        { model: 'claude-3-haiku', backend: 'claude' },
        { model: 'gemini-pro', backend: 'gemini' },
      ],
    };

    expect(() => AgentConfigSchema.parse(raw)).not.toThrow();
    const parsed = AgentConfigSchema.parse(raw);
    expect(Array.isArray(parsed.fallback)).toBe(true);
    expect((parsed.fallback as Array<unknown>)).toHaveLength(2);
  });

  it('16. accepts empty fallback array', () => {
    const raw = {
      id: 'r1',
      model: 'gpt-4o',
      backend: 'api',
      provider: 'openai',
      fallback: [],
    };

    expect(() => AgentConfigSchema.parse(raw)).not.toThrow();
  });

  it('17. rejects invalid fallback (missing required fields)', () => {
    const raw = {
      id: 'r1',
      model: 'gpt-4o',
      backend: 'api',
      provider: 'openai',
      fallback: { model: 'claude-3-haiku' }, // missing backend
    };

    expect(() => AgentConfigSchema.parse(raw)).toThrow();
  });

  it('18. rejects invalid entry in fallback array', () => {
    const raw = {
      id: 'r1',
      model: 'gpt-4o',
      backend: 'api',
      provider: 'openai',
      fallback: [
        { model: 'claude-3-haiku', backend: 'claude' },
        { model: 'gemini-pro' }, // missing backend
      ],
    };

    expect(() => AgentConfigSchema.parse(raw)).toThrow();
  });
});
