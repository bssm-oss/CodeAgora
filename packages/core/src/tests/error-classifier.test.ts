/**
 * Error Classifier Tests
 */

import { describe, it, expect } from 'vitest';
import { classifyError } from '../l1/error-classifier.js';

describe('classifyError', () => {
  // ========================================================================
  // APICallError-like errors (with statusCode)
  // ========================================================================

  it('classifies 429 as rate-limited', () => {
    const error = { statusCode: 429, message: 'Too Many Requests' };
    const result = classifyError(error);
    expect(result.kind).toBe('rate-limited');
    expect(result.retryAfterMs).toBeDefined();
  });

  it('extracts retry-after header (seconds)', () => {
    const error = {
      statusCode: 429,
      message: 'Rate limited',
      responseHeaders: { 'retry-after': '10' },
    };
    const result = classifyError(error);
    expect(result.kind).toBe('rate-limited');
    expect(result.retryAfterMs).toBe(10000);
  });

  it('caps retry-after at 30 seconds', () => {
    const error = {
      statusCode: 429,
      responseHeaders: { 'retry-after': '120' },
    };
    const result = classifyError(error);
    expect(result.retryAfterMs).toBe(30000);
  });

  it('uses default 5s when retry-after header missing', () => {
    const error = { statusCode: 429 };
    const result = classifyError(error);
    expect(result.retryAfterMs).toBe(5000);
  });

  it('classifies 401 as auth', () => {
    expect(classifyError({ statusCode: 401 }).kind).toBe('auth');
  });

  it('classifies 403 as auth', () => {
    expect(classifyError({ statusCode: 403 }).kind).toBe('auth');
  });

  it('classifies 500 as transient', () => {
    expect(classifyError({ statusCode: 500 }).kind).toBe('transient');
  });

  it('classifies 502 as transient', () => {
    expect(classifyError({ statusCode: 502 }).kind).toBe('transient');
  });

  it('classifies 503 as transient', () => {
    expect(classifyError({ statusCode: 503 }).kind).toBe('transient');
  });

  it('classifies 400 as permanent', () => {
    expect(classifyError({ statusCode: 400 }).kind).toBe('permanent');
  });

  it('classifies 404 as permanent', () => {
    expect(classifyError({ statusCode: 404 }).kind).toBe('permanent');
  });

  it('classifies 422 as permanent', () => {
    expect(classifyError({ statusCode: 422 }).kind).toBe('permanent');
  });

  // ========================================================================
  // Message-based fallback (no statusCode)
  // ========================================================================

  it('detects 429 from error message', () => {
    const error = new Error('Provider returned error: 429 rate limit exceeded');
    expect(classifyError(error).kind).toBe('rate-limited');
  });

  it('detects "rate limit" from message', () => {
    const error = new Error('Rate limit exceeded for this model');
    expect(classifyError(error).kind).toBe('rate-limited');
  });

  it('detects "too many" from message', () => {
    const error = new Error('Too many requests');
    expect(classifyError(error).kind).toBe('rate-limited');
  });

  it('detects 401 from message', () => {
    const error = new Error('HTTP 401 Unauthorized');
    expect(classifyError(error).kind).toBe('auth');
  });

  it('detects 403 from message', () => {
    const error = new Error('403 Forbidden');
    expect(classifyError(error).kind).toBe('auth');
  });

  it('detects AbortError as transient', () => {
    const error = new DOMException('aborted', 'AbortError');
    expect(classifyError(error).kind).toBe('transient');
  });

  it('detects timeout as transient', () => {
    const error = new Error('Request timeout after 120000ms');
    expect(classifyError(error).kind).toBe('transient');
  });

  it('detects ECONNREFUSED as transient', () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:443');
    expect(classifyError(error).kind).toBe('transient');
  });

  it('detects network error as transient', () => {
    const error = new Error('Network error: fetch failed');
    expect(classifyError(error).kind).toBe('transient');
  });

  it('classifies unknown errors as permanent', () => {
    const error = new Error('Something completely unexpected');
    expect(classifyError(error).kind).toBe('permanent');
  });

  it('handles non-Error values', () => {
    expect(classifyError('string error').kind).toBe('permanent');
    expect(classifyError(42).kind).toBe('permanent');
    expect(classifyError(null).kind).toBe('permanent');
  });

  // ========================================================================
  // retry-after header parsing edge cases
  // ========================================================================

  it('parses retry-after as HTTP date', () => {
    const future = new Date(Date.now() + 8000);
    const error = {
      statusCode: 429,
      responseHeaders: { 'retry-after': future.toUTCString() },
    };
    const result = classifyError(error);
    expect(result.retryAfterMs).toBeGreaterThan(5000);
    expect(result.retryAfterMs).toBeLessThanOrEqual(30000);
  });

  it('handles invalid retry-after gracefully', () => {
    const error = {
      statusCode: 429,
      responseHeaders: { 'retry-after': 'invalid-value' },
    };
    const result = classifyError(error);
    // Falls back to default
    expect(result.retryAfterMs).toBe(5000);
  });

  it('handles negative retry-after seconds', () => {
    const error = {
      statusCode: 429,
      responseHeaders: { 'retry-after': '-5' },
    };
    const result = classifyError(error);
    expect(result.retryAfterMs).toBe(5000); // default
  });

  // ========================================================================
  // status field (alternative to statusCode)
  // ========================================================================

  it('reads status field if statusCode not present', () => {
    const error = { status: 429, message: 'rate limited' };
    expect(classifyError(error).kind).toBe('rate-limited');
  });
});
