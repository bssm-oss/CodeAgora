/**
 * Critical Core Error Scenario Tests — Part 2: Orchestrator (mocked fs)
 *
 * Covers:
 *   ORCH-01 — all reviewers fail → error return
 *   ORCH-02 — forfeitThreshold=0.5, partial failure continues
 *   ORCH-03 — loadReviewRules throw doesn't crash pipeline
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ============================================================================
// All mocks must be declared before imports (vi.mock is hoisted)
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
  estimateTokens: vi.fn().mockReturnValue(100),
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
  extractFileListFromDiff: vi.fn().mockReturnValue([]),
  parseDiffFileRanges: vi.fn().mockReturnValue([]),
  readSurroundingContext: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../packages/shared/src/utils/logger.js', () => ({
  createLogger: vi.fn(),
}));

vi.mock('../../packages/core/src/rules/loader.js', () => ({
  loadReviewRules: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../packages/core/src/learning/store.js', () => ({
  loadLearnedPatterns: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../packages/core/src/learning/filter.js', () => ({
  applyLearnedPatterns: vi.fn().mockImplementation((docs: unknown[]) => ({
    filtered: docs,
    suppressed: [],
  })),
}));

vi.mock('../../packages/shared/src/utils/hash.js', () => ({
  computeHash: vi.fn().mockReturnValue('test-hash'),
}));

vi.mock('../../packages/shared/src/utils/cache.js', () => ({
  lookupCache: vi.fn().mockResolvedValue(null),
  addToCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../packages/core/src/config/credentials.js', () => ({
  loadCredentials: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { runPipeline } from '@codeagora/core/pipeline/orchestrator.js';
import { loadConfig, normalizeConfig } from '@codeagora/core/config/loader.js';
import { SessionManager } from '@codeagora/core/session/manager.js';
import { executeReviewers, checkForfeitThreshold } from '@codeagora/core/l1/reviewer.js';
import { applyThreshold } from '@codeagora/core/l2/threshold.js';
import { runModerator } from '@codeagora/core/l2/moderator.js';
import { writeModeratorReport, writeSuggestions } from '@codeagora/core/l2/writer.js';
import { deduplicateDiscussions } from '@codeagora/core/l2/deduplication.js';
import { groupDiff } from '@codeagora/core/l3/grouping.js';
import { makeHeadVerdict, scanUnconfirmedQueue } from '@codeagora/core/l3/verdict.js';
import { writeHeadVerdict } from '@codeagora/core/l3/writer.js';
import { resolveReviewers, getBanditStore } from '@codeagora/core/l0/index.js';
import { writeAllReviews } from '@codeagora/core/l1/writer.js';
import { extractMultipleSnippets } from '@codeagora/shared/utils/diff.js';
import { createLogger } from '@codeagora/shared/utils/logger.js';
import { chunkDiff } from '@codeagora/core/pipeline/chunker.js';
import { loadReviewRules } from '@codeagora/core/rules/loader.js';
import fsMock from 'fs/promises';

// ============================================================================
// Shared helpers
// ============================================================================

const mockSession = {
  getDate: vi.fn().mockReturnValue('2026-01-15'),
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
    { id: 'r2', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
    { id: 'r3', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
    { id: 'r4', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
    { id: 'r5', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
  ],
  supporters: {
    pool: [],
    pickCount: 2,
    pickStrategy: 'random',
    devilsAdvocate: { id: 'da', backend: 'codex', model: 'test', enabled: false, timeout: 120 },
    personaPool: [],
    personaAssignment: 'random',
  },
  moderator: { backend: 'codex', model: 'test' },
  discussion: {
    maxRounds: 3,
    registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
    codeSnippetRange: 10,
  },
  errorHandling: { maxRetries: 2, forfeitThreshold: 0.5 },
};

const makeReviewResult = (id: string, status: 'success' | 'forfeit' = 'success') => ({
  reviewerId: id,
  model: 'test',
  group: 'root',
  evidenceDocs: [],
  rawResponse: '',
  status,
});

const mockModeratorReport = {
  discussions: [],
  roundsPerDiscussion: {},
  unconfirmedIssues: [],
  suggestions: [],
  summary: { totalDiscussions: 0, resolved: 0, escalated: 0 },
};

function setupMocks() {
  (loadConfig as Mock).mockResolvedValue(mockConfig);
  (normalizeConfig as Mock).mockReturnValue(mockConfig);
  (SessionManager.create as Mock).mockResolvedValue(mockSession);
  (fsMock.readFile as Mock).mockResolvedValue('diff content');
  (fsMock.writeFile as Mock).mockResolvedValue(undefined);
  (chunkDiff as Mock).mockReturnValue([
    { index: 0, files: ['main.ts'], diffContent: 'diff content', estimatedTokens: 100 },
  ]);
  (groupDiff as Mock).mockReturnValue([
    { name: 'root', files: ['main.ts'], diffContent: 'diff content', prSummary: 'root' },
  ]);
  (resolveReviewers as Mock).mockResolvedValue({
    reviewerInputs: mockConfig.reviewers.map((r) => ({
      config: r,
      groupName: 'root',
      diffContent: 'diff content',
      prSummary: 'root',
    })),
    autoCount: 0,
  });
  (executeReviewers as Mock).mockResolvedValue(
    mockConfig.reviewers.map((r) => makeReviewResult(r.id))
  );
  (checkForfeitThreshold as Mock).mockReturnValue({ passed: true, forfeitRate: 0 });
  (writeAllReviews as Mock).mockResolvedValue([]);
  (applyThreshold as Mock).mockReturnValue({ discussions: [], unconfirmed: [], suggestions: [] });
  (deduplicateDiscussions as Mock).mockReturnValue({ deduplicated: [], mergedCount: 0 });
  (extractMultipleSnippets as Mock).mockReturnValue(new Map());
  (runModerator as Mock).mockResolvedValue({ ...mockModeratorReport });
  (writeModeratorReport as Mock).mockResolvedValue(undefined);
  (writeSuggestions as Mock).mockResolvedValue(undefined);
  (scanUnconfirmedQueue as Mock).mockReturnValue({ promoted: [], dismissed: [] });
  (makeHeadVerdict as Mock).mockReturnValue({ decision: 'ACCEPT', reasoning: 'ok' });
  (writeHeadVerdict as Mock).mockResolvedValue(undefined);
  (getBanditStore as Mock).mockReturnValue(null);
  (createLogger as Mock).mockReturnValue(mockLogger);
  (loadReviewRules as Mock).mockResolvedValue(null);

  mockSession.setStatus.mockClear();
  mockSession.getDate.mockReset().mockReturnValue('2026-01-15');
  mockSession.getSessionId.mockReset().mockReturnValue('001');
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.flush.mockClear();
}

// ============================================================================
// ORCH-01: All reviewers fail → error return
// ============================================================================

describe('ORCH-01 — all reviewers fail returns error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it('returns status error when forfeit threshold fails for all chunks', async () => {
    (checkForfeitThreshold as Mock).mockReturnValue({ passed: false, forfeitRate: 1.0 });

    const result = await runPipeline({ diffPath: '/tmp/test.diff', noCache: true });

    expect(result.status).toBe('error');
    expect(result.error).toContain('All review chunks failed');
    expect(mockSession.setStatus).toHaveBeenCalledWith('failed');
  });

  it('error result contains sessionId and date from session', async () => {
    (checkForfeitThreshold as Mock).mockReturnValue({ passed: false, forfeitRate: 1.0 });

    const result = await runPipeline({ diffPath: '/tmp/test.diff', noCache: true });

    expect(result.sessionId).toBe('001');
    expect(result.date).toBe('2026-01-15');
  });

  it('never calls runModerator when all chunks forfeit', async () => {
    (checkForfeitThreshold as Mock).mockReturnValue({ passed: false, forfeitRate: 1.0 });

    await runPipeline({ diffPath: '/tmp/test.diff', noCache: true });

    expect(runModerator).not.toHaveBeenCalled();
  });
});

// ============================================================================
// ORCH-02: Partial failure with forfeitThreshold=0.5
// ============================================================================

describe('ORCH-02 — partial failure with forfeitThreshold=0.5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it('pipeline continues when forfeit rate is below threshold', async () => {
    // 2/5 = 0.4 < 0.5 → passed
    (checkForfeitThreshold as Mock).mockReturnValue({ passed: true, forfeitRate: 0.4 });
    (executeReviewers as Mock).mockResolvedValue([
      makeReviewResult('r1', 'forfeit'),
      makeReviewResult('r2', 'forfeit'),
      makeReviewResult('r3'),
      makeReviewResult('r4'),
      makeReviewResult('r5'),
    ]);

    const result = await runPipeline({ diffPath: '/tmp/test.diff', noCache: true });

    expect(result.status).toBe('success');
    expect(makeHeadVerdict).toHaveBeenCalled();
  });

  it('pipeline fails when forfeit rate meets threshold', async () => {
    // 3/5 = 0.6 > 0.5 → not passed
    (checkForfeitThreshold as Mock).mockReturnValue({ passed: false, forfeitRate: 0.6 });

    const result = await runPipeline({ diffPath: '/tmp/test.diff', noCache: true });

    expect(result.status).toBe('error');
    expect(result.error).toMatch(/All review chunks failed/);
  });

  it('pipeline does not call makeHeadVerdict when forfeit threshold exceeded', async () => {
    (checkForfeitThreshold as Mock).mockReturnValue({ passed: false, forfeitRate: 0.6 });

    await runPipeline({ diffPath: '/tmp/test.diff', noCache: true });

    expect(makeHeadVerdict).not.toHaveBeenCalled();
  });
});

// ============================================================================
// ORCH-03: loadReviewRules throw doesn't crash pipeline
// ============================================================================

describe('ORCH-03 — loadReviewRules throw does not crash pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it('pipeline returns defined result when loadReviewRules throws', async () => {
    (loadReviewRules as Mock).mockRejectedValue(
      new Error('Failed to parse .reviewrules file: unexpected token')
    );

    const result = await runPipeline({ diffPath: '/tmp/test.diff', noCache: true });

    // The outer try/catch in runPipeline captures the error and returns gracefully
    expect(result).toHaveProperty('status');
    expect(['success', 'error']).toContain(result.status);
    expect(result).toHaveProperty('sessionId');
    // Never hangs or throws
  });

  it('pipeline returns success when loadReviewRules returns null (no rules file)', async () => {
    (loadReviewRules as Mock).mockResolvedValue(null);

    const result = await runPipeline({ diffPath: '/tmp/test.diff', noCache: true });

    expect(result.status).toBe('success');
  });

  it('pipeline returns success when loadReviewRules returns empty array', async () => {
    (loadReviewRules as Mock).mockResolvedValue([]);

    const result = await runPipeline({ diffPath: '/tmp/test.diff', noCache: true });

    expect(result.status).toBe('success');
  });

  it('pipeline returns success when loadReviewRules returns valid rules', async () => {
    (loadReviewRules as Mock).mockResolvedValue([
      { id: 'r1', pattern: 'console\\.log', severity: 'WARNING', message: 'no logs', regex: /console\.log/ },
    ]);

    const result = await runPipeline({ diffPath: '/tmp/test.diff', noCache: true });

    expect(result.status).toBe('success');
  });
});
