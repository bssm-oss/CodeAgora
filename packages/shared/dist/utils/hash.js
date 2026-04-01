/**
 * Hash Utility
 * Produces deterministic short hashes for cache key generation.
 */
import { createHash } from 'crypto';
/**
 * Compute a truncated SHA-256 hex digest of the given content.
 * Returns a 16-character hex string (64 bits — collision-safe for cache keys).
 */
export function computeHash(content) {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
