import { describe, it, expect } from 'vitest';
import {
  mapToInlineCommentBody,
  buildReviewComments,
  buildSummaryBody,
  mapToGitHubReview,
} from '@codeagora/github/mapper.js';
import type { EvidenceDocument, DiscussionVerdict } from '@codeagora/core/types/core.js';
import type { DiffPositionIndex } from '@codeagora/github/types.js';
import type { PipelineSummary } from '@codeagora/core/pipeline/orchestrator.js';

const makeDoc = (overrides?: Partial<EvidenceDocument>): EvidenceDocument => ({
  issueTitle: 'SQL injection vulnerability',
  problem: 'User input concatenated into SQL query',
  evidence: ['query = "SELECT * FROM users WHERE id = " + userId'],
  severity: 'CRITICAL',
  suggestion: 'Use parameterized queries',
  filePath: 'src/db/queries.ts',
  lineRange: [42, 45] as [number, number],
  ...overrides,
});

const makeDiscussion = (overrides?: Partial<DiscussionVerdict>): DiscussionVerdict => ({
  discussionId: 'd001',
  filePath: 'src/db/queries.ts',
  lineRange: [42, 45] as [number, number],
  finalSeverity: 'CRITICAL',
  reasoning: 'Confirmed exploitable',
  consensusReached: true,
  rounds: 1,
  ...overrides,
});

const makeSummary = (overrides?: Partial<PipelineSummary>): PipelineSummary => ({
  decision: 'REJECT',
  reasoning: 'Blocking issues found',
  totalReviewers: 3,
  forfeitedReviewers: 0,
  severityCounts: { CRITICAL: 1 },
  topIssues: [],
  totalDiscussions: 1,
  resolved: 1,
  escalated: 0,
  ...overrides,
});

describe('mapToInlineCommentBody', () => {
  it('includes severity badge, problem, evidence, and suggestion', () => {
    const body = mapToInlineCommentBody(makeDoc());
    expect(body).toContain('**CRITICAL**');
    expect(body).toContain('SQL injection vulnerability');
    expect(body).toContain('**Problem:**');
    expect(body).toContain('**Evidence:**');
    expect(body).toContain('**Suggestion:**');
  });

  it('includes discussion summary when provided', () => {
    const body = mapToInlineCommentBody(makeDoc(), makeDiscussion());
    expect(body).toContain('<details>');
    expect(body).toContain('d001');
    expect(body).toContain('consensus');
  });

  it('shows forced decision for non-consensus', () => {
    const body = mapToInlineCommentBody(
      makeDoc(),
      makeDiscussion({ consensusReached: false }),
    );
    expect(body).toContain('forced decision');
  });

  it('includes reviewer IDs when provided', () => {
    const body = mapToInlineCommentBody(makeDoc(), undefined, ['r1-kimi', 'r2-codex']);
    expect(body).toContain('r1-kimi');
    expect(body).toContain('r2-codex');
    expect(body).toContain('CodeAgora');
  });

  it('handles empty evidence array', () => {
    const body = mapToInlineCommentBody(makeDoc({ evidence: [] }));
    expect(body).not.toContain('**Evidence:**');
  });

  it('renders all severity levels correctly', () => {
    for (const severity of ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION'] as const) {
      const body = mapToInlineCommentBody(makeDoc({ severity }));
      expect(body).toContain(`**${severity === 'HARSHLY_CRITICAL' ? 'HARSHLY CRITICAL' : severity}**`);
    }
  });
});

describe('buildReviewComments', () => {
  it('creates inline comment with position when line is in diff', () => {
    const index: DiffPositionIndex = { 'src/db/queries.ts:42': 14 };
    const comments = buildReviewComments([makeDoc()], [], index);
    expect(comments).toHaveLength(1);
    expect(comments[0].path).toBe('src/db/queries.ts');
    expect(comments[0].position).toBe(14);
    expect(comments[0].side).toBe('RIGHT');
  });

  it('creates file-level comment when line is not in diff', () => {
    const index: DiffPositionIndex = {}; // empty — line not found
    const comments = buildReviewComments([makeDoc()], [], index);
    expect(comments).toHaveLength(1);
    expect(comments[0].position).toBeUndefined();
    expect(comments[0].body).toContain('src/db/queries.ts:42-45');
  });

  it('skips dismissed issues', () => {
    const discussion = makeDiscussion({ finalSeverity: 'DISMISSED' });
    const index: DiffPositionIndex = { 'src/db/queries.ts:42': 14 };
    const comments = buildReviewComments([makeDoc()], [discussion], index);
    expect(comments).toHaveLength(0);
  });

  it('handles multiple documents', () => {
    const docs = [
      makeDoc(),
      makeDoc({ filePath: 'src/auth.ts', lineRange: [10, 12] }),
    ];
    const index: DiffPositionIndex = {
      'src/db/queries.ts:42': 14,
      'src/auth.ts:10': 5,
    };
    const comments = buildReviewComments(docs, [], index);
    expect(comments).toHaveLength(2);
  });
});

describe('buildSummaryBody', () => {
  it('includes verdict and marker', () => {
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: '001',
      sessionDate: '2026-03-16',
      evidenceDocs: [makeDoc()],
      discussions: [makeDiscussion()],
    });
    expect(body).toContain('<!-- codeagora-v3 -->');
    expect(body).toContain('REJECT');
    expect(body).toContain('CodeAgora Review');
  });

  it('renders blocking issues table for critical docs', () => {
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: '001',
      sessionDate: '2026-03-16',
      evidenceDocs: [makeDoc()],
      discussions: [],
    });
    expect(body).toContain('Blocking Issues');
    expect(body).toContain('src/db/queries.ts');
  });

  it('collapses warnings and suggestions', () => {
    const docs = [
      makeDoc({ severity: 'WARNING', issueTitle: 'A warning' }),
      makeDoc({ severity: 'SUGGESTION', issueTitle: 'A suggestion' }),
    ];
    const body = buildSummaryBody({
      summary: makeSummary({ severityCounts: { WARNING: 1, SUGGESTION: 1 } }),
      sessionId: '001',
      sessionDate: '2026-03-16',
      evidenceDocs: docs,
      discussions: [],
    });
    expect(body).toContain('1 warning(s)');
    expect(body).toContain('1 suggestion(s)');
    expect(body).toContain('<details>');
  });

  it('includes session reference in footer', () => {
    const body = buildSummaryBody({
      summary: makeSummary({ decision: 'ACCEPT' }),
      sessionId: '003',
      sessionDate: '2026-03-16',
      evidenceDocs: [],
      discussions: [],
    });
    expect(body).toContain('2026-03-16/003');
  });
});

describe('mapToGitHubReview', () => {
  it('sets REQUEST_CHANGES when critical issues exist', () => {
    const index: DiffPositionIndex = { 'src/db/queries.ts:42': 14 };
    const review = mapToGitHubReview({
      summary: makeSummary(),
      evidenceDocs: [makeDoc()],
      discussions: [],
      positionIndex: index,
      headSha: 'abc123',
      sessionId: '001',
      sessionDate: '2026-03-16',
    });
    expect(review.event).toBe('REQUEST_CHANGES');
    expect(review.commit_id).toBe('abc123');
    expect(review.comments.length).toBeGreaterThan(0);
  });

  it('sets COMMENT when no critical issues', () => {
    const index: DiffPositionIndex = { 'src/foo.ts:10': 5 };
    const review = mapToGitHubReview({
      summary: makeSummary({ decision: 'ACCEPT' }),
      evidenceDocs: [makeDoc({ severity: 'SUGGESTION', filePath: 'src/foo.ts', lineRange: [10, 12] })],
      discussions: [],
      positionIndex: index,
      headSha: 'def456',
      sessionId: '002',
      sessionDate: '2026-03-16',
    });
    expect(review.event).toBe('COMMENT');
  });

  it('filters out dismissed documents', () => {
    const index: DiffPositionIndex = { 'src/db/queries.ts:42': 14 };
    const review = mapToGitHubReview({
      summary: makeSummary(),
      evidenceDocs: [makeDoc()],
      discussions: [makeDiscussion({ finalSeverity: 'DISMISSED' })],
      positionIndex: index,
      headSha: 'abc123',
      sessionId: '001',
      sessionDate: '2026-03-16',
    });
    expect(review.comments).toHaveLength(0);
  });
});
