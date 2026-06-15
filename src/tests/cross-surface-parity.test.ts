/**
 * Deterministic CLI/MCP/GitHub Action parity evidence.
 *
 * This fixture stays provider-free: every surface consumes the same
 * PipelineResult and must preserve the stable decision and issue contract
 * without comparing nondeterministic prose snapshots.
 */

import { describe, expect, it } from 'vitest';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';
import { formatOutput } from '@codeagora/cli/formatters/review-output.js';
import { formatReviewResult } from '@codeagora/mcp/post-actions.js';
import { buildDiffPositionIndex } from '@codeagora/github/diff-parser.js';
import { mapToGitHubReview } from '@codeagora/github/mapper.js';
import { buildSarifReport } from '@codeagora/github/sarif.js';
import { REVIEW_CONTRACT_VERSION, SARIF_SEVERITY_RULES } from '@codeagora/shared/contracts/stable.js';

const RAW_SECRET = 'sk-crosssurface123456789';

function makeDoc(overrides: Partial<EvidenceDocument>): EvidenceDocument {
  return {
    issueTitle: 'Hardcoded provider token',
    problem: `The diff exposes OPENAI_API_KEY=${RAW_SECRET} in source.`,
    evidence: [`Authorization: Bearer ${RAW_SECRET}`],
    severity: 'CRITICAL',
    suggestion: 'Move the key to a secret manager and read it from the environment.',
    filePath: 'src/auth.ts',
    lineRange: [2, 2],
    confidence: 91,
    ...overrides,
  };
}

function issueIdentity(doc: Pick<EvidenceDocument, 'severity' | 'filePath' | 'lineRange' | 'issueTitle'>): string {
  return `${doc.severity}:${doc.filePath}:${doc.lineRange[0]}-${doc.lineRange[1]}:${doc.issueTitle}`;
}

function makeResult(): PipelineResult {
  const evidenceDocs = [
    makeDoc({}),
    makeDoc({
      issueTitle: 'Missing rate limit',
      problem: 'The login endpoint does not throttle repeated failures.',
      evidence: ['POST /login can be repeated without delay.'],
      severity: 'WARNING',
      suggestion: 'Add IP and account-level throttling.',
      filePath: 'src/auth.ts',
      lineRange: [4, 4],
      confidence: 74,
    }),
  ];

  return {
    sessionId: 'parity-001',
    date: '2026-05-04',
    status: 'success',
    summary: {
      decision: 'REJECT',
      reasoning: `Blocking security issue references ${RAW_SECRET}.`,
      totalReviewers: 3,
      forfeitedReviewers: 0,
      severityCounts: {
        HARSHLY_CRITICAL: 0,
        CRITICAL: 1,
        WARNING: 1,
        SUGGESTION: 0,
      },
      topIssues: evidenceDocs.map((doc) => ({
        severity: doc.severity,
        filePath: doc.filePath,
        lineRange: doc.lineRange,
        title: doc.issueTitle,
        confidence: doc.confidence,
      })),
      totalDiscussions: 0,
      resolved: 0,
      escalated: 0,
    },
    evidenceDocs,
    discussions: [],
    reviewerMap: {
      'src/auth.ts:2': ['security-reviewer', 'api-reviewer'],
      'src/auth.ts:4': ['security-reviewer'],
    },
  };
}

function makeDiff(): string {
  return [
    'diff --git a/src/auth.ts b/src/auth.ts',
    '--- a/src/auth.ts',
    '+++ b/src/auth.ts',
    '@@ -1,4 +1,4 @@',
    ' export function login() {',
    `+  const token = "${RAW_SECRET}";`,
    '   authenticate();',
    '+  recordFailure();',
    ' }',
  ].join('\n');
}

describe('CLI/MCP/GitHub Action cross-surface parity', () => {
  it('preserves stable review identity, severity mapping, session markers, and redaction', async () => {
    const result = makeResult();
    const expectedIdentities = result.evidenceDocs!.map(issueIdentity);

    const cliJson = JSON.parse(formatOutput(result, 'json'));
    const mcpJson = JSON.parse(await formatReviewResult(result, 'json'));

    expect(cliJson).toEqual(mcpJson);
    expect(cliJson.schemaVersion).toBe(REVIEW_CONTRACT_VERSION);
    expect(cliJson.summary.decision).toBe('REJECT');
    expect(cliJson.sessionId).toBe('parity-001');
    expect(cliJson.evidenceDocs.map(issueIdentity)).toEqual(expectedIdentities);
    expect(JSON.stringify(cliJson)).not.toContain(RAW_SECRET);
    expect(JSON.stringify(mcpJson)).not.toContain(RAW_SECRET);

    const positionIndex = buildDiffPositionIndex(makeDiff());
    const githubReview = mapToGitHubReview({
      summary: result.summary!,
      evidenceDocs: result.evidenceDocs!,
      discussions: [],
      positionIndex,
      headSha: 'abc123',
      sessionId: result.sessionId,
      sessionDate: result.date,
      reviewerMap: new Map(Object.entries(result.reviewerMap!)),
    });

    expect(githubReview.event).toBe('REQUEST_CHANGES');
    expect(githubReview.verdict).toBe('REJECT');
    expect(githubReview.commit_id).toBe('abc123');
    expect(githubReview.body).toContain('parity-001');
    expect(githubReview.comments).toHaveLength(1);
    expect(githubReview.comments.map((comment) => comment.path)).toEqual(['src/auth.ts']);
    expect(githubReview.comments[0]!.body).toContain('Hardcoded provider token');
    expect(githubReview.comments[0]!.body).not.toContain('Missing rate limit');
    expect(JSON.stringify(githubReview)).not.toContain(RAW_SECRET);
    expect(JSON.stringify(githubReview)).toContain('[REDACTED]');

    const sarif = buildSarifReport(result.evidenceDocs!, result.sessionId, result.date);
    expect(sarif.runs[0].automationDetails.id).toBe('codeagora/2026-05-04/parity-001');
    expect(sarif.runs[0].results).toHaveLength(expectedIdentities.length);
    expect(sarif.runs[0].results.map((sarifResult) => sarifResult.ruleId)).toEqual([
      SARIF_SEVERITY_RULES.CRITICAL.ruleId,
      SARIF_SEVERITY_RULES.WARNING.ruleId,
    ]);
    expect(JSON.stringify(sarif)).not.toContain(RAW_SECRET);
    expect(JSON.stringify(sarif)).toContain('[REDACTED]');
  });

  it('uses the same public decision contract when a raw REJECT is demoted', async () => {
    const result = {
      ...makeResult(),
      summary: {
        ...makeResult().summary!,
        decision: 'REJECT',
        reasoning: 'Raw head verdict rejected, but no complete promotion evidence remained.',
      },
      decisionBrief: {
        decision: 'ACCEPT',
        reviewedScope: {
          files: ['src/auth.ts'],
          areas: ['logic changes'],
          contracts: ['provider token contract'],
          checks: ['evidence promotion'],
          uncertainty: 'Non-promoted findings remain audit only.',
        },
        completedChecks: ['evidence promotion'],
        evidenceCards: [],
        requiredActions: [],
        followUpCount: 2,
        auditCount: 2,
        demotedCount: 1,
      },
    } satisfies PipelineResult;

    const cliText = formatOutput(result, 'text');
    const cliMarkdown = formatOutput(result, 'md');
    const cliGithub = formatOutput(result, 'github');
    const cliJson = JSON.parse(formatOutput(result, 'json'));
    const mcpJson = JSON.parse(await formatReviewResult(result, 'json'));
    const githubReview = mapToGitHubReview({
      summary: result.summary!,
      evidenceDocs: result.evidenceDocs!,
      discussions: [],
      positionIndex: buildDiffPositionIndex(makeDiff()),
      headSha: 'abc123',
      sessionId: result.sessionId,
      sessionDate: result.date,
      reviewerMap: new Map(Object.entries(result.reviewerMap!)),
      decisionBrief: result.decisionBrief,
    });

    expect(cliText).toContain('ACCEPT');
    expect(cliText).toContain('REJECT -> ACCEPT');
    expect(cliMarkdown).toContain('**Decision:** ACCEPT');
    expect(cliGithub).toContain('**Decision:** ACCEPT');
    expect(cliJson.publicDecision).toBe('ACCEPT');
    expect(cliJson.summary.decision).toBe('REJECT');
    expect(mcpJson.publicDecision).toBe('ACCEPT');
    expect(githubReview.verdict).toBe('ACCEPT');
    expect(githubReview.event).toBe('APPROVE');
    expect(githubReview.comments).toHaveLength(0);
  });
});
