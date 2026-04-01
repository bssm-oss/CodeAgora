/**
 * Hash Utility
 * Produces deterministic short hashes for cache key generation.
 */
/**
 * Compute a truncated SHA-256 hex digest of the given content.
 * Returns a 16-character hex string (64 bits — collision-safe for cache keys).
 */
export declare function computeHash(content: string): string;
//# sourceMappingURL=hash.d.ts.map