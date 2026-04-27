/**
 * E2E Mock Scenario Tests
 * Tests gap scenarios: error paths, cache, chunking, circuit breaker,
 * auto-approve, YAML config, GitHub integration, and SARIF.
 * All external dependencies mocked — no API keys required.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ============================================================================
// Mock all orchestrator dependencies before import
// ============================================================================

vi.mock('../../packages/core/src/config/loader.js', () => ({
  loadConfig: vi.fn(),
  normalizeConfig: vi.fn(),
}));

vi.mock('../../packages/core/src/session/manager.js', () => ({
  SessionManager: {
    create: vi.fn(),
  },
  recoverStaleSessions: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../../packages/core/src/rules/matcher.js', () => ({
  matchRules: vi.fn().mockReturnValue([]),
}));

vi.mock('../../packages/core/src/learning/store.js', () => ({
  loadLearnedPatterns: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../packages/core/src/learning/filter.js', () => ({
  applyLearnedPatterns: vi.fn().mockImplementation((docs: unknown[]) => ({
    filtered: docs,
    suppressed: [],
    downgraded: [],
  })),
}));

vi.mock('../../packages/shared/src/utils/hash.js', () => ({
  computeHash: vi.fn().mockReturnValue('mock-cache-key'),
}));

vi.mock('../../packages/shared/src/utils/cache.js', () => ({
  lookupCache: vi.fn().mockResolvedValue(null),
  addToCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@codeagora/core/pipeline/auto-approve.js', () => ({
  analyzeTrivialDiff: vi.fn().mockReturnValue({ isTrivial: false, stats: { totalLines: 10, codeLines: 10, commentLines: 0, blankLines: 0 } }),
}));

vi.mock('../../packages/core/src/pipeline/diff-complexity.js', () => ({
  estimateDiffComplexity: vi.fn().mockReturnValue({ score: 5, level: 'medium', fileCount: 1, chunkCount: 1, addedLines: 5, removedLines: 5 }),
}));

vi.mock('../../packages/core/src/pipeline/confidence.js', () => ({
  computeL1Confidence: vi.fn().mockReturnValue(80),
  adjustConfidenceFromDiscussion: vi.fn().mockReturnValue(80),
  getConfidenceBadge: vi.fn().mockReturnValue(''),
}));

vi.mock('../../packages/core/src/pipeline/report.js', () => ({
  generateReport: vi.fn().mockResolvedValue({ summary: { totalCalls: 0 } }),
  formatReportText: vi.fn().mockReturnValue(''),
}));

vi.mock('../../packages/core/src/pipeline/telemetry.js', () => ({
  PipelineTelemetry: vi.fn().mockImplementation(() => ({
    record: vi.fn(),
    getSummary: vi.fn().mockReturnValue({ totalCalls: 0, totalLatencyMs: 0, totalTokens: 0, perReviewer: [] }),
    toJSON: vi.fn().mockReturnValue({}),
    reset: vi.fn(),
  })),
}));

vi.mock('../../packages/core/src/l2/event-emitter.js', () => ({
  DiscussionEmitter: vi.fn().mockImplementation(() => ({
    emit: vi.fn(),
    on: vi.fn(),
  })),
}));

vi.mock('../../packages/core/src/l2/devils-advocate-tracker.js', () => ({
  trackDevilsAdvocate: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../../packages/core/src/config/credentials.js', () => ({
  loadCredentials: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}));

// ============================================================================
// Imports after mocks
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
import { lookupCache, addToCache } from '@codeagora/shared/utils/cache.js';
import { analyzeTrivialDiff } from '@codeagora/core/pipeline/auto-approve.js';
import { loadLearnedPatterns } from '@codeagora/core/learning/store.js';
import { applyLearnedPatterns } from '@codeagora/core/learning/filter.js';
import fs from 'fs/promises';

// GitHub integration (not orchestrator deps — imported directly in scenario tests)
import { mapToGitHubReview } from '@codeagora/github/mapper.js';
import { postReview } from '@codeagora/github/poster.js';
import { buildSarifReport, serializeSarif } from '@codeagora/github/sarif.js';

// ============================================================================
// Shared test fixtures
// ============================================================================

const mockSession = {
  getDate: vi.fn().mockReturnValue('2026-01-15'),
  getSessionId: vi.fn().mockReturnValue('001'),
  setStatus: vi.fn().mockResolvedValue(undefined),
  registerCleanup: vi.fn(),
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
};

const baseConfig = {
  reviewers: [
    { id: 'r1', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
    { id: 'r2', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
    { id: 'r3', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
    { id: 'r4', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
    { id: 'r5', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
  ],
  supporters: {
    pool: [],
    pickCount: 0,
    pickStrategy: 'random' as const,
    devilsAdvocate: { id: 'da', backend: 'codex', model: 'test', enabled: false, timeout: 120 },
    personaPool: [],
    personaAssignment: 'random' as const,
  },
  moderator: { backend: 'codex', model: 'test' },
  discussion: {
    maxRounds: 1,
    registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
    codeSnippetRange: 5,
  },
  errorHandling: { maxRetries: 0, forfeitThreshold: 0.7 },
};

const singleChunk = [
  { index: 0, files: ['auth.ts'], diffContent: 'diff content', estimatedTokens: 100 },
];

const singleFileGroup = [
  { name: 'root', files: ['auth.ts'], diffContent: 'diff content', prSummary: 'Changes in root/' },
];

const successReviewResult = (id: string) => ({
  reviewerId: id,
  model: 'test',
  group: 'root',
  evidenceDocs: [],
  rawResponse: 'No issues found',
  status: 'success' as const,
});

const forfeitReviewResult = (id: string) => ({
  reviewerId: id,
  model: 'test',
  group: 'root',
  evidenceDocs: [],
  rawResponse: '',
  status: 'forfeit' as const,
});

const emptyModeratorReport = {
  discussions: [],
  roundsPerDiscussion: {},
  unconfirmedIssues: [],
  suggestions: [],
  summary: { totalDiscussions: 0, resolved: 0, escalated: 0 },
};

function setupDefaultMocks(config = baseConfig) {
  (loadConfig as Mock).mockResolvedValue(config);
  (normalizeConfig as Mock).mockReturnValue(config);
  (SessionManager.create as Mock).mockResolvedValue(mockSession);
  (fs.readFile as Mock).mockResolvedValue('mock diff content');
  (chunkDiff as Mock).mockReturnValue(singleChunk);
  (groupDiff as Mock).mockReturnValue(singleFileGroup);
  (resolveReviewers as Mock).mockResolvedValue({
    reviewerInputs: config.reviewers.map((r) => ({
      config: r,
      groupName: 'root',
      diffContent: 'diff content',
      prSummary: 'Changes in root/',
    })),
    autoCount: 0,
  });
  (executeReviewers as Mock).mockResolvedValue(config.reviewers.map((r) => successReviewResult(r.id)));
  (checkForfeitThreshold as Mock).mockReturnValue({ passed: true, forfeitRate: 0 });
  (writeAllReviews as Mock).mockResolvedValue([]);
  (applyThreshold as Mock).mockReturnValue({ discussions: [], unconfirmed: [], suggestions: [] });
  (deduplicateDiscussions as Mock).mockReturnValue({ deduplicated: [], mergedCount: 0 });
  (extractMultipleSnippets as Mock).mockReturnValue(new Map());
  (runModerator as Mock).mockResolvedValue({ ...emptyModeratorReport });
  (writeModeratorReport as Mock).mockResolvedValue(undefined);
  (writeSuggestions as Mock).mockResolvedValue(undefined);
  (scanUnconfirmedQueue as Mock).mockReturnValue({ promoted: [], dismissed: [] });
  (makeHeadVerdict as Mock).mockReturnValue({ decision: 'ACCEPT', reasoning: 'All good' });
  (writeHeadVerdict as Mock).mockResolvedValue(undefined);
  (getBanditStore as Mock).mockReturnValue(null);
  (createLogger as Mock).mockReturnValue(mockLogger);
  (lookupCache as Mock).mockResolvedValue(null);
  (addToCache as Mock).mockResolvedValue(undefined);
  mockSession.setStatus.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.flush.mockClear();
}

// ============================================================================
// P0 Error Paths
// ============================================================================

describe('P0: Error paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('1. all 5 reviewers forfeit → status error', async () => {
    // All reviewers fail — checkForfeitThreshold returns not-passed for all chunks
    (checkForfeitThreshold as Mock).mockReturnValue({ passed: false, forfeitRate: 1.0 });

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('error');
    expect(result.error).toContain('All reviewers failed');
    expect(makeHeadVerdict).not.toHaveBeenCalled();
    expect(mockSession.setStatus).toHaveBeenCalledWith('failed');
  });

  it('2. all 5 reviewers timeout (executeReviewers throws) → status error', async () => {
    (executeReviewers as Mock).mockRejectedValue(new Error('timeout: all reviewers timed out'));

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('error');
    expect(result.error).toContain('timeout');
    expect(mockSession.setStatus).toHaveBeenCalledWith('failed');
  });
});

// ============================================================================
// P1: Core Scenarios
// ============================================================================

describe('P1: Core scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // Scenario 3: 2/5 fail, forfeitThreshold=0.7 → 3 succeed, pipeline continues
  it('3. 2/5 reviewers fail with forfeitThreshold=0.7 → pipeline continues with 3 results', async () => {
    const config = { ...baseConfig, errorHandling: { maxRetries: 0, forfeitThreshold: 0.7 } };
    (loadConfig as Mock).mockResolvedValue(config);
    (normalizeConfig as Mock).mockReturnValue(config);

    // checkForfeitThreshold passes because 2/5 = 40% < 70% threshold
    const results = [
      forfeitReviewResult('r1'),
      forfeitReviewResult('r2'),
      successReviewResult('r3'),
      successReviewResult('r4'),
      successReviewResult('r5'),
    ];
    (executeReviewers as Mock).mockResolvedValue(results);
    (checkForfeitThreshold as Mock).mockReturnValue({ passed: true, forfeitRate: 0.4 });

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('success');
    expect(result.summary?.decision).toBe('ACCEPT');
    // forfeitedReviewers should reflect the 2 forfeits
    expect(result.summary?.forfeitedReviewers).toBe(2);
  });

  // Scenario 4: cache hit → 2nd call returns cached, no fresh LLM call
  it('4. cache hit on second call → returns cached result, no fresh executeReviewers call', async () => {
    const cachedResult = {
      sessionId: '001',
      date: '2026-01-10',
      status: 'success' as const,
      summary: {
        decision: 'ACCEPT' as const,
        reasoning: 'Cached',
        totalReviewers: 3,
        forfeitedReviewers: 0,
        severityCounts: {},
        topIssues: [],
        totalDiscussions: 0,
        resolved: 0,
        escalated: 0,
      },
    };

    // First call: cache miss
    (lookupCache as Mock).mockResolvedValueOnce(null);
    const result1 = await runPipeline({ diffPath: '/tmp/test.diff' });
    expect(result1.status).toBe('success');
    const callsAfterFirst = (executeReviewers as Mock).mock.calls.length;

    // Second call: cache hit — lookupCache returns a session path
    (lookupCache as Mock).mockResolvedValueOnce('2026-01-10/001');
    (fs.readFile as Mock)
      .mockResolvedValueOnce('mock diff content') // for the diff read
      .mockResolvedValueOnce(JSON.stringify(cachedResult)); // for result.json

    const result2 = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result2.cached).toBe(true);
    expect(result2.summary?.decision).toBe('ACCEPT');
    // executeReviewers should not have been called again
    expect((executeReviewers as Mock).mock.calls.length).toBe(callsAfterFirst);
  });

  // Scenario 5: multiple chunks → results merged
  it('5. large diff splits into 4 chunks → all chunks processed and results merged', async () => {
    const chunks = [
      { index: 0, files: ['a.ts'], diffContent: 'chunk0', estimatedTokens: 200 },
      { index: 1, files: ['b.ts'], diffContent: 'chunk1', estimatedTokens: 200 },
      { index: 2, files: ['c.ts'], diffContent: 'chunk2', estimatedTokens: 200 },
      { index: 3, files: ['d.ts'], diffContent: 'chunk3', estimatedTokens: 200 },
    ];
    (chunkDiff as Mock).mockReturnValue(chunks);

    // Each chunk returns 2 reviewer results
    (executeReviewers as Mock).mockResolvedValue([
      successReviewResult('r1'),
      successReviewResult('r2'),
    ]);
    (checkForfeitThreshold as Mock).mockReturnValue({ passed: true, forfeitRate: 0 });
    (resolveReviewers as Mock).mockResolvedValue({
      reviewerInputs: [
        { config: baseConfig.reviewers[0], groupName: 'root', diffContent: 'chunk', prSummary: '' },
        { config: baseConfig.reviewers[1], groupName: 'root', diffContent: 'chunk', prSummary: '' },
      ],
      autoCount: 0,
    });

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('success');
    // resolveReviewers called once per chunk (4 chunks)
    expect((resolveReviewers as Mock).mock.calls.length).toBe(4);
    // executeReviewers called once per chunk
    expect((executeReviewers as Mock).mock.calls.length).toBe(4);
  });

  // Scenario 6: circuit breaker open → reviewer throws CircuitOpenError → forfeit
  it('6. circuit breaker open → executeReviewers throws CircuitOpenError → error result', async () => {
    const { CircuitOpenError } = await import('@codeagora/core/l1/circuit-breaker.js');
    (executeReviewers as Mock).mockRejectedValue(new CircuitOpenError('openai', 'gpt-4'));

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('error');
    expect(result.error).toMatch(/Circuit open/i);
  });

  // Scenario 7: auto-approve trivial diff → ACCEPT without LLM calls
  it('7. auto-approve trivial diff (comments-only) → ACCEPT, executeReviewers not called', async () => {
    const configWithAutoApprove = {
      ...baseConfig,
      autoApprove: {
        enabled: true,
        maxLines: 50,
        allowedFilePatterns: ['*.md'],
      },
    };
    (loadConfig as Mock).mockResolvedValue(configWithAutoApprove);
    (normalizeConfig as Mock).mockReturnValue(configWithAutoApprove);
    (analyzeTrivialDiff as Mock).mockReturnValue({
      isTrivial: true,
      reason: 'comments-only',
      stats: { totalLines: 3, codeLines: 0, commentLines: 3, blankLines: 0 },
    });

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('success');
    expect(result.summary?.decision).toBe('ACCEPT');
    expect(result.summary?.reasoning).toContain('Auto-approved');
    expect(executeReviewers).not.toHaveBeenCalled();
  });

  // Scenario 8: YAML config → pipeline runs normally (loadConfig returns parsed YAML config)
  it('8. YAML config → pipeline runs successfully', async () => {
    // loadConfig already abstracts away JSON vs YAML — same normalised config shape
    const yamlConfig = {
      ...baseConfig,
      reviewers: [
        { id: 'yaml-r1', backend: 'codex', model: 'gpt-4', enabled: true, timeout: 60 },
      ],
    };
    (loadConfig as Mock).mockResolvedValue(yamlConfig);
    (normalizeConfig as Mock).mockReturnValue(yamlConfig);
    (resolveReviewers as Mock).mockResolvedValue({
      reviewerInputs: [{ config: yamlConfig.reviewers[0], groupName: 'root', diffContent: 'diff', prSummary: '' }],
      autoCount: 0,
    });
    (executeReviewers as Mock).mockResolvedValue([successReviewResult('yaml-r1')]);

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('success');
    expect(loadConfig).toHaveBeenCalled();
  });

  // Scenario 9: dry-run (skipDiscussion + skipHead) → returns without L2/L3 calls
  it('9. dry-run mode (skipDiscussion + skipHead) → no moderator or head verdict called', async () => {
    const result = await runPipeline({
      diffPath: '/tmp/test.diff',
      skipDiscussion: true,
      skipHead: true,
    });

    expect(result.status).toBe('success');
    expect(runModerator).not.toHaveBeenCalled();
    expect(makeHeadVerdict).not.toHaveBeenCalled();
    expect(result.summary?.decision).toBe('NEEDS_HUMAN');
    expect(result.summary?.reasoning).toContain('Lightweight');
  });
});

// ============================================================================
// P1: Integration Scenarios (mock)
// ============================================================================

describe('P1: Integration scenarios (mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // Scenario 10: GitHub integration — mapToGitHubReview + postReview
  it('10. GitHub integration: mapToGitHubReview → postReview with mock Octokit', async () => {
    const evidenceDocs = [
      {
        issueTitle: 'SQL Injection',
        problem: 'Raw SQL with user input',
        evidence: ['No parameterization'],
        severity: 'CRITICAL' as const,
        suggestion: 'Use parameterized queries',
        filePath: 'auth.ts',
        lineRange: [10, 10] as [number, number],
        source: 'review' as const,
      },
    ];

    const summary = {
      decision: 'REJECT' as const,
      reasoning: 'Critical SQL injection found',
      totalReviewers: 3,
      forfeitedReviewers: 0,
      severityCounts: { CRITICAL: 1 },
      topIssues: [{ severity: 'CRITICAL', filePath: 'auth.ts', lineRange: [10, 10] as [number, number], title: 'SQL Injection' }],
      totalDiscussions: 0,
      resolved: 0,
      escalated: 0,
    };

    // Build the review shape — no real Octokit needed here
    const positionIndex = new Map([['auth.ts', new Map([[10, 1]])]]) as unknown as import('@codeagora/github/types.js').DiffPositionIndex;

    const review = mapToGitHubReview({
      summary,
      evidenceDocs,
      discussions: [],
      positionIndex,
      headSha: 'abc123',
      sessionId: '001',
      sessionDate: '2026-01-15',
    });

    expect(review.event).toBe('REQUEST_CHANGES');
    expect(review.body).toContain('CodeAgora');
    expect(review.commit_id).toBe('abc123');

    // Mock Octokit for postReview
    const mockOctokit = {
      paginate: vi.fn().mockResolvedValue([]), // findPriorReviews uses kit.paginate
      pulls: {
        listReviews: vi.fn().mockResolvedValue({ data: [] }),
        createReview: vi.fn().mockResolvedValue({
          data: { id: 42, html_url: 'https://github.com/owner/repo/pull/1#pullrequestreview-42' },
        }),
      },
      issues: {
        createComment: vi.fn().mockResolvedValue({ data: {} }),
      },
    } as unknown as import('@octokit/rest').Octokit;

    const ghConfig = { owner: 'owner', repo: 'repo', token: 'mock-token' };
    const postResult = await postReview(ghConfig, 1, review, mockOctokit);

    expect(postResult.verdict).toContain('REJECT');
    expect(postResult.reviewId).toBe(42);
    expect(mockOctokit.pulls.createReview).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
        commit_id: 'abc123',
        event: 'REQUEST_CHANGES',
      })
    );
  });

  // Scenario 11: SARIF output — pipeline result → SARIF JSON structure
  it('11. SARIF output: evidenceDocs → buildSarifReport → valid SARIF 2.1.0 structure', () => {
    const evidenceDocs = [
      {
        issueTitle: 'SQL Injection',
        problem: 'Raw user input in SQL',
        evidence: ['No parameterization used'],
        severity: 'CRITICAL' as const,
        suggestion: 'Use parameterized queries',
        filePath: 'src/auth.ts',
        lineRange: [10, 12] as [number, number],
        source: 'review' as const,
      },
      {
        issueTitle: 'Missing Input Validation',
        problem: 'User input not validated',
        evidence: ['No validation layer'],
        severity: 'WARNING' as const,
        suggestion: 'Add zod schema validation',
        filePath: 'src/handler.ts',
        lineRange: [5, 5] as [number, number],
        source: 'review' as const,
      },
    ];

    const report = buildSarifReport(evidenceDocs, '001', '2026-01-15');
    const json = serializeSarif(report);
    const parsed = JSON.parse(json);

    // SARIF schema version
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.$schema).toContain('sarif-schema-2.1.0');

    // Single run
    expect(parsed.runs).toHaveLength(1);
    const run = parsed.runs[0];

    // Tool driver
    expect(run.tool.driver.name).toBe('CodeAgora');
    expect(run.tool.driver.rules).toHaveLength(4); // CA001–CA004

    // Results
    expect(run.results).toHaveLength(2);

    const criticalResult = run.results[0];
    expect(criticalResult.ruleId).toBe('CA002'); // CRITICAL → CA002
    expect(criticalResult.level).toBe('error');
    expect(criticalResult.locations[0].physicalLocation.artifactLocation.uri).toBe('src/auth.ts');
    expect(criticalResult.locations[0].physicalLocation.region.startLine).toBe(10);
    expect(criticalResult.locations[0].physicalLocation.region.endLine).toBe(12);

    const warningResult = run.results[1];
    expect(warningResult.ruleId).toBe('CA003'); // WARNING → CA003
    expect(warningResult.level).toBe('warning');

    // Automation details
    expect(run.automationDetails.id).toBe('codeagora/2026-01-15/001');
  });
});

// ============================================================================
// P2: Mode and Learning
// ============================================================================

describe('P2: Mode and learning scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // Scenario 14: strict vs pragmatic mode — different makeHeadVerdict args
  it('14. strict vs pragmatic mode → makeHeadVerdict called with correct mode config', async () => {
    const strictConfig = { ...baseConfig, mode: 'strict' as const };
    (loadConfig as Mock).mockResolvedValue(strictConfig);
    (normalizeConfig as Mock).mockReturnValue(strictConfig);
    (makeHeadVerdict as Mock).mockReturnValue({ decision: 'REJECT', reasoning: 'Strict mode' });

    await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(makeHeadVerdict).toHaveBeenCalledTimes(1);
    const args = (makeHeadVerdict as Mock).mock.calls[0];
    // Third argument is the mode
    expect(args[2]).toBe('strict');

    vi.clearAllMocks();
    setupDefaultMocks();

    const pragmaticConfig = { ...baseConfig, mode: 'pragmatic' as const };
    (loadConfig as Mock).mockResolvedValue(pragmaticConfig);
    (normalizeConfig as Mock).mockReturnValue(pragmaticConfig);
    (makeHeadVerdict as Mock).mockReturnValue({ decision: 'ACCEPT', reasoning: 'Pragmatic mode' });

    await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(makeHeadVerdict).toHaveBeenCalledTimes(1);
    const pragmaticArgs = (makeHeadVerdict as Mock).mock.calls[0];
    expect(pragmaticArgs[2]).toBe('pragmatic');
  });

  // Scenario 15: learned patterns → matching issues suppressed
  it('15. learned patterns: matching issues suppressed before threshold', async () => {
    const evidenceDoc = {
      issueTitle: 'SQL Injection Risk',
      problem: 'Raw SQL',
      evidence: ['e1'],
      severity: 'WARNING' as const,
      suggestion: 'Use parameterized queries',
      filePath: 'auth.ts',
      lineRange: [10, 10] as [number, number],
      source: 'review' as const,
    };

    (executeReviewers as Mock).mockResolvedValue([
      { ...successReviewResult('r1'), evidenceDocs: [evidenceDoc] },
    ]);

    const learnedPatterns = {
      version: 1 as const,
      dismissedPatterns: [
        {
          pattern: 'sql injection',
          severity: 'WARNING' as const,
          dismissCount: 5,
          lastDismissed: '2026-01-10',
          action: 'suppress' as const,
        },
      ],
    };
    (loadLearnedPatterns as Mock).mockResolvedValue(learnedPatterns);
    (applyLearnedPatterns as Mock).mockReturnValue({
      filtered: [],
      suppressed: [evidenceDoc],
      downgraded: [],
    });

    const result = await runPipeline({ diffPath: '/tmp/test.diff' });

    expect(result.status).toBe('success');
    expect(applyLearnedPatterns).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ issueTitle: 'SQL Injection Risk' })]),
      learnedPatterns.dismissedPatterns,
    );
    // After suppression, applyThreshold should receive empty docs
    expect(applyThreshold).toHaveBeenCalledWith([], expect.anything());
  });
});

// ============================================================================
// Circuit Breaker Unit Tests (direct — no orchestrator)
// ============================================================================

describe('Circuit Breaker unit', () => {
  it('6a. circuit opens after threshold failures and blocks immediately', async () => {
    const { CircuitBreaker } = await import('@codeagora/core/l1/circuit-breaker.js');
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 60_000 });

    expect(cb.isOpen('openai', 'gpt-4')).toBe(false);

    cb.recordFailure('openai', 'gpt-4');
    cb.recordFailure('openai', 'gpt-4');
    expect(cb.isOpen('openai', 'gpt-4')).toBe(false); // Not yet

    cb.recordFailure('openai', 'gpt-4');
    expect(cb.isOpen('openai', 'gpt-4')).toBe(true); // Now open
  });

  it('6b. circuit transitions open → half-open after cooldown', async () => {
    const { CircuitBreaker } = await import('@codeagora/core/l1/circuit-breaker.js');
    let fakeNow = 1_000_000;
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 5_000, nowFn: () => fakeNow });

    cb.recordFailure('anthropic', 'claude');
    cb.recordFailure('anthropic', 'claude');
    expect(cb.getState('anthropic', 'claude')).toBe('open');

    fakeNow += 6_000; // advance past cooldown
    expect(cb.getState('anthropic', 'claude')).toBe('half-open');
  });

  it('6c. circuit recovers to closed on success in half-open', async () => {
    const { CircuitBreaker } = await import('@codeagora/core/l1/circuit-breaker.js');
    let fakeNow = 1_000_000;
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 5_000, nowFn: () => fakeNow });

    cb.recordFailure('google', 'gemini');
    cb.recordFailure('google', 'gemini');
    fakeNow += 6_000;
    expect(cb.getState('google', 'gemini')).toBe('half-open');

    cb.recordSuccess('google', 'gemini');
    expect(cb.getState('google', 'gemini')).toBe('closed');
  });
});

// ============================================================================
// Auto-approve unit tests (direct)
// ============================================================================

describe('Auto-approve unit', () => {
  it('7a. comments-only diff → isTrivial=true, reason=comments-only', async () => {
    const { analyzeTrivialDiff: realAnalyze } = await vi.importActual<typeof import('@codeagora/core/pipeline/auto-approve.js')>('@codeagora/core/pipeline/auto-approve.js');

    const commentOnlyDiff = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,4 @@
+// Added security comment
+// describing the risk
 const x = 1;
`;
    const result = realAnalyze(commentOnlyDiff, { maxLines: 50, allowedFilePatterns: [] });
    expect(result.isTrivial).toBe(true);
    expect(result.reason).toBe('comments-only');
  });

  it('7b. docs-only diff (*.md file) → isTrivial=true, reason=docs-only', async () => {
    const { analyzeTrivialDiff: realAnalyze } = await vi.importActual<typeof import('@codeagora/core/pipeline/auto-approve.js')>('@codeagora/core/pipeline/auto-approve.js');

    const docsDiff = `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,2 +1,3 @@
+Added a new section.
 # Title
`;
    const result = realAnalyze(docsDiff, { maxLines: 50, allowedFilePatterns: ['*.md'] });
    expect(result.isTrivial).toBe(true);
    expect(result.reason).toBe('docs-only');
  });

  it('7c. real code change → isTrivial=false', async () => {
    const { analyzeTrivialDiff: realAnalyze } = await vi.importActual<typeof import('@codeagora/core/pipeline/auto-approve.js')>('@codeagora/core/pipeline/auto-approve.js');

    const codeDiff = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -5,3 +5,4 @@
+const query = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
 const x = 1;
`;
    const result = realAnalyze(codeDiff, { maxLines: 50, allowedFilePatterns: ['*.md'] });
    expect(result.isTrivial).toBe(false);
  });
});
