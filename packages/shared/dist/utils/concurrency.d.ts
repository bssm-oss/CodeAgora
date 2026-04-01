/**
 * Lightweight concurrency limiter (like p-limit, no external dependency).
 *
 * Usage:
 *   const limit = pLimit(3);
 *   const results = await Promise.allSettled(
 *     tasks.map(t => limit(() => processTask(t)))
 *   );
 */
export declare function pLimit(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T>;
//# sourceMappingURL=concurrency.d.ts.map