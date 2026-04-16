/**
 * Error Classifier for retry/fallback decisions.
 * Inspects AI SDK APICallError and generic errors to determine retry strategy.
 */

import { isRetryableError } from '@codeagora/shared/utils/recovery.js';

// ============================================================================
// Types
// ============================================================================

export type ErrorKind = 'rate-limited' | 'auth' | 'transient' | 'permanent';

export interface ErrorClassification {
  kind: ErrorKind;
  /** Suggested wait time in ms before retry (from retry-after header or default). */
  retryAfterMs?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_RATE_LIMIT_DELAY_MS = 5000;
const MAX_RETRY_AFTER_MS = 30_000;

// ============================================================================
// Classifier
// ============================================================================

/**
 * Classify an error to determine retry strategy.
 *
 * - `rate-limited`: 429 — retry after delay (from header or 5s default)
 * - `auth`: 401/403 — no retry, forfeit immediately
 * - `transient`: 5xx, timeout, network — retry with exponential backoff
 * - `permanent`: other 4xx — no retry
 */
export function classifyError(error: unknown): ErrorClassification {
  // AI SDK errors expose statusCode and responseHeaders
  const statusCode = getStatusCode(error);
  const headers = getResponseHeaders(error);

  if (statusCode !== undefined) {
    if (statusCode === 429) {
      return {
        kind: 'rate-limited',
        retryAfterMs: parseRetryAfter(headers) ?? DEFAULT_RATE_LIMIT_DELAY_MS,
      };
    }
    if (statusCode === 401 || statusCode === 403) {
      return { kind: 'auth' };
    }
    if (statusCode >= 500) {
      return { kind: 'transient' };
    }
    // Other 4xx (400, 404, 422, etc.)
    return { kind: 'permanent' };
  }

  // No status code — inspect error message and type for patterns
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';

  // AbortError (timeout) is transient
  if (name === 'AbortError' || /abort/i.test(message)) {
    return { kind: 'transient' };
  }

  if (/\b(401|403)\b/.test(message)) {
    return { kind: 'auth' };
  }
  if (/429|rate.?limit|too many/i.test(message)) {
    return { kind: 'rate-limited', retryAfterMs: DEFAULT_RATE_LIMIT_DELAY_MS };
  }
  if (isRetryableError(error instanceof Error ? error : new Error(message))) {
    return { kind: 'transient' };
  }

  return { kind: 'permanent' };
}

// ============================================================================
// Helpers
// ============================================================================

/** Extract statusCode from AI SDK APICallError or similar error shapes. */
function getStatusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (typeof e['statusCode'] === 'number') return e['statusCode'];
    if (typeof e['status'] === 'number') return e['status'];
  }
  return undefined;
}

/** Extract response headers from AI SDK APICallError. */
function getResponseHeaders(error: unknown): Record<string, string> | undefined {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    const headers = e['responseHeaders'] ?? e['headers'];
    if (headers && typeof headers === 'object') {
      return headers as Record<string, string>;
    }
  }
  return undefined;
}

/** Parse retry-after header value (seconds or date) into milliseconds. */
function parseRetryAfter(headers?: Record<string, string>): number | undefined {
  if (!headers) return undefined;

  // Header names may be lowercase
  const value = headers['retry-after'] ?? headers['Retry-After'];
  if (!value) return undefined;

  // Try as seconds (e.g. "5")
  const seconds = Number(value);
  if (!isNaN(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }

  // Try as HTTP date (e.g. "Wed, 21 Oct 2015 07:28:00 GMT")
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    const ms = date.getTime() - Date.now();
    return ms > 0 ? Math.min(ms, MAX_RETRY_AFTER_MS) : undefined;
  }

  return undefined;
}
