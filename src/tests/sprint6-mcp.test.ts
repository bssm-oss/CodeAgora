/**
 * Tests for Sprint 6 — MCP Server modules
 * Covers: compact formatter, lightweight mode (skipHead), MCP tool registration
 */

import { describe, it, expect } from 'vitest';
import { formatCompact } from '@codeagora/core/pipeline/compact-formatter.js';
import type { EvidenceDocument, DiscussionVerdict } from '@codeagora/core/types/core.js';

// ============================================================================
// Compact Formatter (6.4)
// ============================================================================

const makeDoc = (overrides: Partial<EvidenceDocument> = {}): EvidenceDocument => ({
  issueTitle: 'Test Issue',
  problem: 'Something is wrong',
  evidence: ['line 42 does X'],
  severity: 'WARNING',
  suggestion: 'Fix it',
  filePath: 'src/test.ts',
  lineRange: [42, 45] as [number, number],
  confidence: 75,
  ...overrides,
});

describe('formatCompact', () => {
  it('converts evidence docs to compact issues', () => {
    const result = formatCompact({
      decision: 'REJECT',
      reasoning: 'Found critical issues',
      evidenceDocs: [
        makeDoc({ severity: 'CRITICAL', issueTitle: 'SQL Injection', filePath: 'src/auth.ts', lineRange: [10, 15], confidence: 87 }),
        makeDoc({ severity: 'WARNING', issueTitle: 'Missing handler', filePath: 'src/api.ts', lineRange: [20, 25] }),
      ],
    });

    expect(result.decision).toBe('REJECT');
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].severity).toBe('CRITICAL');
    expect(result.issues[0].file).toBe('src/auth.ts');
    expect(result.issues[0].line).toBe(10);
    expect(result.issues[0].title).toBe('SQL Injection');
    expect(result.issues[0].confidence).toBe(87);
  });

  it('filters out dismissed issues from discussions', () => {
    const discussions: DiscussionVerdict[] = [
      {
        discussionId: 'd1',
        filePath: 'src/test.ts',
        lineRange: [42, 45],
        finalSeverity: 'DISMISSED',
        reasoning: 'Not a real issue',
        consensusReached: true,
        rounds: 1,
      },
    ];

    const result = formatCompact({
      decision: 'ACCEPT',
      reasoning: 'All clear',
      evidenceDocs: [makeDoc()],
      discussions,
    });

    expect(result.issues).toHaveLength(0);
    expect(result.summary).toBe('no issues');
  });

  it('includes flaggedBy from reviewerMap', () => {
    const result = formatCompact({
      decision: 'REJECT',
      reasoning: 'Issues found',
      evidenceDocs: [makeDoc()],
      reviewerMap: { 'src/test.ts:42': ['claude-sonnet', 'gpt-4o'] },
    });

    expect(result.issues[0].flaggedBy).toEqual(['claude-sonnet', 'gpt-4o']);
  });

  it('generates severity summary string', () => {
    const result = formatCompact({
      decision: 'REJECT',
      reasoning: 'Issues found',
      evidenceDocs: [
        makeDoc({ severity: 'CRITICAL' }),
        makeDoc({ severity: 'CRITICAL', filePath: 'b.ts', lineRange: [1, 5] }),
        makeDoc({ severity: 'WARNING', filePath: 'c.ts', lineRange: [10, 15] }),
      ],
    });

    expect(result.summary).toContain('2 critical');
    expect(result.summary).toContain('1 warning');
  });

  it('truncates reasoning to 200 chars', () => {
    const longReasoning = 'A'.repeat(500);
    const result = formatCompact({
      decision: 'REJECT',
      reasoning: longReasoning,
      evidenceDocs: [],
    });

    expect(result.reasoning.length).toBe(200);
  });

  it('includes optional cost and sessionId', () => {
    const result = formatCompact({
      decision: 'ACCEPT',
      reasoning: 'Clean',
      evidenceDocs: [],
      cost: '$0.05',
      sessionId: '2026-03-19/001',
    });

    expect(result.cost).toBe('$0.05');
    expect(result.sessionId).toBe('2026-03-19/001');
  });

  it('omits cost and sessionId when not provided', () => {
    const result = formatCompact({
      decision: 'ACCEPT',
      reasoning: 'Clean',
      evidenceDocs: [],
    });

    expect(result.cost).toBeUndefined();
    expect(result.sessionId).toBeUndefined();
  });

  it('defaults confidence to 50 when not set', () => {
    const result = formatCompact({
      decision: 'REJECT',
      reasoning: 'Issue',
      evidenceDocs: [makeDoc({ confidence: undefined })],
    });

    expect(result.issues[0].confidence).toBe(50);
  });

  it('includes reviewerOpinions per issue when provided', () => {
    const result = formatCompact({
      decision: 'REJECT',
      reasoning: 'Issues found',
      evidenceDocs: [makeDoc()],
      reviewerOpinions: {
        'src/test.ts:42': [
          { reviewerId: 'gpt-4o', model: 'gpt-4o', severity: 'CRITICAL', problem: 'Null crash', evidence: ['line 42'], suggestion: 'Add check' },
          { reviewerId: 'claude', model: 'claude-sonnet', severity: 'WARNING', problem: 'Maybe null', evidence: [], suggestion: 'Consider guard' },
        ],
      },
    });

    expect(result.issues[0].opinions).toHaveLength(2);
    expect(result.issues[0].opinions![0].reviewerId).toBe('gpt-4o');
    expect(result.issues[0].opinions![1].reviewerId).toBe('claude');
  });

  it('omits opinions field when reviewerOpinions not provided', () => {
    const result = formatCompact({
      decision: 'REJECT',
      reasoning: 'Issues found',
      evidenceDocs: [makeDoc()],
    });

    expect(result.issues[0].opinions).toBeUndefined();
  });
});

// ============================================================================
// Lightweight Mode (6.2) — skipHead in PipelineInput
// ============================================================================

describe('PipelineInput skipHead type', () => {
  it('skipHead is accepted in PipelineInput interface', async () => {
    // Type-level test: verify the interface accepts skipHead
    const input: import('@codeagora/core/pipeline/orchestrator.js').PipelineInput = {
      diffPath: '/tmp/test.patch',
      skipDiscussion: true,
      skipHead: true,
    };
    expect(input.skipHead).toBe(true);
  });
});

// ============================================================================
// MCP Tool Registration (6.1) — verify tools can be imported
// ============================================================================

describe('MCP tool modules', () => {
  it('review-quick exports registerReviewQuick', async () => {
    const mod = await import('@codeagora/mcp/tools/review-quick.js');
    expect(typeof mod.registerReviewQuick).toBe('function');
  });

  it('review-full exports registerReviewFull', async () => {
    const mod = await import('@codeagora/mcp/tools/review-full.js');
    expect(typeof mod.registerReviewFull).toBe('function');
  });

  it('dry-run exports registerDryRun', async () => {
    const mod = await import('@codeagora/mcp/tools/dry-run.js');
    expect(typeof mod.registerDryRun).toBe('function');
  });

  it('explain exports registerExplain', async () => {
    const mod = await import('@codeagora/mcp/tools/explain.js');
    expect(typeof mod.registerExplain).toBe('function');
  });

  it('leaderboard exports registerLeaderboard', async () => {
    const mod = await import('@codeagora/mcp/tools/leaderboard.js');
    expect(typeof mod.registerLeaderboard).toBe('function');
  });

  it('stats exports registerStats', async () => {
    const mod = await import('@codeagora/mcp/tools/stats.js');
    expect(typeof mod.registerStats).toBe('function');
  });

  it('helpers exports runQuickReview and runFullReview', async () => {
    const mod = await import('@codeagora/mcp/helpers.js');
    expect(typeof mod.runQuickReview).toBe('function');
    expect(typeof mod.runFullReview).toBe('function');
  });
});
