/**
 * Shared utilities for notification modules.
 */

// ============================================================================
// Text helpers
// ============================================================================

/** Truncate text to `max` characters, appending '...' if trimmed. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}

// ============================================================================
// Retry / backoff
// ============================================================================

/** Base delay in ms for exponential backoff between retry attempts. */
const BACKOFF_BASE_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchWithRetryOptions {
  /** Maximum number of attempts (default: 3). */
  maxAttempts?: number;
  /** Timeout per individual fetch call in ms (default: 5000). */
  timeoutMs?: number;
  /** Label used in stderr log messages (e.g. hostname or description). */
  logLabel?: string;
}

/**
 * POST JSON to `url` with exponential backoff retries.
 *
 * - Retries on 5xx, 429, and network errors.
 * - Does NOT retry 4xx (except 429) since those are permanent failures.
 * - Logs to stderr on final failure; never throws.
 */
export async function fetchWithRetry(
  url: string,
  body: string,
  headers: Record<string, string>,
  options: FetchWithRetryOptions = {},
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 5000;
  const label = options.logLabel ?? (() => { try { return new URL(url).hostname; } catch { return '[invalid-url]'; } })();

  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) {
      await delay(BACKOFF_BASE_MS * Math.pow(2, i - 1)); // 1s, 2s, ...
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return;
      // Don't retry client errors (4xx) -- they will never succeed
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        process.stderr.write(`[codeagora] ${label} returned ${res.status}, not retrying\n`);
        return;
      }
      if (i === maxAttempts - 1) {
        process.stderr.write(`[codeagora] ${label} returned ${res.status}\n`);
      }
    } catch (err) {
      if (i === maxAttempts - 1) {
        process.stderr.write(
          `[codeagora] ${label} failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
  }
}
