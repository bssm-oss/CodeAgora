/**
 * Session Metadata type
 */

import type { SessionArtifactSchemaVersion } from '../contracts/stable.js';
import type { CacheMetadata } from '../utils/cache.js';

export interface SessionMetadata {
  /** Persisted artifact contract marker. Missing means legacy/best-effort. */
  schemaVersion?: SessionArtifactSchemaVersion;
  sessionId: string; // 001, 002, etc.
  date: string; // YYYY-MM-DD
  timestamp: number;
  diffPath: string;
  status: 'in_progress' | 'completed' | 'failed' | 'interrupted';
  startedAt: number;
  completedAt?: number;
  /** Files included in review after all ignore filters are applied */
  includedFiles?: string[];
  /** Files excluded from review by chunking/ignore logic */
  excludedFiles?: string[];
  /** Diff filtering breakdown by category */
  diffChunking?: {
    excludedByBuiltinPatterns: string[];
    excludedByReviewIgnorePatterns: string[];
    excludedByContextIgnorePatterns: string[];
    priorityFiles?: string[];
    oversizedHunks?: Array<{
      filePath: string;
      hunkHeader: string;
      estimatedTokens: number;
      priority: 'security' | 'normal';
    }>;
    tokenBudgetDecisions?: string[];
  };
  /** SHA-256 prefix of the diff content (cache key component) */
  diffHash?: string;
  /** SHA-256 prefix of the reviewer config (cache key component) */
  configHash?: string;
  /** Machine-readable cache lookup/write metadata. No raw config, providers, or source context. */
  cache?: CacheMetadata;
}
