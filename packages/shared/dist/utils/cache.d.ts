/**
 * Cache Index
 * Manages .ca/cache-index.json for review result caching.
 * LRU eviction at MAX_ENTRIES to prevent unbounded growth.
 */
export interface CacheEntry {
    sessionPath: string;
    timestamp: number;
}
export interface CacheIndex {
    [cacheKey: string]: CacheEntry;
}
/**
 * Read the cache index from .ca/cache-index.json.
 * Returns an empty index if the file is missing or corrupt.
 */
export declare function readCacheIndex(caRoot: string): Promise<CacheIndex>;
/**
 * Write the cache index to .ca/cache-index.json.
 */
export declare function writeCacheIndex(caRoot: string, index: CacheIndex): Promise<void>;
/**
 * Look up a cache key.
 * Returns the cached session path if found, null otherwise.
 */
export declare function lookupCache(caRoot: string, cacheKey: string): Promise<string | null>;
/**
 * Add an entry to the cache index.
 * Enforces LRU eviction when the index exceeds MAX_ENTRIES.
 */
export declare function addToCache(caRoot: string, cacheKey: string, sessionPath: string): Promise<void>;
//# sourceMappingURL=cache.d.ts.map