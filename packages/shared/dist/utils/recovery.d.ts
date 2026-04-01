/**
 * Error Recovery & Retry Logic
 */
export interface RetryOptions {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    backoffFactor: number;
}
export declare const DEFAULT_RETRY_OPTIONS: RetryOptions;
/**
 * Retry with exponential backoff.
 *
 * @internal Not yet used in production paths. Preserved for future use in L1
 * retry logic where retryWithBackoff / retryOnError are directly applicable.
 */
export declare function retryWithBackoff<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T>;
/**
 * Retry only on specific error types
 */
export declare function retryOnError<T>(fn: () => Promise<T>, shouldRetry: (error: Error) => boolean, options?: Partial<RetryOptions>): Promise<T>;
/**
 * Check if error is retryable
 */
export declare function isRetryableError(error: Error): boolean;
//# sourceMappingURL=recovery.d.ts.map