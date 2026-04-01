/**
 * Error Recovery & Retry Logic
 */
export const DEFAULT_RETRY_OPTIONS = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
};
/**
 * Retry with exponential backoff.
 *
 * @internal Not yet used in production paths. Preserved for future use in L1
 * retry logic where retryWithBackoff / retryOnError are directly applicable.
 */
export async function retryWithBackoff(fn, options = {}) {
    const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError;
    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < opts.maxRetries) {
                const delay = calculateBackoffDelay(attempt, opts);
                await sleep(delay);
            }
        }
    }
    throw lastError || new Error('Retry failed with unknown error');
}
function calculateBackoffDelay(attempt, options) {
    const delay = options.baseDelay * Math.pow(options.backoffFactor, attempt);
    return Math.min(delay, options.maxDelay);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Retry only on specific error types
 */
export async function retryOnError(fn, shouldRetry, options = {}) {
    const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError;
    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            lastError = err;
            if (!shouldRetry(err) || attempt >= opts.maxRetries) {
                throw err;
            }
            const delay = calculateBackoffDelay(attempt, opts);
            await sleep(delay);
        }
    }
    throw lastError || new Error('Retry failed');
}
/**
 * Check if error is retryable
 */
export function isRetryableError(error) {
    const retryablePatterns = [
        /timeout/i,
        /ETIMEDOUT/i,
        /ECONNREFUSED/i,
        /ENOTFOUND/i,
        /socket hang up/i,
        /network/i,
        /rate limit/i,
    ];
    return retryablePatterns.some((pattern) => pattern.test(error.message));
}
