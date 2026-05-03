/**
 * Pipeline Cache Tests (#109)
 * Covers: computeHash, cache index CRUD, LRU eviction, cache key semantics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { computeHash } from '@codeagora/shared/utils/hash.js';
import {
  readCacheIndex,
  writeCacheIndex,
  lookupCache,
  addToCache,
  type CacheIndex,
} from '@codeagora/shared/utils/cache.js';
import { CACHE_METADATA_SCHEMA_VERSION } from '@codeagora/shared/contracts/stable.js';

// ============================================================================
// Test Helpers
// ============================================================================

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ca-cache-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// computeHash
// ============================================================================

describe('computeHash', () => {
  it('produces a consistent 16-char hex string', () => {
    const hash = computeHash('hello world');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    // Same input → same output
    expect(computeHash('hello world')).toBe(hash);
  });

  it('produces different hashes for different inputs', () => {
    const a = computeHash('input-a');
    const b = computeHash('input-b');
    expect(a).not.toBe(b);
  });

  it('handles empty string', () => {
    const hash = computeHash('');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('handles large input', () => {
    const large = 'x'.repeat(100_000);
    const hash = computeHash(large);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ============================================================================
// Cache Index Read/Write
// ============================================================================

describe('readCacheIndex', () => {
  it('returns empty object when file does not exist', async () => {
    const index = await readCacheIndex(tmpDir);
    expect(index).toEqual({});
  });

  it('returns empty object for corrupt JSON', async () => {
    await fs.writeFile(path.join(tmpDir, 'cache-index.json'), 'not valid json', 'utf-8');
    const index = await readCacheIndex(tmpDir);
    expect(index).toEqual({});
  });

  it('returns empty object for non-object JSON (array)', async () => {
    await fs.writeFile(path.join(tmpDir, 'cache-index.json'), '[]', 'utf-8');
    const index = await readCacheIndex(tmpDir);
    expect(index).toEqual({});
  });

  it('returns empty object for null JSON', async () => {
    await fs.writeFile(path.join(tmpDir, 'cache-index.json'), 'null', 'utf-8');
    const index = await readCacheIndex(tmpDir);
    expect(index).toEqual({});
  });
});

describe('writeCacheIndex', () => {
  it('writes and reads back the same data', async () => {
    const index: CacheIndex = {
      abc123: { sessionPath: '2026-03-20/001', timestamp: 1000 },
      def456: { sessionPath: '2026-03-20/002', timestamp: 2000 },
    };

    await writeCacheIndex(tmpDir, index);
    const result = await readCacheIndex(tmpDir);
    expect(result).toEqual(index);
  });
});

// ============================================================================
// lookupCache
// ============================================================================

describe('lookupCache', () => {
  it('returns null for a missing key', async () => {
    const result = await lookupCache(tmpDir, 'nonexistent-key');
    expect(result).toBeNull();
  });

  it('returns sessionPath for an existing key with valid session dir', async () => {
    // Create the session directory so the existence check passes
    const sessionDir = path.join(tmpDir, 'sessions', '2026-03-20', '001');
    await fs.mkdir(sessionDir, { recursive: true });

    const index: CacheIndex = {
      'my-key': { sessionPath: '2026-03-20/001', timestamp: Date.now() },
    };
    await writeCacheIndex(tmpDir, index);

    const result = await lookupCache(tmpDir, 'my-key');
    expect(result).toBe('2026-03-20/001');
  });

  it('returns null and cleans up when session dir is missing', async () => {
    // Write an entry pointing to a non-existent session
    const index: CacheIndex = {
      'stale-key': { sessionPath: '2025-01-01/999', timestamp: Date.now() },
    };
    await writeCacheIndex(tmpDir, index);

    const result = await lookupCache(tmpDir, 'stale-key');
    expect(result).toBeNull();

    // Entry should have been removed from the index
    const updatedIndex = await readCacheIndex(tmpDir);
    expect(updatedIndex['stale-key']).toBeUndefined();
  });
});

// ============================================================================
// addToCache
// ============================================================================

describe('stable cache metadata contract', () => {
  it('declares a versioned cache metadata schema marker', () => {
    expect(CACHE_METADATA_SCHEMA_VERSION).toBe('codeagora.cache.v1');
  });
});

// ============================================================================
// addToCache
// ============================================================================

describe('addToCache', () => {
  it('adds a new entry', async () => {
    await addToCache(tmpDir, 'key1', '2026-03-20/001');
    const index = await readCacheIndex(tmpDir);
    expect(index['key1']).toBeDefined();
    expect(index['key1']!.sessionPath).toBe('2026-03-20/001');
    expect(index['key1']!.timestamp).toBeGreaterThan(0);
  });

  it('overwrites an existing entry', async () => {
    await addToCache(tmpDir, 'key1', '2026-03-20/001');
    await addToCache(tmpDir, 'key1', '2026-03-20/002');
    const index = await readCacheIndex(tmpDir);
    expect(index['key1']!.sessionPath).toBe('2026-03-20/002');
  });

  it('evicts oldest entries when exceeding 100', async () => {
    // Pre-populate with 100 entries (timestamps 1..100)
    const index: CacheIndex = {};
    for (let i = 1; i <= 100; i++) {
      index[`key-${i}`] = { sessionPath: `2026-03-20/${String(i).padStart(3, '0')}`, timestamp: i };
    }
    await writeCacheIndex(tmpDir, index);

    // Add one more — should evict the oldest (timestamp=1)
    await addToCache(tmpDir, 'key-new', '2026-03-21/001');
    const result = await readCacheIndex(tmpDir);

    expect(Object.keys(result)).toHaveLength(100);
    expect(result['key-1']).toBeUndefined(); // oldest evicted
    expect(result['key-new']).toBeDefined(); // new entry present
    expect(result['key-2']).toBeDefined();   // second-oldest kept
  });

  it('evicts multiple entries when well over 100', async () => {
    // Pre-populate with 102 entries
    const index: CacheIndex = {};
    for (let i = 1; i <= 102; i++) {
      index[`key-${i}`] = { sessionPath: `2026-03-20/${String(i).padStart(3, '0')}`, timestamp: i };
    }
    await writeCacheIndex(tmpDir, index);

    // Add another — total would be 103, should evict 3 oldest
    await addToCache(tmpDir, 'key-extra', '2026-03-21/001');
    const result = await readCacheIndex(tmpDir);

    expect(Object.keys(result)).toHaveLength(100);
    expect(result['key-1']).toBeUndefined();
    expect(result['key-2']).toBeUndefined();
    expect(result['key-3']).toBeUndefined();
    expect(result['key-4']).toBeDefined();
    expect(result['key-extra']).toBeDefined();
  });
});

// ============================================================================
// Cache Key Semantics
// ============================================================================

describe('cache key semantics', () => {
  const diff1 = 'diff --git a/foo.ts b/foo.ts\n+const x = 1;\n';
  const diff2 = 'diff --git a/bar.ts b/bar.ts\n+const y = 2;\n';
  const config1 = JSON.stringify([{ id: 'r1', provider: 'groq', model: 'llama-3' }]);
  const config2 = JSON.stringify([{ id: 'r2', provider: 'openai', model: 'gpt-4o' }]);

  it('same diff + same config → same cacheKey', () => {
    const key1 = computeHash(diff1 + config1);
    const key2 = computeHash(diff1 + config1);
    expect(key1).toBe(key2);
  });

  it('same diff + different config → different cacheKey', () => {
    const key1 = computeHash(diff1 + config1);
    const key2 = computeHash(diff1 + config2);
    expect(key1).not.toBe(key2);
  });

  it('different diff + same config → different cacheKey', () => {
    const key1 = computeHash(diff1 + config1);
    const key2 = computeHash(diff2 + config1);
    expect(key1).not.toBe(key2);
  });

  it('different diff + different config → different cacheKey', () => {
    const key1 = computeHash(diff1 + config1);
    const key2 = computeHash(diff2 + config2);
    expect(key1).not.toBe(key2);
  });
});
