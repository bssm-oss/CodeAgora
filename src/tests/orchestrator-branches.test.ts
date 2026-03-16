/**
 * Orchestrator Branch Unit Tests
 * Tests all branches in runPipeline with fully mocked dependencies
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ============================================================================
// Mock all dependencies before importing orchestrator
// ============================================================================

vi.mock('../config/loader.js', () => ({
  loadConfig: vi.fn(),
  normalizeConfig: vi.fn(),
}));

vi.mock('../session/manager.js', () => ({
  SessionManager: {
    create: vi.fn(),
  },
}));

vi.mock('../l1/reviewer.js', () => ({
  executeReviewers: vi.fn(),
  checkForfeitThreshold: vi.fn(),
}));

vi.mock('../l1/writer.js', () => ({
  writeAllReviews: vi.fn(),
}));

vi.mock('../l2/threshold.js', () => ({
  applyThreshold: vi.fn(),
}));

vi.mock('../l2/moderator.js', () => ({
  runModerator: vi.fn(),
}));

vi.mock('../l2/writer.js', () => ({
  writeModeratorReport: vi.fn(),
  writeSuggestions: vi.fn(),
}));

vi.mock('../l2/deduplication.js', () => ({
  deduplicateDiscussions: vi.fn(),
}));

vi.mock('../l3/grouping.js', () => ({
  groupDiff: vi.fn(),
}));

vi.mock('../pipeline/chunker.js', () => ({
  chunkDiff: vi.fn(),
}));

vi.mock('../l3/verdict.js', () => ({
  makeHeadVerdict: vi.fn(),
  scanUnconfirmedQueue: vi.fn(),
}));

vi.mock('../l3/writer.js', () => ({
  writeHeadVerdict: vi.fn(),
}));

vi.mock('../l0/index.js', () => ({
  resolveReviewers: vi.fn(),
  getBanditStore: vi.fn(),
}));

vi.mock('../l0/quality-tracker.js', () => ({
  QualityTracker: vi.fn().mockImplementation(() => ({
    recordReviewerOutput: vi.fn(),
    recordDiscussionResults: vi.fn(),
    finalizeRewards: vi.fn().mockReturnValue(new Map()),
    getRecords: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../utils/diff.js', () => ({
  extractMultipleSnippets: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}));

// ============================================================================
// Import orchestrator and mocked modules
// ============================================================================

import { runPipeline } from '../pipeline/orchestrator.js';
import { loadConfig, normalizeConfig } from '../config/loader.js';
import { SessionManager } from '../session/manager.js';
import { executeReviewers, checkForfeitThreshold } from '../l1/reviewer.js';
import { writeAllReviews } from '../l1/writer.js';
import { applyThreshold } from '../l2/threshold.js';
import { runModerator } from '../l2/moderator.js';
import { writeModeratorReport, writeSuggestions } from '../l2/writer.js';
import { deduplicateDiscussions } from '../l2/deduplication.js';
import { groupDiff } from '../l3/grouping.js';
import { makeHeadVerdict, scanUnconfirmedQueue } from '../l3/verdict.js';
import { writeHeadVerdict } from '../l3/writer.js';
import { resolveReviewers, getBanditStore } from '../l0/index.js';
import { QualityTracker } from '../l0/quality-tracker.js';
import { extractMultipleSnippets } from '../utils/diff.js';
import { createLogger } from '../utils/logger.js';
import { chunkDiff } from '../pipeline/chunker.js';
import fs from 'fs/promises';

// ============================================================================
// Test Helpers
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
  ],
  supporters: { pool: [], pickCount: 2, pickStrategy: 'random', devilsAdvocate: { id: 'da', backend: 'codex', model: 'test', enabled: true, timeout: 120 }, personaPool: ['/tmp/p.md'], personaAssignment: 'random' },
  moderator: { backend: 'codex', model: 'test' },
  discussion: { maxRounds: 3, registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null }, codeSnippetRange: 10 },
  errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
};

const mockReviewResults = [
  {
    reviewerId: 'r1',
    model: 'test',
    group: 'root',
    evidenceDocs: [],
    rawResponse: 'No issues found',
    status: 'success' as const,
  },
];

const mockModeratorReport = {
  discussions: [],
  unconfirmedIssues: [],
  suggestions: [],
  summary: { totalDiscussions: 0, resolved: 0, escalated: 0 },
};

function setupDefaultMocks() {
  (loadConfig as Mock).mockResolvedValue(mockConfig);
  (normalizeConfig as Mock).mockReturnValue(mockConfig);
  (SessionManager.create as Mock).mockResolvedValue(mockSession);
  (fs.readFile as Mock).mockResolvedValue('diff content');
  (chunkDiff as Mock).mockReturnValue([
    { index: 0, files: ['auth.ts'], diffContent: 'diff content', estimatedTokens: 100 },
  ]);
  (groupDiff as Mock).mockReturnValue([
    { name: 'root', files: ['auth.ts'], diffContent: 'diff content', prSummary: 'Changes in root/' },
  ]);
  (resolveReviewers as Mock).mockResolvedValue({
    reviewerInputs: [{ config: mockConfig.reviewers[0], groupName: 'root', diffContent: 'diff content', prSummary: 'Changes in root/' }],
    autoCount: 0,
  });
  (executeReviewers as Mock).mockResolvedValue(mockReviewResults);
  (checkForfeitThreshold as Mock).mockReturnValue({ passed: true, forfeitRate: 0 });
  (writeAllReviews as Mock).mockResolvedValue([]);
  (applyThreshold as Mock).mockReturnValue({ discussions: [], unconfirmed: [], suggestions: [] });
  (deduplicateDiscussions as Mock).mockReturnValue({ deduplicated: [], mergedCount: 0 });
  (extractMultipleSnippets as Mock).mockReturnValue(new Map());
  (runModerator as Mock).mockResolvedValue({ ...mockModeratorReport });
  (writeModeratorReport as Mock).mockResolvedValue(undefined);
  (writeSuggestions as Mock).mockResolvedValue(undefined);
  (scanUnconfirmedQueue as Mock).mockReturnValue({ promoted: [], dismissed: [] });
  (makeHeadVerdict as Mock).mockReturnValue({ decision: 'ACCEPT', reasoning: 'All good' });
  (writeHeadVerdict as Mock).mockResolvedValue(undefined);
  (getBanditStore as Mock).mockReturnValue(null);
  (createLogger as Mock).mockReturnValue(mockLogger);

  // Reset session mock call counts
  mockSession.setStatus.mockClear();
  mockSession.getDate.mockClear();
  mockSession.getSessionId.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.flush.mockClear();
}

// ============================================================================
// Tests
// ============================================================================

describe('Orchestrator Branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Empty diff -> immediate success (lines 62-69)
  // --------------------------------------------------------------------------
  it('empty diff returns immediate success without calling executeReviewers', async () => {
    (chunkDiff as Mock).mockReturnValue([]);

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('success');
    expect(result.sessionId).toBe('001');
    expect(executeReviewers).not.toHaveBeenCalled();
    expect(mockSession.setStatus).toHaveBeenCalledWith('completed');
  });

  // --------------------------------------------------------------------------
  // 2. Forfeit threshold exceeded (lines 84-97)
  // --------------------------------------------------------------------------
  it('forfeit threshold exceeded on all chunks returns error', async () => {
    (checkForfeitThreshold as Mock).mockReturnValue({ passed: false, forfeitRate: 0.8 });

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('error');
    expect(result.error).toContain('All review chunks failed');
    expect(mockSession.setStatus).toHaveBeenCalledWith('failed');
  });

  // --------------------------------------------------------------------------
  // 3. Promoted unconfirmed issues (lines 178-190)
  // --------------------------------------------------------------------------
  it('promoted unconfirmed issues are added as discussions for Head verdict', async () => {
    const promotedDoc = {
      issueTitle: 'SQL Injection',
      problem: 'In auth.ts:10',
      evidence: ['evidence1'],
      severity: 'CRITICAL' as const,
      suggestion: 'Use parameterized queries',
      filePath: 'auth.ts',
      lineRange: [10, 10] as [number, number],
    };

    (scanUnconfirmedQueue as Mock).mockReturnValue({
      promoted: [promotedDoc],
      dismissed: [],
    });

    // runModerator returns a fresh report object each call
    (runModerator as Mock).mockResolvedValue({
      discussions: [
        { discussionId: 'd001', finalSeverity: 'WARNING', reasoning: 'test', consensusReached: true, rounds: 1 },
      ],
      unconfirmedIssues: [],
      suggestions: [],
      summary: { totalDiscussions: 1, resolved: 1, escalated: 0 },
    });

    await runPipeline({ diffPath: '/tmp/test.diff' });

    // Verify makeHeadVerdict was called with a report that includes the promoted discussion
    expect(makeHeadVerdict).toHaveBeenCalledTimes(1);
    const reportArg = (makeHeadVerdict as Mock).mock.calls[0][0];

    // Should have original discussion + promoted one
    expect(reportArg.discussions.length).toBe(2);

    const promotedDiscussion = reportArg.discussions.find(
      (d: { discussionId: string }) => d.discussionId.startsWith('promoted-')
    );
    expect(promotedDiscussion).toBeDefined();
    expect(promotedDiscussion.discussionId).toBe('promoted-auth.ts:10');
    expect(promotedDiscussion.finalSeverity).toBe('CRITICAL');
    expect(promotedDiscussion.consensusReached).toBe(false);

    // Summary should be updated
    expect(reportArg.summary.escalated).toBe(1);
    expect(reportArg.summary.totalDiscussions).toBe(2);
  });

  // --------------------------------------------------------------------------
  // 4. Bandit store null fallback (lines 200-206)
  // --------------------------------------------------------------------------
  it('creates standalone BanditStore when getBanditStore returns null and rewards exist', async () => {
    const mockBanditInstance = {
      load: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
      updateArm: vi.fn(),
      addHistory: vi.fn(),
    };

    // QualityTracker mock must return non-empty rewards
    const mockQualityTracker = {
      recordReviewerOutput: vi.fn(),
      recordDiscussionResults: vi.fn(),
      finalizeRewards: vi.fn().mockReturnValue(
        new Map([['r1', { modelId: 'test', provider: 'codex', compositeQ: 0.8, reward: 1 as const }]])
      ),
      getRecords: vi.fn().mockReturnValue([
        { reviewId: 'r1', diffId: '001', modelId: 'test', provider: 'codex', timestamp: Date.now(), issuesRaised: 1, specificityScore: 0.5, peerValidationRate: 1, headAcceptanceRate: 1, compositeQ: 0.8, rewardSignal: 1 },
      ]),
    };
    (QualityTracker as unknown as Mock).mockImplementation(() => mockQualityTracker);

    (getBanditStore as Mock).mockReturnValue(null);

    // Mock the dynamic import of BanditStore
    vi.doMock('../l0/bandit-store.js', () => ({
      BanditStore: vi.fn().mockImplementation(() => mockBanditInstance),
    }));

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('success');
    // The standalone BanditStore should have been loaded and saved
    expect(mockBanditInstance.load).toHaveBeenCalled();
    expect(mockBanditInstance.save).toHaveBeenCalled();
    expect(mockBanditInstance.updateArm).toHaveBeenCalledWith('codex/test', 1);
  });

  // --------------------------------------------------------------------------
  // 5. Error with session created (lines 234-245)
  // --------------------------------------------------------------------------
  it('error after session created marks session as failed', async () => {
    (executeReviewers as Mock).mockRejectedValue(new Error('Backend crashed'));

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('error');
    expect(result.error).toBe('Backend crashed');
    expect(result.sessionId).toBe('001');
    expect(result.date).toBe('2026-01-15');
    expect(mockSession.setStatus).toHaveBeenCalledWith('failed');
  });

  // --------------------------------------------------------------------------
  // 6. Error without session (lines 234-245)
  // --------------------------------------------------------------------------
  it('error before session created returns unknown session and date', async () => {
    (loadConfig as Mock).mockRejectedValue(new Error('Config not found'));

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('error');
    expect(result.error).toBe('Config not found');
    expect(result.sessionId).toBe('unknown');
    expect(result.date).toBe('unknown');
  });
});
