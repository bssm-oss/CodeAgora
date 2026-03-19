/**
 * Recovery Utility Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  retryWithBackoff,
  retryOnError,
  isRetryableError,
} from '@codeagora/shared/utils/recovery.js';
import { CircuitBreaker } from '@codeagora/core/l1/circuit-breaker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a function that fails a given number of times then succeeds. */
function failsThenSucceeds(failCount: number, successValue: string = 'ok') {
  let calls = 0;
  return vi.fn(async () => {
    calls++;
    if (calls <= failCount) throw new Error(`attempt ${calls} failed`);
    return successValue;
  });
}

/** Use minimal delays for all retry tests so the suite stays fast. */
const FAST_OPTIONS = { baseDelay: 1, maxDelay: 1, backoffFactor: 1 };

// ---------------------------------------------------------------------------
// retryWithBackoff
// ---------------------------------------------------------------------------

describe('retryWithBackoff', () => {
  it('returns the result immediately on first-try success', async () => {
    const fn = vi.fn(async () => 'success');
    const result = await retryWithBackoff(fn, { ...FAST_OPTIONS, maxRetries: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and returns result when a later attempt succeeds', async () => {
    const fn = failsThenSucceeds(2, 'recovered');
    const result = await retryWithBackoff(fn, { ...FAST_OPTIONS, maxRetries: 3 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3); // 2 failures + 1 success
  });

  it('throws the last error when all retries are exhausted', async () => {
    const fn = vi.fn(async () => { throw new Error('persistent failure'); });
    await expect(
      retryWithBackoff(fn, { ...FAST_OPTIONS, maxRetries: 2 })
    ).rejects.toThrow('persistent failure');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('respects maxRetries: 0 — calls the function exactly once', async () => {
    const fn = vi.fn(async () => { throw new Error('fail'); });
    await expect(
      retryWithBackoff(fn, { ...FAST_OPTIONS, maxRetries: 0 })
    ).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects maxRetries: 1 — calls the function at most twice', async () => {
    const fn = vi.fn(async () => { throw new Error('fail'); });
    await expect(
      retryWithBackoff(fn, { ...FAST_OPTIONS, maxRetries: 1 })
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// retryOnError
// ---------------------------------------------------------------------------

describe('retryOnError', () => {
  it('returns result on first-try success without calling shouldRetry', async () => {
    const fn = vi.fn(async () => 'value');
    const shouldRetry = vi.fn(() => true);
    const result = await retryOnError(fn, shouldRetry, { ...FAST_OPTIONS, maxRetries: 3 });
    expect(result).toBe('value');
    expect(shouldRetry).not.toHaveBeenCalled();
  });

  it('throws immediately without retrying when shouldRetry returns false', async () => {
    const fn = vi.fn(async () => { throw new Error('not retryable'); });
    const shouldRetry = vi.fn(() => false);
    await expect(
      retryOnError(fn, shouldRetry, { ...FAST_OPTIONS, maxRetries: 3 })
    ).rejects.toThrow('not retryable');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledTimes(1);
  });

  it('retries when shouldRetry returns true and eventually succeeds', async () => {
    const fn = failsThenSucceeds(1, 'done');
    const shouldRetry = vi.fn(() => true);
    const result = await retryOnError(fn, shouldRetry, { ...FAST_OPTIONS, maxRetries: 3 });
    expect(result).toBe('done');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws last error when all retries are exhausted with shouldRetry true', async () => {
    const fn = vi.fn(async () => { throw new Error('always fails'); });
    const shouldRetry = vi.fn(() => true);
    await expect(
      retryOnError(fn, shouldRetry, { ...FAST_OPTIONS, maxRetries: 2 })
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});

// ---------------------------------------------------------------------------
// isRetryableError
// ---------------------------------------------------------------------------

describe('isRetryableError', () => {
  it('returns true for timeout errors', () => {
    expect(isRetryableError(new Error('request timeout exceeded'))).toBe(true);
  });

  it('returns true for ETIMEDOUT errors', () => {
    expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
  });

  it('returns true for ECONNREFUSED errors', () => {
    expect(isRetryableError(new Error('ECONNREFUSED 127.0.0.1:3000'))).toBe(true);
  });

  it('returns true for rate limit errors', () => {
    expect(isRetryableError(new Error('rate limit exceeded, slow down'))).toBe(true);
  });

  it('returns true for network errors', () => {
    expect(isRetryableError(new Error('network connection lost'))).toBe(true);
  });

  it('returns false for a generic application error', () => {
    expect(isRetryableError(new Error('validation failed: missing field'))).toBe(false);
  });

  it('returns false for a syntax error message', () => {
    expect(isRetryableError(new Error('SyntaxError: unexpected token'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CircuitBreaker
// ---------------------------------------------------------------------------

describe('CircuitBreaker', () => {
  const P = 'test-provider';
  const M = 'test-model';
  let cb: CircuitBreaker;

  beforeEach(() => {
    // threshold=3 failures to open; cooldownMs=50ms so half-open is reachable
    cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 50 });
  });

  it('starts in closed state', () => {
    expect(cb.getState(P, M)).toBe('closed');
  });

  it('reports not open when closed', () => {
    expect(cb.isOpen(P, M)).toBe(false);
  });

  it('increments failure count without opening prematurely', () => {
    // Two failures — still under threshold of 3
    cb.recordFailure(P, M);
    cb.recordFailure(P, M);
    expect(cb.getState(P, M)).toBe('closed');
  });

  it('transitions to open state after reaching the failure threshold', () => {
    for (let i = 0; i < 3; i++) {
      cb.recordFailure(P, M);
    }
    expect(cb.getState(P, M)).toBe('open');
  });

  it('reports isOpen when state is open and cooldown not elapsed', () => {
    for (let i = 0; i < 3; i++) {
      cb.recordFailure(P, M);
    }
    expect(cb.isOpen(P, M)).toBe(true);
  });

  it('transitions to half-open after the cooldown elapses', () => {
    let now = 0;
    const cb2 = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 100, nowFn: () => now });
    for (let i = 0; i < 3; i++) {
      cb2.recordFailure(P, M);
    }
    expect(cb2.getState(P, M)).toBe('open');

    // Advance time past the 100ms cooldown
    now = 101;
    expect(cb2.getState(P, M)).toBe('half-open');
  });

  it('returns to closed state after a successful call in half-open', () => {
    let now = 0;
    const cb2 = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 100, nowFn: () => now });
    for (let i = 0; i < 3; i++) {
      cb2.recordFailure(P, M);
    }
    now = 101;
    expect(cb2.getState(P, M)).toBe('half-open');

    cb2.recordSuccess(P, M);
    expect(cb2.getState(P, M)).toBe('closed');
  });

  it('getState() reflects the current state accurately', () => {
    expect(cb.getState(P, M)).toBe('closed');
    for (let i = 0; i < 3; i++) {
      cb.recordFailure(P, M);
    }
    expect(cb.getState(P, M)).toBe('open');
  });
});
