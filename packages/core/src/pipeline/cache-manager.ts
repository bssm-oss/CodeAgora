/**
 * Pipeline Cache Manager
 * Handles cache lookup and persistence for pipeline results.
 */

import type { SessionManager } from '../session/manager.js';
import type { PipelineResult } from './orchestrator.js';
import { lookupCache, addToCache } from '@codeagora/shared/utils/cache.js';
import { CA_ROOT } from '@codeagora/shared/utils/fs.js';
import { computeHash } from '@codeagora/shared/utils/hash.js';
import fs from 'fs/promises';

/**
 * Compute a cache key from diff content and config.
 */
export function computeCacheKey(diffContent: string, config: unknown): string {
  return computeHash(diffContent + JSON.stringify(config));
}

/**
 * Check cache for an identical diff+config combo. Returns cached result or null.
 */
export async function checkAndLoadCache(
  cacheKey: string,
  session: SessionManager,
): Promise<PipelineResult | null> {
  try {
    const cachedSessionPath = await lookupCache(CA_ROOT, cacheKey);
    if (cachedSessionPath) {
      const [cachedDate, cachedId] = cachedSessionPath.split('/');
      if (cachedDate && cachedId) {
        const cachedResultPath = `${CA_ROOT}/sessions/${cachedDate}/${cachedId}/result.json`;
        const cachedRaw = await fs.readFile(cachedResultPath, 'utf-8');
        const cachedResult = JSON.parse(cachedRaw) as PipelineResult;
        await session.setStatus('completed');
        return { ...cachedResult, cached: true };
      }
    }
  } catch {
    // Cache miss or corrupt data — continue with fresh review
  }
  return null;
}

/**
 * Persist pipeline result to session dir and update cache index.
 */
export async function persistResultCache(
  date: string,
  sessionId: string,
  cacheKey: string,
  pipelineResult: PipelineResult,
  noCache: boolean,
): Promise<void> {
  try {
    const resultJsonPath = `${CA_ROOT}/sessions/${date}/${sessionId}/result.json`;
    await fs.writeFile(resultJsonPath, JSON.stringify(pipelineResult, null, 2), 'utf-8');
    if (!noCache) {
      await addToCache(CA_ROOT, cacheKey, `${date}/${sessionId}`);
    }
  } catch {
    // Cache write failure is non-fatal — pipeline result is still valid
  }
}
