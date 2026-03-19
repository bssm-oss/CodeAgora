/**
 * Pipeline Chunk Parallelization Tests
 * Verifies adaptive serial/parallel chunk processing and concurrency limiting.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ============================================================================
// Mock all dependencies before importing orchestrator
// ============================================================================

vi.mock('../../packages/core/src/config/loader.js', () => ({
  loadConfig: vi.fn(),
  normalizeConfig: vi.fn(),
}));

vi.mock('../../packages/core/src/session/manager.js', () => ({
  SessionManager: {
    create: vi.fn(),
  },
}));

vi.mock('../../packages/core/src/l1/reviewer.js', () => ({
  executeReviewers: vi.fn(),
  checkForfeitThreshold: vi.fn(),
}));

vi.mock('../../packages/core/src/l1/writer.js', () => ({
  writeAllReviews: vi.fn(),
}));

vi.mock('../../packages/core/src/l2/threshold.js', () => ({
  applyThreshold: vi.fn(),
}));

vi.mock('../../packages/core/src/l2/moderator.js', () => ({
  runModerator: vi.fn(),
}));

vi.mock('../../packages/core/src/l2/writer.js', () => ({
  writeModeratorReport: vi.fn(),
  writeSuggestions: vi.fn(),
}));

vi.mock('../../packages/core/src/l2/deduplication.js', () => ({
  deduplicateDiscussions: vi.fn(),
}));

vi.mock('../../packages/core/src/l3/grouping.js', () => ({
  groupDiff: vi.fn(),
}));

vi.mock('../../packages/core/src/pipeline/chunker.js', () => ({
  chunkDiff: vi.fn(),
}));

vi.mock('../../packages/core/src/l3/verdict.js', () => ({
  makeHeadVerdict: vi.fn(),
  scanUnconfirmedQueue: vi.fn(),
}));

vi.mock('../../packages/core/src/l3/writer.js', () => ({
  writeHeadVerdict: vi.fn(),
}));

vi.mock('../../packages/core/src/l0/index.js', () => ({
  resolveReviewers: vi.fn(),
  getBanditStore: vi.fn(),
}));

vi.mock('../../packages/core/src/l0/quality-tracker.js', () => ({
  QualityTracker: vi.fn().mockImplementation(() => ({
    recordReviewerOutput: vi.fn(),
    recordDiscussionResults: vi.fn(),
    finalizeRewards: vi.fn().mockReturnValue(new Map()),
    getRecords: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../packages/shared/src/utils/diff.js', () => ({
  extractMultipleSnippets: vi.fn(),
}));

vi.mock('../../packages/shared/src/utils/logger.js', () => ({
  createLogger: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}));

// ============================================================================
// Imports
// ============================================================================

import { runPipeline } from '@codeagora/core/pipeline/orchestrator.js';
import { loadConfig, normalizeConfig } from '@codeagora/core/config/loader.js';
import { SessionManager } from '@codeagora/core/session/manager.js';
import { executeReviewers, checkForfeitThreshold } from '@codeagora/core/l1/reviewer.js';
import { writeAllReviews } from '@codeagora/core/l1/writer.js';
import { applyThreshold } from '@codeagora/core/l2/threshold.js';
import { runModerator } from '@codeagora/core/l2/moderator.js';
import { writeModeratorReport, writeSuggestions } from '@codeagora/core/l2/writer.js';
import { deduplicateDiscussions } from '@codeagora/core/l2/deduplication.js';
import { groupDiff } from '@codeagora/core/l3/grouping.js';
import { makeHeadVerdict, scanUnconfirmedQueue } from '@codeagora/core/l3/verdict.js';
import { writeHeadVerdict } from '@codeagora/core/l3/writer.js';
import { resolveReviewers, getBanditStore } from '@codeagora/core/l0/index.js';
import { extractMultipleSnippets } from '@codeagora/shared/utils/diff.js';
import { createLogger } from '@codeagora/shared/utils/logger.js';
import { chunkDiff } from '@codeagora/core/pipeline/chunker.js';
import fs from 'fs/promises';

// ============================================================================
// Helpers
// ============================================================================

const mockSession = {
  getDate: vi.fn().mockReturnValue('2026-03-16'),
  getSessionId: vi.fn().mockReturnValue('001'),
  setStatus: vi.fn().mockResolvedValue(undefined),
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
};

const mockConfig = {
  reviewers: [
    { id: 'r1', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
  ],
  supporters: { pool: [], pickCount: 2, pickStrategy: 'random', devilsAdvocate: { id: 'da', backend: 'codex', model: 'test', enabled: true, timeout: 120 }, personaPool: [], personaAssignment: 'random' },
  moderator: { backend: 'codex', model: 'test' },
  discussion: { maxRounds: 3, registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null }, codeSnippetRange: 10 },
  errorHandling: { maxRetries: 0, forfeitThreshold: 0.7 },
};

function makeChunk(index: number) {
  return { index, files: [`file${index}.ts`], diffContent: `diff-${index}`, estimatedTokens: 100 };
}

function makeReviewResult(reviewerId: string, group: string) {
  return {
    reviewerId,
    model: 'test',
    group,
    evidenceDocs: [],
    rawResponse: 'No issues',
    status: 'success' as const,
  };
}

function setupBaseMocks() {
  (loadConfig as Mock).mockResolvedValue(mockConfig);
  (normalizeConfig as Mock).mockReturnValue(mockConfig);
  (SessionManager.create as Mock).mockResolvedValue(mockSession);
  (fs.readFile as Mock).mockResolvedValue('diff content');
  (groupDiff as Mock).mockReturnValue([
    { name: 'root', files: ['test.ts'], diffContent: 'diff', prSummary: 'Changes' },
  ]);
  (resolveReviewers as Mock).mockResolvedValue({
    reviewerInputs: [{ config: mockConfig.reviewers[0], groupName: 'root', diffContent: 'diff', prSummary: 'Changes' }],
    autoCount: 0,
  });
  (executeReviewers as Mock).mockResolvedValue([makeReviewResult('r1', 'root')]);
  (checkForfeitThreshold as Mock).mockReturnValue({ passed: true, forfeitRate: 0 });
  (writeAllReviews as Mock).mockResolvedValue([]);
  (applyThreshold as Mock).mockReturnValue({ discussions: [], unconfirmed: [], suggestions: [] });
  (deduplicateDiscussions as Mock).mockReturnValue({ deduplicated: [], mergedCount: 0 });
  (extractMultipleSnippets as Mock).mockReturnValue(new Map());
  (runModerator as Mock).mockResolvedValue({
    discussions: [], unconfirmedIssues: [], suggestions: [],
    summary: { totalDiscussions: 0, resolved: 0, escalated: 0 },
  });
  (writeModeratorReport as Mock).mockResolvedValue(undefined);
  (writeSuggestions as Mock).mockResolvedValue(undefined);
  (scanUnconfirmedQueue as Mock).mockReturnValue({ promoted: [], dismissed: [] });
  (makeHeadVerdict as Mock).mockReturnValue({ decision: 'ACCEPT', reasoning: 'OK' });
  (writeHeadVerdict as Mock).mockResolvedValue(undefined);
  (getBanditStore as Mock).mockReturnValue(null);
  (createLogger as Mock).mockReturnValue(mockLogger);

  mockSession.setStatus.mockClear();
  mockLogger.flush.mockClear();
}

// ============================================================================
// Tests
// ============================================================================

describe('Chunk Parallelization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBaseMocks();
  });

  // --------------------------------------------------------------------------
  // Adaptive threshold: serial for ≤2 chunks
  // --------------------------------------------------------------------------
  it('processes 1 chunk serially', async () => {
    (chunkDiff as Mock).mockReturnValue([makeChunk(0)]);

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('success');
    expect(executeReviewers).toHaveBeenCalledTimes(1);
  });

  it('processes 2 chunks serially', async () => {
    (chunkDiff as Mock).mockReturnValue([makeChunk(0), makeChunk(1)]);

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('success');
    expect(executeReviewers).toHaveBeenCalledTimes(2);
  });

  // --------------------------------------------------------------------------
  // Adaptive threshold: parallel for >2 chunks
  // --------------------------------------------------------------------------
  it('processes 3+ chunks in parallel and collects all results', async () => {
    const chunks = [makeChunk(0), makeChunk(1), makeChunk(2), makeChunk(3)];
    (chunkDiff as Mock).mockReturnValue(chunks);

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('success');
    // All 4 chunks should be processed
    expect(executeReviewers).toHaveBeenCalledTimes(4);
  });

  // --------------------------------------------------------------------------
  // Concurrency limiting: max 3 concurrent
  // --------------------------------------------------------------------------
  it('limits concurrent chunk processing to 3', async () => {
    const chunks = [makeChunk(0), makeChunk(1), makeChunk(2), makeChunk(3), makeChunk(4)];
    (chunkDiff as Mock).mockReturnValue(chunks);

    let peakConcurrency = 0;
    let currentConcurrency = 0;

    (executeReviewers as Mock).mockImplementation(async () => {
      currentConcurrency++;
      if (currentConcurrency > peakConcurrency) {
        peakConcurrency = currentConcurrency;
      }
      // Simulate async work
      await new Promise((r) => setTimeout(r, 50));
      currentConcurrency--;
      return [makeReviewResult('r1', 'root')];
    });

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('success');
    expect(executeReviewers).toHaveBeenCalledTimes(5);
    // Peak concurrency should be capped at 3
    expect(peakConcurrency).toBeLessThanOrEqual(3);
    expect(peakConcurrency).toBeGreaterThan(1); // actually ran in parallel
  });

  // --------------------------------------------------------------------------
  // Partial failure: rejected chunks are skipped
  // --------------------------------------------------------------------------
  it('skips rejected chunks without aborting the pipeline', async () => {
    const chunks = [makeChunk(0), makeChunk(1), makeChunk(2)];
    (chunkDiff as Mock).mockReturnValue(chunks);

    let callIdx = 0;
    (executeReviewers as Mock).mockImplementation(async () => {
      callIdx++;
      if (callIdx === 2) throw new Error('chunk 1 failed');
      return [makeReviewResult('r1', 'root')];
    });

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('success');
    // 3 chunks attempted, 1 failed, 2 succeeded
    expect(executeReviewers).toHaveBeenCalledTimes(3);
  });

  // --------------------------------------------------------------------------
  // Forfeit: chunks that fail forfeit check return null
  // --------------------------------------------------------------------------
  it('skips forfeited chunks in parallel mode', async () => {
    const chunks = [makeChunk(0), makeChunk(1), makeChunk(2)];
    (chunkDiff as Mock).mockReturnValue(chunks);

    let callIdx = 0;
    (checkForfeitThreshold as Mock).mockImplementation(() => {
      callIdx++;
      // Chunk 1 (second call) fails forfeit
      return { passed: callIdx !== 2, forfeitRate: callIdx === 2 ? 0.9 : 0 };
    });

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('success');
    expect(executeReviewers).toHaveBeenCalledTimes(3);
  });

  // --------------------------------------------------------------------------
  // chunkIndex tagging works in parallel mode
  // --------------------------------------------------------------------------
  it('tags chunkIndex correctly on parallel results', async () => {
    const chunks = [makeChunk(0), makeChunk(1), makeChunk(2)];
    (chunkDiff as Mock).mockReturnValue(chunks);

    const capturedResults: Array<ReturnType<typeof makeReviewResult>[]> = [];
    (executeReviewers as Mock).mockImplementation(async () => {
      const results = [makeReviewResult('r1', 'root')];
      capturedResults.push(results);
      return results;
    });

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('success');
    // Each result should have its chunkIndex set (since chunks.length > 1)
    for (const batch of capturedResults) {
      for (const r of batch) {
        expect((r as Record<string, unknown>).chunkIndex).toBeDefined();
      }
    }
  });

  // --------------------------------------------------------------------------
  // All chunks forfeit → error
  // --------------------------------------------------------------------------
  it('returns error when all parallel chunks forfeit', async () => {
    const chunks = [makeChunk(0), makeChunk(1), makeChunk(2)];
    (chunkDiff as Mock).mockReturnValue(chunks);

    (checkForfeitThreshold as Mock).mockReturnValue({ passed: false, forfeitRate: 0.9 });

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('error');
    expect(result.error).toContain('All review chunks failed');
  });
});
