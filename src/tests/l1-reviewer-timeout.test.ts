/**
 * L1 Reviewer Timeout Policy Tests
 *
 * Verifies that executeReviewers uses AbortController-based timeout management:
 * - Creates a new AbortController per attempt
 * - Passes signal to executeBackend
 * - Returns 'forfeit' on AbortError
 * - Cleans up setTimeout on success/failure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../packages/core/src/l1/backend.js', () => ({
  executeBackend: vi.fn(),
}));

import { executeReviewers } from '@codeagora/core/l1/reviewer.js';
import { executeBackend } from '@codeagora/core/l1/backend.js';
import { CircuitBreaker } from '@codeagora/core/l1/circuit-breaker.js';
import { HealthMonitor } from '@codeagora/core/l0/health-monitor.js';
import type { ReviewerInput } from '@codeagora/core/l1/reviewer.js';
import type { BackendInput } from '@codeagora/core/l1/backend.js';

const freshOptions = () => ({ circuitBreaker: new CircuitBreaker(), healthMonitor: new HealthMonitor() });

const mockExecuteBackend = vi.mocked(executeBackend);

// ============================================================================
// Helpers
// ============================================================================

function makeInput(overrides: Partial<ReviewerInput['config']> = {}): ReviewerInput {
  return {
    config: {
      id: 'reviewer-1',
      backend: 'api',
      model: 'gpt-4o',
      provider: 'openai',
      timeout: 30,
      enabled: true,
      ...overrides,
    },
    groupName: 'test-group',
    diffContent: '--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new',
    prSummary: 'Test PR',
  };
}

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

// ============================================================================
// Tests
// ============================================================================

describe('executeReviewers — timeout policy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockExecuteBackend.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should succeed and return parsed evidence when backend resolves within timeout', async () => {
    mockExecuteBackend.mockResolvedValueOnce(MOCK_RESPONSE);

    const promise = executeReviewers([makeInput()], 0, 5, freshOptions());
    // Advance timers but not past timeout (30s)
    vi.advanceTimersByTime(1000);
    const results = await promise;
    const result = results[0];

    expect(result.status).toBe('success');
    expect(result.reviewerId).toBe('reviewer-1');
    expect(result.evidenceDocs.length).toBeGreaterThan(0);
  });

  it('should return forfeit when backend throws AbortError', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    mockExecuteBackend.mockRejectedValueOnce(abortError);

    const results = await executeReviewers([makeInput()], 0, 5, freshOptions());
    const result = results[0];

    expect(result.status).toBe('forfeit');
    expect(result.error).toBeDefined();
  });

  it('should pass signal field in BackendInput to executeBackend', async () => {
    mockExecuteBackend.mockResolvedValueOnce(MOCK_RESPONSE);

    await executeReviewers([makeInput()], 0, 5, freshOptions());

    expect(mockExecuteBackend).toHaveBeenCalledOnce();
    const call = mockExecuteBackend.mock.calls[0][0] as BackendInput;
    expect(call.signal).toBeInstanceOf(AbortSignal);
  });

  it('should pass a non-aborted signal on first call', async () => {
    mockExecuteBackend.mockResolvedValueOnce(MOCK_RESPONSE);

    await executeReviewers([makeInput()], 0, 5, freshOptions());

    const call = mockExecuteBackend.mock.calls[0][0] as BackendInput;
    expect(call.signal!.aborted).toBe(false);
  });

  it('should create a new AbortController for each retry attempt', async () => {
    const abortError = new DOMException('aborted', 'AbortError');
    // Fail twice, succeed on 3rd attempt
    mockExecuteBackend
      .mockRejectedValueOnce(abortError)
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(MOCK_RESPONSE);

    const promise = executeReviewers([makeInput()], 2, 5, freshOptions());
    // Let fake timers advance through retry backoffs
    await vi.runAllTimersAsync();
    const results = await promise;
    const result = results[0];

    expect(result.status).toBe('success');
    expect(mockExecuteBackend).toHaveBeenCalledTimes(3);

    // Each call should have its own distinct AbortSignal instance
    const signals = mockExecuteBackend.mock.calls.map((c) => (c[0] as BackendInput).signal);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[1]).toBeInstanceOf(AbortSignal);
    expect(signals[2]).toBeInstanceOf(AbortSignal);
    // They should be different objects (new controller each attempt)
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[1]).not.toBe(signals[2]);
  });

  it('should clear the timeout when backend resolves (no timer leak)', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    mockExecuteBackend.mockResolvedValueOnce(MOCK_RESPONSE);

    await executeReviewers([makeInput()], 0, 5, freshOptions());

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('should clear the timeout even when backend rejects (finally cleanup)', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    mockExecuteBackend.mockRejectedValue(new Error('network error'));

    await executeReviewers([makeInput()], 0, 5, freshOptions());

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('should abort signal after timeout duration elapses', async () => {
    let capturedSignal: AbortSignal | undefined;
    mockExecuteBackend.mockImplementation(async (input: BackendInput) => {
      capturedSignal = input.signal;
      // Simulate a long-running backend — never resolves on its own
      return new Promise<string>((_, reject) => {
        input.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        );
      });
    });

    const input = makeInput({ timeout: 5 }); // 5 second timeout
    const promise = executeReviewers([input], 0, 5, freshOptions());

    // Signal should not be aborted yet
    expect(capturedSignal?.aborted).toBeFalsy();

    // Advance past the timeout
    await vi.advanceTimersByTimeAsync(5001);

    const results = await promise;
    const result = results[0];
    expect(result.status).toBe('forfeit');
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('should include timeout value from config in backend call', async () => {
    mockExecuteBackend.mockResolvedValueOnce(MOCK_RESPONSE);
    const input = makeInput({ timeout: 60 });

    await executeReviewers([input], 0, 5, freshOptions());

    const call = mockExecuteBackend.mock.calls[0][0] as BackendInput;
    expect(call.timeout).toBe(60);
  });
});
