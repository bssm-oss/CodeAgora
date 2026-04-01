/**
 * Cache Index
 * Manages .ca/cache-index.json for review result caching.
 * LRU eviction at MAX_ENTRIES to prevent unbounded growth.
 */
import fs from 'fs/promises';
import path from 'path';
// ============================================================================
// Constants
// ============================================================================
const CACHE_INDEX_FILE = 'cache-index.json';
const MAX_ENTRIES = 100;
// ============================================================================
// Cache Operations
// ============================================================================
/**
 * Read the cache index from .ca/cache-index.json.
 * Returns an empty index if the file is missing or corrupt.
 */
export async function readCacheIndex(caRoot) {
    const indexPath = path.join(caRoot, CACHE_INDEX_FILE);
    try {
        const raw = await fs.readFile(indexPath, 'utf-8');
        const parsed = JSON.parse(raw);
        // Basic validation: must be a plain object
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return {};
        }
        return parsed;
    }
    catch {
        // File missing, unreadable, or invalid JSON — treat as empty
        return {};
    }
}
/**
 * Write the cache index to .ca/cache-index.json.
 */
export async function writeCacheIndex(caRoot, index) {
    const indexPath = path.join(caRoot, CACHE_INDEX_FILE);
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}
/**
 * Look up a cache key.
 * Returns the cached session path if found, null otherwise.
 */
export async function lookupCache(caRoot, cacheKey) {
    const index = await readCacheIndex(caRoot);
    const entry = index[cacheKey];
    if (!entry)
        return null;
    // Verify the session directory still exists
    try {
        await fs.access(path.join(caRoot, 'sessions', ...entry.sessionPath.split('/')));
        return entry.sessionPath;
    }
    catch {
        // Session directory was deleted — remove stale entry
        delete index[cacheKey];
        await writeCacheIndex(caRoot, index).catch(() => { });
        return null;
    }
}
/**
 * Add an entry to the cache index.
 * Enforces LRU eviction when the index exceeds MAX_ENTRIES.
 */
export async function addToCache(caRoot, cacheKey, sessionPath) {
    const index = await readCacheIndex(caRoot);
    // Add or update entry
    index[cacheKey] = {
        sessionPath,
        timestamp: Date.now(),
    };
    // LRU eviction: remove oldest entries beyond MAX_ENTRIES
    const keys = Object.keys(index);
    if (keys.length > MAX_ENTRIES) {
        const sorted = keys.sort((a, b) => (index[a].timestamp) - (index[b].timestamp));
        const toEvict = sorted.slice(0, keys.length - MAX_ENTRIES);
        for (const key of toEvict) {
            delete index[key];
        }
    }
    await writeCacheIndex(caRoot, index);
}
