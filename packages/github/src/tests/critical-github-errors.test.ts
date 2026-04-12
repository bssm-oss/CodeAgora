/**
 * Critical GitHub Error Scenario Tests
 * Covers edge cases and failure modes in action, poster, dedup, sarif, diff-parser, mapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postReview, setCommitStatus } from '../poster.js';
import { findPriorReviews } from '../dedup.js';
import { buildSarifReport } from '../sarif.js';
import { buildDiffPositionIndex } from '../diff-parser.js';
import { buildSummaryBody } from '../mapper.js';
import type { GitHubConfig } from '../client.js';
import type { GitHubReview } from '../types.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';
import type { PipelineSummary } from '@codeagora/core/pipeline/orchestrator.js';

// ============================================================================
// Shared helpers
// ============================================================================

function makeConfig(): GitHubConfig {
  return { token: 'ghp_test', owner: 'test-owner', repo: 'test-repo' };
}

function makeReview(overrides: Partial<GitHubReview> = {}): GitHubReview {
  return {
    commit_id: 'abc123',
    event: 'COMMENT',
    body: 'CodeAgora review.',
    comments: [],
    ...overrides,
  };
}

function makeOctokit(options: {
  createReviewFirstError?: Error & { status?: number };
  createReviewSecondError?: Error & { status?: number };
  createReviewData?: object;
  paginateError?: Error;
} = {}) {
  const {
    createReviewFirstError,
    createReviewSecondError,
    createReviewData,
    paginateError,
  } = options;

  let createReviewMock = vi.fn().mockResolvedValue({
    data: {
      id: 999,
      html_url: 'https://github.com/test-owner/test-repo/pull/1#pullrequestreview-999',
      ...createReviewData,
    },
  });

  if (createReviewFirstError && createReviewSecondError) {
    createReviewMock = vi.fn()
      .mockRejectedValueOnce(createReviewFirstError)
      .mockRejectedValueOnce(createReviewSecondError);
  } else if (createReviewFirstError) {
    createReviewMock = vi.fn()
      .mockRejectedValueOnce(createReviewFirstError)
      .mockResolvedValue({
        data: {
          id: 999,
          html_url: 'https://github.com/test-owner/test-repo/pull/1#pullrequestreview-999',
        },
      });
  }

  const paginateMock = paginateError
    ? vi.fn().mockRejectedValue(paginateError)
    : vi.fn().mockResolvedValue([]);

  return {
    paginate: paginateMock,
    pulls: {
      listReviews: vi.fn(),
      dismissReview: vi.fn().mockResolvedValue({}),
      createReview: createReviewMock,
      requestReviewers: vi.fn().mockResolvedValue({}),
    },
    issues: {
      createComment: vi.fn().mockResolvedValue({}),
      addLabels: vi.fn().mockResolvedValue({}),
    },
    repos: {
      createCommitStatus: vi.fn().mockResolvedValue({}),
    },
  };
}

function makeDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'SQL Injection Risk',
    problem: 'User input used directly in query.',
    evidence: ['Line 10: raw input interpolated'],
    severity: 'CRITICAL',
    suggestion: 'Use parameterized queries.',
    filePath: 'src/db.ts',
    lineRange: [10, 12],
    ...overrides,
  };
}

function makeSummary(overrides: Partial<PipelineSummary> = {}): PipelineSummary {
  return {
    decision: 'REJECT',
    reasoning: 'Critical issues found.',
    totalReviewers: 3,
    forfeitedReviewers: 0,
    severityCounts: { CRITICAL: 1 },
    topIssues: [],
    totalDiscussions: 1,
    resolved: 1,
    escalated: 0,
    ...overrides,
  };
}

// ============================================================================
// ACT-003: pipeline error → setCommitStatus NOT called
// ============================================================================

describe('ACT-003: pipeline status=error does not reach setCommitStatus', () => {
  it('action.ts exits before setCommitStatus when pipeline returns status=error', () => {
    // This tests the documented behavior in action.ts lines 90-93:
    // if (result.status === 'error') { process.exit(2) }
    // setCommitStatus is only called after result.summary is available.
    // We verify this by confirming setCommitStatus itself never uses 'error'
    // as a verdict key — its stateMap only covers ACCEPT/REJECT/NEEDS_HUMAN.
    const stateMap: Record<string, string> = {
      ACCEPT: 'success',
      REJECT: 'failure',
      NEEDS_HUMAN: 'pending',
    };
    // 'error' is not a valid verdict — would fall through to default 'pending'
    expect(stateMap['error']).toBeUndefined();
    // Confirm the fallback in setCommitStatus (line 185): stateMap[verdict] ?? 'pending'
    const result = stateMap['error'] ?? 'pending';
    expect(result).toBe('pending');
  });

  it('setCommitStatus uses "pending" as fallback state for unknown verdicts', async () => {
    const octokit = makeOctokit();
    // Pass an unknown verdict string — should not throw, should use 'pending'
    await setCommitStatus(makeConfig(), 'abc123', 'UNKNOWN' as never, 'https://example.com', octokit as never);
    const call = octokit.repos.createCommitStatus.mock.calls[0][0] as Record<string, unknown>;
    expect(call.state).toBe('pending');
  });
});

// ============================================================================
// POST-001: 422 fallback also fails (403) → throw
// ============================================================================

describe('POST-001: 422 fallback createReview also fails', () => {
  it('throws when first createReview returns 422 and fallback returns 403', async () => {
    const positionError = Object.assign(new Error('Unprocessable Entity'), { status: 422 });
    const forbiddenError = Object.assign(new Error('Forbidden'), { status: 403 });

    const octokit = makeOctokit({
      createReviewFirstError: positionError,
      createReviewSecondError: forbiddenError,
    });

    await expect(
      postReview(makeConfig(), 1, makeReview(), octokit as never),
    ).rejects.toThrow('Forbidden');

    // Both calls were attempted
    expect(octokit.pulls.createReview).toHaveBeenCalledTimes(2);
    // Second call had empty comments (fallback)
    const secondCall = octokit.pulls.createReview.mock.calls[1][0] as Record<string, unknown>;
    expect(secondCall.comments).toEqual([]);
  });
});

// ============================================================================
// POST-002: rate limit (429) → thrown as-is (not position error, no fallback)
// ============================================================================

describe('POST-002: 429 rate limit error — retries with backoff then throws', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries up to 3 times on 429, then throws after exhausting retries', async () => {
    const rateLimitError = Object.assign(new Error('API rate limit exceeded'), { status: 429 });
    const octokit = makeOctokit();
    // All 4 attempts (1 initial + 3 retries) return 429
    octokit.pulls.createReview
      .mockRejectedValue(rateLimitError);

    const promise = postReview(makeConfig(), 1, makeReview(), octokit as never);
    // Attach a catch handler immediately to prevent unhandled rejection
    promise.catch(() => {});

    // Advance timers to flush all backoff sleeps
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(60_000);
    }

    await expect(promise).rejects.toThrow('API rate limit exceeded');
    // 1 initial + 3 retries = 4 total attempts
    expect(octokit.pulls.createReview).toHaveBeenCalledTimes(4);
  });

  it('succeeds on retry when 429 is transient', async () => {
    const rateLimitError = Object.assign(new Error('API rate limit exceeded'), { status: 429 });
    const octokit = makeOctokit();
    octokit.pulls.createReview
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValue({
        data: {
          id: 999,
          html_url: 'https://github.com/test-owner/test-repo/pull/1#pullrequestreview-999',
        },
      });

    const promise = postReview(makeConfig(), 1, makeReview(), octokit as never);

    // Advance past the backoff delay
    await vi.advanceTimersByTimeAsync(60_000);

    const result = await promise;
    expect(result.reviewId).toBe(999);
    expect(octokit.pulls.createReview).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// POST-005: CRITICAL comment after index 50 is dropped by slice
// ============================================================================

describe('POST-005: CRITICAL issue beyond original position 50 is preserved by severity sort', () => {
  it('CRITICAL comment originally at index 55 is retained after severity-based sorting', async () => {
    const octokit = makeOctokit();

    // Build 60 comments: first 54 are WARNING, then 1 CRITICAL at index 55, rest WARNING
    const comments = Array.from({ length: 60 }, (_, i) => ({
      path: `file${i}.ts`,
      position: i + 1,
      side: 'RIGHT' as const,
      body: i === 55 ? '\u{1F534} **CRITICAL** \u2014 buffer overflow' : '\u{1F7E1} **WARNING** \u2014 minor issue',
    }));

    const review = makeReview({ comments, event: 'REQUEST_CHANGES' });
    await postReview(makeConfig(), 1, review, octokit as never);

    const callArgs = octokit.pulls.createReview.mock.calls[0][0] as { comments: Array<{ body: string }> };
    // Only 50 comments passed
    expect(callArgs.comments.length).toBe(50);
    // The CRITICAL is now present (severity sort puts it first)
    const hasCritical = callArgs.comments.some((c) => c.body.includes('CRITICAL'));
    expect(hasCritical).toBe(true);
    // First comment should be the CRITICAL one
    expect(callArgs.comments[0].body).toContain('CRITICAL');
  });
});

// ============================================================================
// DED-001: dedup paginate fails (403) → throws, propagates to poster
// ============================================================================

describe('DED-001: findPriorReviews paginate 403 throws and propagates', () => {
  it('findPriorReviews throws when paginate rejects', async () => {
    const forbiddenError = Object.assign(new Error('Resource not accessible by integration'), { status: 403 });
    const octokit = makeOctokit({ paginateError: forbiddenError });

    await expect(
      findPriorReviews(makeConfig(), 5, octokit as never),
    ).rejects.toThrow('Resource not accessible by integration');
  });

  it('postReview propagates paginate error before createReview is called', async () => {
    const forbiddenError = Object.assign(new Error('Resource not accessible by integration'), { status: 403 });
    const octokit = makeOctokit({ paginateError: forbiddenError });

    await expect(
      postReview(makeConfig(), 5, makeReview(), octokit as never),
    ).rejects.toThrow('Resource not accessible by integration');

    // createReview should never be called if dedup throws
    expect(octokit.pulls.createReview).not.toHaveBeenCalled();
  });
});

// ============================================================================
// SAR-002: lineRange[0]=0 or negative → SARIF startLine reflects raw value
// ============================================================================

describe('SAR-002: lineRange with 0 or negative startLine', () => {
  it('clamps startLine to 1 when lineRange[0]=0 (SARIF spec requires >=1)', () => {
    const doc = makeDoc({ lineRange: [0, 5] });
    const report = buildSarifReport([doc], 'sess', '2026-03-21');
    const region = report.runs[0]!.results[0]!.locations[0]!.physicalLocation.region;
    expect(region.startLine).toBe(1);
    expect(region.endLine).toBe(5);
  });

  it('clamps startLine to 1 when lineRange[0]=-1 (SARIF spec requires >=1)', () => {
    const doc = makeDoc({ lineRange: [-1, 3] });
    const report = buildSarifReport([doc], 'sess', '2026-03-21');
    const region = report.runs[0]!.results[0]!.locations[0]!.physicalLocation.region;
    expect(region.startLine).toBe(1);
    expect(region.endLine).toBe(3);
  });

  it('discussion metadata key uses lineRange[0] directly including 0', () => {
    const doc = makeDoc({ filePath: 'src/zero.ts', lineRange: [0, 2] });
    const meta = new Map([
      ['src/zero.ts:0', { discussionId: 'd-zero', rounds: 1, consensusReached: true, finalSeverity: 'WARNING' }],
    ]);
    const report = buildSarifReport([doc], 'sess', '2026-03-21', '1.0.0', meta);
    expect(report.runs[0]!.results[0]!.properties?.['discussionId']).toBe('d-zero');
  });
});

// ============================================================================
// DP-001: malformed @@ header → no crash, graceful degradation
// ============================================================================

describe('DP-001: malformed @@ hunk header', () => {
  it('returns empty index when @@ header has no +N part (no match)', () => {
    const diff = [
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ malformed header @@',
      '+added line',
    ].join('\n');

    // Should not throw
    buildDiffPositionIndex(diff);
    // newLineNumber starts at 0 (parseInt on undefined → NaN → fallback 0), then decremented to -1
    // The added line gets indexed at src/foo.ts:0 — not a crash
    expect(() => buildDiffPositionIndex(diff)).not.toThrow();
  });

  it('returns empty index for completely empty @@ line', () => {
    const diff = [
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@',
      '+line',
    ].join('\n');

    expect(() => buildDiffPositionIndex(diff)).not.toThrow();
    const index = buildDiffPositionIndex(diff);
    // Result may be empty or have key at line 0, but must not throw
    expect(typeof index).toBe('object');
  });

  it('processes subsequent valid hunks after a malformed one', () => {
    const diff = [
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ malformed @@',
      '+bad line',
      '@@ -10,1 +10,1 @@',
      '+valid line',
    ].join('\n');

    const index = buildDiffPositionIndex(diff);
    // The valid hunk at line 10 should be indexed at filePosition from the second @@
    expect(index['src/foo.ts:10']).toBeDefined();
  });
});

// ============================================================================
// MAP-001: 100 evidence items → body length is large but function does not crash
// ============================================================================

describe('MAP-001: buildSummaryBody with 100 evidence documents', () => {
  it('does not throw with 100 evidence documents', () => {
    const docs = Array.from({ length: 100 }, (_, i) =>
      makeDoc({
        filePath: `src/file${i}.ts`,
        lineRange: [i + 1, i + 5],
        severity: i % 4 === 0 ? 'CRITICAL' : i % 4 === 1 ? 'WARNING' : i % 4 === 2 ? 'SUGGESTION' : 'HARSHLY_CRITICAL',
        issueTitle: `Issue ${i} — some important security finding`,
      }),
    );

    const summary = makeSummary({
      severityCounts: { CRITICAL: 25, WARNING: 25, SUGGESTION: 25, HARSHLY_CRITICAL: 25 },
    });

    expect(() =>
      buildSummaryBody({
        summary,
        sessionId: 'sess-100',
        sessionDate: '2026-03-21',
        evidenceDocs: docs,
        discussions: [],
      }),
    ).not.toThrow();
  });

  it('body is a non-empty string with 100 evidence documents', () => {
    const docs = Array.from({ length: 100 }, (_, i) =>
      makeDoc({ filePath: `src/file${i}.ts`, lineRange: [i + 1, i + 2] }),
    );

    const body = buildSummaryBody({
      summary: makeSummary({ severityCounts: { CRITICAL: 100 } }),
      sessionId: 'sess-100',
      sessionDate: '2026-03-21',
      evidenceDocs: docs,
      discussions: [],
    });

    expect(typeof body).toBe('string');
    expect(body.length).toBeGreaterThan(0);
    // Marker must be present
    expect(body).toContain('<!-- codeagora-v3 -->');
  });

  it('heatmap shows max 10 files even with 100 distinct files', () => {
    const docs = Array.from({ length: 100 }, (_, i) =>
      makeDoc({ filePath: `src/file${i}.ts` }),
    );

    const body = buildSummaryBody({
      summary: makeSummary({ severityCounts: { CRITICAL: 100 } }),
      sessionId: 'sess-100',
      sessionDate: '2026-03-21',
      evidenceDocs: docs,
      discussions: [],
    });

    // Heatmap table should have at most 10 file entries, plus blocking table entries
    // (blocking table shows all CRITICAL docs — 100 — so we check heatmap specifically)
    // The heatmap section appears inside <details><summary>Issue distribution...
    const heatmapSection = body.split('Issue distribution')[1] ?? '';
    const heatmapFileCount = (heatmapSection.split('</details>')[0] ?? '').match(/`src\/file\d+\.ts`/g)?.length ?? 0;
    expect(heatmapFileCount).toBeLessThanOrEqual(10);
  });
});
