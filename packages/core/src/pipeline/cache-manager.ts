/**
 * Pipeline Cache Manager
 * Handles cache lookup and persistence for pipeline results.
 */

import type { SessionManager } from '../session/manager.js';
import type { PipelineResult } from './orchestrator.js';
import { lookupCache, addToCache, type CacheMetadata } from '@codeagora/shared/utils/cache.js';
import { getCaRoot } from '@codeagora/shared/utils/fs.js';
import { computeHash } from '@codeagora/shared/utils/hash.js';
import { redactDeep } from '@codeagora/shared/utils/redaction.js';
import { CACHE_METADATA_SCHEMA_VERSION, SESSION_ARTIFACT_SCHEMA_VERSION } from '@codeagora/shared/contracts/stable.js';
import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

export const REVIEW_CACHE_ANALYZERS = {
  'artifact-filter': 'artifact-filter:v1',
  'reviewignore-filter': 'reviewignore-filter:v1',
  'diff-classifier': 'diff-classifier:v1',
  'tsc-diagnostics': 'tsc-diagnostics:v1',
  'impact-analyzer': 'impact-analyzer:v1',
  'external-rules': 'external-rules:v1',
  'path-rules': 'path-rules:v1',
  'custom-review-rules': 'custom-review-rules:v1',
  'learned-suppressions': 'learned-suppressions:v1',
  'surrounding-context': 'surrounding-context:v1',
} as const;

export interface ReviewCacheFileHash {
  path: string;
  hash: string;
}

export interface ReviewCacheLearnedSuppression {
  pattern: string;
  severity: string;
  action: 'downgrade' | 'suppress';
}

export interface ReviewCacheContext {
  schemaVersion: typeof CACHE_METADATA_SCHEMA_VERSION;
  codeagoraVersion: string;
  analyzerVersions: Record<string, string>;
  reviewIgnore: ReviewCacheFileHash | null;
  reviewRules: ReviewCacheFileHash[];
  learnedSuppressions: ReviewCacheLearnedSuppression[];
  surroundingContextHash: string | null;
}

interface BuildReviewCacheContextOptions {
  repoPath?: string;
  surroundingContext?: string;
}

const REVIEW_RULE_FILENAMES = ['.reviewrules', '.reviewrules.yml', '.reviewrules.yaml'] as const;
const PACKAGE_VERSION_FALLBACK = 'unknown';
const requirePackageJson = createRequire(import.meta.url);

type CacheSession = Pick<SessionManager, 'setStatus' | 'setMetadata'> & Partial<Pick<SessionManager, 'getDate' | 'getSessionId'>>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}

async function readOptionalFileHash(root: string, relativePath: string): Promise<ReviewCacheFileHash | null> {
  try {
    const content = await fs.readFile(path.join(root, relativePath), 'utf-8');
    return { path: relativePath, hash: computeHash(content) };
  } catch {
    return null;
  }
}

async function readReviewRules(root: string): Promise<ReviewCacheFileHash[]> {
  const files = await Promise.all(
    REVIEW_RULE_FILENAMES.map((filename) => readOptionalFileHash(root, filename)),
  );
  return files.filter((file): file is ReviewCacheFileHash => file !== null);
}

function normalizeLearnedSuppressions(raw: unknown): ReviewCacheLearnedSuppression[] {
  if (!isPlainRecord(raw) || !Array.isArray(raw['dismissedPatterns'])) {
    return [];
  }

  return raw['dismissedPatterns']
    .flatMap((entry): ReviewCacheLearnedSuppression[] => {
      if (!isPlainRecord(entry)) return [];
      const pattern = entry['pattern'];
      const severity = entry['severity'];
      const action = entry['action'];
      if (typeof pattern !== 'string' || typeof severity !== 'string') return [];
      if (action !== 'downgrade' && action !== 'suppress') return [];
      return [{ pattern, severity, action }];
    })
    .sort((a, b) => {
      const byPattern = a.pattern.localeCompare(b.pattern);
      if (byPattern !== 0) return byPattern;
      const bySeverity = a.severity.localeCompare(b.severity);
      if (bySeverity !== 0) return bySeverity;
      return a.action.localeCompare(b.action);
    });
}

async function readLearnedSuppressions(root: string): Promise<ReviewCacheLearnedSuppression[]> {
  try {
    const content = await fs.readFile(path.join(root, '.ca', 'learned-patterns.json'), 'utf-8');
    return normalizeLearnedSuppressions(JSON.parse(content));
  } catch {
    return [];
  }
}

function readCodeAgoraVersion(): string {
  try {
    const parsed = requirePackageJson('../../../../package.json') as unknown;
    if (isPlainRecord(parsed) && typeof parsed['version'] === 'string') {
      return parsed['version'];
    }
  } catch {
    // Fall through to the explicit unknown marker.
  }

  return PACKAGE_VERSION_FALLBACK;
}

export async function buildReviewCacheContext(
  options: BuildReviewCacheContextOptions = {},
): Promise<ReviewCacheContext> {
  const repositoryInputs = options.repoPath
    ? await Promise.all([
        readOptionalFileHash(options.repoPath, '.reviewignore'),
        readReviewRules(options.repoPath),
        readLearnedSuppressions(options.repoPath),
      ])
    : [null, [], []] satisfies [ReviewCacheFileHash | null, ReviewCacheFileHash[], ReviewCacheLearnedSuppression[]];
  const [reviewIgnore, reviewRules, learnedSuppressions] = repositoryInputs;

  return {
    schemaVersion: CACHE_METADATA_SCHEMA_VERSION,
    codeagoraVersion: readCodeAgoraVersion(),
    analyzerVersions: REVIEW_CACHE_ANALYZERS,
    reviewIgnore,
    reviewRules,
    learnedSuppressions,
    surroundingContextHash: options.surroundingContext ? computeHash(options.surroundingContext) : null,
  };
}

/**
 * Compute a cache key from all review-meaning inputs.
 */
export function computeCacheKey(
  diffContent: string,
  config: unknown,
  context?: ReviewCacheContext,
): string {
  const redactedConfig = redactDeep(config);
  const keyMaterial = {
    schemaVersion: CACHE_METADATA_SCHEMA_VERSION,
    diffHash: computeHash(diffContent),
    configHash: computeHash(stableStringify(redactedConfig)),
    context: context ?? null,
  };
  return computeHash(stableStringify(keyMaterial));
}

export async function writeSessionResult(
  date: string,
  sessionId: string,
  pipelineResult: PipelineResult,
): Promise<void> {
  const caRoot = getCaRoot();
  const resultJsonPath = path.join(caRoot, 'sessions', date, sessionId, 'result.json');
  await fs.writeFile(
    resultJsonPath,
    JSON.stringify(redactDeep({ ...pipelineResult, schemaVersion: SESSION_ARTIFACT_SCHEMA_VERSION }), null, 2),
    'utf-8',
  );
}

function buildCacheMetadata(cacheKey: string, sourceSessionPath?: string): CacheMetadata {
  return {
    schemaVersion: CACHE_METADATA_SCHEMA_VERSION,
    key: cacheKey,
    hit: sourceSessionPath !== undefined,
    ...(sourceSessionPath ? { sourceSessionPath } : {}),
  };
}

/**
 * Check cache for an identical review-context combo. Returns cached result or null.
 */
export async function checkAndLoadCache(
  cacheKey: string,
  session: CacheSession,
): Promise<PipelineResult | null> {
  try {
    const caRoot = getCaRoot();
    const cachedSessionPath = await lookupCache(caRoot, cacheKey);
    if (cachedSessionPath) {
      const [cachedDate, cachedId] = cachedSessionPath.split('/');
      if (cachedDate && cachedId) {
        const cachedResultPath = path.join(caRoot, 'sessions', cachedDate, cachedId, 'result.json');
        const cachedRaw = await fs.readFile(cachedResultPath, 'utf-8');
        const cachedResult = JSON.parse(cachedRaw) as PipelineResult;
        const cache = buildCacheMetadata(cacheKey, cachedSessionPath);
        const result = {
          ...cachedResult,
          schemaVersion: SESSION_ARTIFACT_SCHEMA_VERSION,
          cached: true,
          cache,
        };
        await session.setMetadata({ cache });
        if (session.getDate && session.getSessionId) {
          await writeSessionResult(session.getDate(), session.getSessionId(), result);
        }
        await session.setStatus('completed');
        return result;
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
    const caRoot = getCaRoot();
    const cache = buildCacheMetadata(cacheKey);
    await writeSessionResult(date, sessionId, { ...pipelineResult, cache });
    if (!noCache) {
      await addToCache(caRoot, cacheKey, `${date}/${sessionId}`);
    }
  } catch {
    // Cache write failure is non-fatal — pipeline result is still valid
  }
}
