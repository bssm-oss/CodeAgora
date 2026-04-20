/**
 * Advanced Review Output Formatter Tests
 * Covers new sections: diffComplexity, reviewer meta, discussions, questionsForHuman,
 * performanceText, and formatGithub issue checkboxes.
 */

import { describe, it, expect } from 'vitest';
import { formatText, formatMarkdown, formatGithub } from '../formatters/review-output.js';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'SQL Injection',
    problem: 'User input is concatenated directly into SQL query.',
    evidence: ['Line 42: query = "SELECT * FROM users WHERE id = " + userId'],
    severity: 'CRITICAL',
    suggestion: 'Use parameterized queries.',
    filePath: 'src/auth.ts',
    lineRange: [42, 45],
    confidence: 87,
    ...overrides,
  };
}

function makeResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    sessionId: 'test-001',
    date: '2026-04-13',
    status: 'success',
    summary: {
      decision: 'REJECT',
      reasoning: 'Critical security issues found.',
      totalReviewers: 3,
      forfeitedReviewers: 0,
      severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 1, WARNING: 1, SUGGESTION: 0 },
      topIssues: [
        { severity: 'CRITICAL', filePath: 'src/auth.ts', lineRange: [42, 45], title: 'SQL Injection' },
      ],
      totalDiscussions: 0,
      resolved: 0,
      escalated: 0,
    },
    evidenceDocs: [makeDoc()],
    discussions: [],
    ...overrides,
  };
}

// ============================================================================
// formatText — diffComplexity stats header
// ============================================================================

describe('formatText — diffComplexity header', () => {
  it('shows file count, added/removed lines, and level', () => {
    const result = makeResult({
      diffComplexity: {
        level: 'MEDIUM',
        fileCount: 7,
        totalLines: 185,
        addedLines: 143,
        removedLines: 42,
        securitySensitiveFiles: [],
        estimatedReviewCost: '$0.02',
      },
    });

    const out = formatText(result);
    expect(out).toContain('7 files');
    expect(out).toContain('+143');
    expect(out).toContain('−42');
    expect(out).toContain('MEDIUM');
  });

  it('shows security-sensitive file warnings', () => {
    const result = makeResult({
      diffComplexity: {
        level: 'HIGH',
        fileCount: 3,
        totalLines: 80,
        addedLines: 50,
        removedLines: 30,
        securitySensitiveFiles: ['src/auth.ts', 'src/session.ts'],
        estimatedReviewCost: '$0.03',
      },
    });

    const out = formatText(result);
    expect(out).toContain('auth.ts');
    expect(out).toContain('session.ts');
    expect(out).toContain('⚠');
  });

  it('omits diff stats section when diffComplexity is absent', () => {
    const result = makeResult();
    const out = formatText(result);
    // No file count or line stats
    expect(out).not.toContain('files  +');
  });
});

// ============================================================================
// formatText — reviewer meta in issue
// ============================================================================

describe('formatText — reviewer meta per issue', () => {
  it('shows reviewer agreement count when reviewerMap is present', () => {
    const result = makeResult({
      reviewerMap: { 'src/auth.ts:42': ['r1', 'r2', 'r3'] },
    });

    const out = formatText(result);
    expect(out).toContain('3/3 reviewers');
  });

  it('shows partial reviewer agreement', () => {
    const result = makeResult({
      reviewerMap: { 'src/auth.ts:42': ['r1', 'r2'] },
    });

    const out = formatText(result);
    expect(out).toContain('2/3 reviewers');
  });

  it('shows verified fix badge when suggestionVerified is passed', () => {
    const result = makeResult({
      evidenceDocs: [makeDoc({ suggestionVerified: 'passed' })],
    });

    const out = formatText(result);
    expect(out).toContain('fix verified');
  });

  it('shows unverified fix badge when suggestionVerified is failed', () => {
    const result = makeResult({
      evidenceDocs: [makeDoc({ suggestionVerified: 'failed' })],
    });

    const out = formatText(result);
    expect(out).toContain('fix unverified');
  });

  it('omits meta line when no reviewerMap and no verification status', () => {
    const result = makeResult({ reviewerMap: {} });
    const out = formatText(result);
    // reviewer meta line should not appear
    expect(out).not.toMatch(/\d+\/\d+ reviewers/);
  });
});

// ============================================================================
// formatText — L2 discussions section
// ============================================================================

describe('formatText — discussions section', () => {
  it('renders discussions section when non-dismissed discussions exist', () => {
    const result = makeResult({
      discussions: [
        {
          discussionId: 'd001',
          filePath: 'src/auth.ts',
          lineRange: [42, 45],
          finalSeverity: 'CRITICAL',
          reasoning: 'Agreed by all reviewers',
          consensusReached: true,
          rounds: 3,
          avgConfidence: 87,
        },
      ],
    });

    const out = formatText(result);
    expect(out).toContain('discussions');
    expect(out).toContain('d001');
    expect(out).toContain('src/auth.ts:42');
    expect(out).toContain('consensus');
    expect(out).toContain('3 rounds');
    expect(out).toContain('87%');
  });

  it('shows escalated icon for non-consensus discussion', () => {
    const result = makeResult({
      discussions: [
        {
          discussionId: 'd002',
          filePath: 'src/utils.ts',
          lineRange: [15, 18],
          finalSeverity: 'WARNING',
          reasoning: 'No consensus reached',
          consensusReached: false,
          rounds: 2,
          avgConfidence: 45,
        },
      ],
    });

    const out = formatText(result);
    expect(out).toContain('escalated');
    expect(out).toContain('✖');
  });

  it('omits discussions section when all discussions are dismissed', () => {
    const result = makeResult({
      discussions: [
        {
          discussionId: 'd003',
          filePath: 'src/ignored.ts',
          lineRange: [1, 2],
          finalSeverity: 'DISMISSED',
          reasoning: 'Not a real issue',
          consensusReached: false,
          rounds: 1,
        },
      ],
    });

    const out = formatText(result);
    expect(out).not.toContain('discussions ─');
  });

  it('omits discussions section when discussions array is empty', () => {
    const result = makeResult({ discussions: [] });
    const out = formatText(result);
    expect(out).not.toContain('discussions ─');
  });
});

// ============================================================================
// formatText — questions for human
// ============================================================================

describe('formatText — questions for human', () => {
  it('renders questions section when decision is NEEDS_HUMAN and questions exist', () => {
    const result = makeResult({
      summary: {
        decision: 'NEEDS_HUMAN',
        reasoning: 'Ambiguous findings.',
        totalReviewers: 3,
        forfeitedReviewers: 0,
        severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 0, WARNING: 1, SUGGESTION: 0 },
        topIssues: [],
        totalDiscussions: 1,
        resolved: 0,
        escalated: 1,
        questionsForHuman: [
          'Please verify d001 (src/auth.ts:42) — CRITICAL, 23% conf',
          'Is the input always sanitized before this point?',
        ],
      },
    });

    const out = formatText(result);
    expect(out).toContain('questions for human');
    expect(out).toContain('Please verify d001');
    expect(out).toContain('Is the input always sanitized');
  });

  it('omits questions section when decision is REJECT', () => {
    const result = makeResult({
      summary: {
        decision: 'REJECT',
        reasoning: 'Security issues found.',
        totalReviewers: 3,
        forfeitedReviewers: 0,
        severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
        topIssues: [],
        totalDiscussions: 0,
        resolved: 0,
        escalated: 0,
        questionsForHuman: ['Some question'],
      },
    });

    const out = formatText(result);
    expect(out).not.toContain('questions for human');
  });

  it('omits questions section when questionsForHuman is absent', () => {
    const result = makeResult({
      summary: {
        decision: 'NEEDS_HUMAN',
        reasoning: 'Ambiguous findings.',
        totalReviewers: 3,
        forfeitedReviewers: 0,
        severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 0, WARNING: 1, SUGGESTION: 0 },
        topIssues: [],
        totalDiscussions: 1,
        resolved: 0,
        escalated: 1,
      },
    });

    const out = formatText(result);
    expect(out).not.toContain('questions for human');
  });
});

// ============================================================================
// formatText — performance section
// ============================================================================

describe('formatText — performance section', () => {
  it('shows performanceText in verbose mode', () => {
    const result = makeResult({ performanceText: 'Total: 12.4s  L1: 8.1s  L2: 3.2s  L3: 1.1s' });
    const out = formatText(result, { verbose: true });
    expect(out).toContain('performance');
    expect(out).toContain('Total: 12.4s');
  });

  it('hides performanceText in non-verbose mode', () => {
    const result = makeResult({ performanceText: 'Total: 12.4s  L1: 8.1s  L2: 3.2s  L3: 1.1s' });
    const out = formatText(result);
    expect(out).not.toContain('performance');
    expect(out).not.toContain('Total: 12.4s');
  });
});

// ============================================================================
// formatMarkdown — discussions table
// ============================================================================

describe('formatMarkdown — discussions table', () => {
  it('renders L2 discussions as markdown table', () => {
    const result = makeResult({
      discussions: [
        {
          discussionId: 'd001',
          filePath: 'src/auth.ts',
          lineRange: [42, 45],
          finalSeverity: 'CRITICAL',
          reasoning: 'All agreed',
          consensusReached: true,
          rounds: 3,
          avgConfidence: 87,
        },
      ],
    });

    const out = formatMarkdown(result);
    expect(out).toContain('### L2 Discussions');
    expect(out).toContain('| Discussion | Location | Severity | Outcome | Rounds | Confidence |');
    expect(out).toContain('| d001 |');
    expect(out).toContain('src/auth.ts:42');
    expect(out).toContain('CRITICAL');
    expect(out).toContain('consensus');
    expect(out).toContain('87%');
  });

  it('shows dash for missing avgConfidence', () => {
    const result = makeResult({
      discussions: [
        {
          discussionId: 'd002',
          filePath: 'src/db.ts',
          lineRange: [10, 12],
          finalSeverity: 'WARNING',
          reasoning: 'Escalated',
          consensusReached: false,
          rounds: 2,
        },
      ],
    });

    const out = formatMarkdown(result);
    expect(out).toContain('| — |');
  });
});

// ============================================================================
// formatMarkdown — questions for human
// ============================================================================

describe('formatMarkdown — questions for human', () => {
  it('renders questions as numbered list', () => {
    const result = makeResult({
      summary: {
        decision: 'NEEDS_HUMAN',
        reasoning: 'Ambiguous.',
        totalReviewers: 3,
        forfeitedReviewers: 0,
        severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 0, WARNING: 1, SUGGESTION: 0 },
        topIssues: [],
        totalDiscussions: 1,
        resolved: 0,
        escalated: 1,
        questionsForHuman: ['Is the input validated upstream?', 'Can this be exploited remotely?'],
      },
    });

    const out = formatMarkdown(result);
    expect(out).toContain('### Questions for Human Review');
    expect(out).toContain('1. Is the input validated upstream?');
    expect(out).toContain('2. Can this be exploited remotely?');
  });
});

// ============================================================================
// formatGithub — issue checkboxes
// ============================================================================

describe('formatGithub — issue checkboxes', () => {
  it('renders checkboxes for each evidence doc grouped by severity', () => {
    const result = makeResult({
      evidenceDocs: [
        makeDoc({ severity: 'CRITICAL', issueTitle: 'SQL Injection', filePath: 'src/auth.ts', lineRange: [42, 45], confidence: 87 }),
        makeDoc({ severity: 'WARNING', issueTitle: 'Unvalidated Input', filePath: 'src/api.ts', lineRange: [20, 22], confidence: 65 }),
      ],
      summary: {
        decision: 'REJECT',
        reasoning: 'Issues found.',
        totalReviewers: 3,
        forfeitedReviewers: 0,
        severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 1, WARNING: 1, SUGGESTION: 0 },
        topIssues: [],
        totalDiscussions: 0,
        resolved: 0,
        escalated: 0,
      },
    });

    const out = formatGithub(result);
    expect(out).toContain('- [ ] `src/auth.ts:42` — **SQL Injection**');
    expect(out).toContain('(87%)');
    expect(out).toContain('- [ ] `src/api.ts:20` — **Unvalidated Input**');
    expect(out).toContain('(65%)');
  });

  it('shows severity heading with emoji and count', () => {
    const result = makeResult({
      evidenceDocs: [
        makeDoc({ severity: 'CRITICAL' }),
      ],
      summary: {
        decision: 'REJECT',
        reasoning: 'Issues found.',
        totalReviewers: 3,
        forfeitedReviewers: 0,
        severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
        topIssues: [],
        totalDiscussions: 0,
        resolved: 0,
        escalated: 0,
      },
    });

    const out = formatGithub(result);
    expect(out).toContain('🟠');
    expect(out).toContain('(1)');
  });

  it('skips severity sections with zero count', () => {
    const result = makeResult({
      evidenceDocs: [makeDoc({ severity: 'CRITICAL' })],
      summary: {
        decision: 'REJECT',
        reasoning: 'Issues found.',
        totalReviewers: 3,
        forfeitedReviewers: 0,
        severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
        topIssues: [],
        totalDiscussions: 0,
        resolved: 0,
        escalated: 0,
      },
    });

    const out = formatGithub(result);
    // WARNING section should not appear when count is 0
    expect(out).not.toContain('🟡');
    expect(out).not.toContain('SUGGESTION');
  });

  it('includes decision and reasoning in github output', () => {
    const result = makeResult();
    const out = formatGithub(result);
    expect(out).toContain('**Decision:** REJECT');
    expect(out).toContain('Critical security issues found.');
  });
});
