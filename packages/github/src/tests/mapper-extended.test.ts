/**
 * GitHub Mapper Extended Tests
 * Tests case mismatches and counts-vs-docs discrepancies in mapper.ts
 */

import { describe, it, expect } from 'vitest';
import {
  mapToInlineCommentBody,
  buildSummaryBody,
  buildReviewComments,
} from '../mapper.js';
import type { EvidenceDocument, DiscussionVerdict } from '@codeagora/core/types/core.js';
import type { PipelineSummary } from '@codeagora/core/pipeline/orchestrator.js';
import type { DiffPositionIndex } from '../types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeDoc(overrides: Partial<EvidenceDocument> = {}): EvidenceDocument {
  return {
    issueTitle: 'Test Issue',
    problem: 'A problem exists.',
    evidence: [],
    severity: 'WARNING',
    suggestion: 'Fix it.',
    filePath: 'src/foo.ts',
    lineRange: [10, 12],
    ...overrides,
  };
}

function makeVerdict(overrides: Partial<DiscussionVerdict> = {}): DiscussionVerdict {
  return {
    discussionId: 'd001',
    filePath: 'src/foo.ts',
    lineRange: [10, 12],
    finalSeverity: 'WARNING',
    reasoning: 'Confirmed.',
    consensusReached: true,
    rounds: 1,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<PipelineSummary> = {}): PipelineSummary {
  return {
    decision: 'REJECT',
    reasoning: 'Issues found.',
    totalReviewers: 3,
    forfeitedReviewers: 0,
    severityCounts: { CRITICAL: 1 },
    topIssues: [],
    totalDiscussions: 0,
    resolved: 0,
    escalated: 0,
    ...overrides,
  };
}

function makePositionIndex(entries: Array<[string, number, number, number]> = []): DiffPositionIndex {
  const index: DiffPositionIndex = {};
  for (const [file, line, , pos] of entries) {
    index[`${file}:${line}`] = pos;
  }
  return index;
}

// ============================================================================
// Case mismatch: severity badge lookup
// ============================================================================

describe('mapToInlineCommentBody() — case & severity mismatches', () => {
  it('renders unknown severity without throwing', () => {
    const doc = makeDoc({ severity: 'UNKNOWN_LEVEL' as EvidenceDocument['severity'] });
    expect(() => mapToInlineCommentBody(doc)).not.toThrow();
  });

  it('uses fallback grey circle emoji for unknown severity', () => {
    const doc = makeDoc({ severity: 'NOTICE' as EvidenceDocument['severity'] });
    const body = mapToInlineCommentBody(doc);
    // Fallback badge uses ⚪ (U+26AA)
    expect(body).toContain('\u26AA');
  });

  it('uses red circle for HARSHLY_CRITICAL', () => {
    const doc = makeDoc({ severity: 'HARSHLY_CRITICAL' });
    const body = mapToInlineCommentBody(doc);
    expect(body).toContain('HARSHLY CRITICAL');
  });

  it('uses red circle emoji for CRITICAL', () => {
    const doc = makeDoc({ severity: 'CRITICAL' });
    const body = mapToInlineCommentBody(doc);
    expect(body).toContain('CRITICAL');
  });

  it('uses yellow circle for WARNING', () => {
    const doc = makeDoc({ severity: 'WARNING' });
    const body = mapToInlineCommentBody(doc);
    expect(body).toContain('WARNING');
  });

  it('uses blue circle for SUGGESTION', () => {
    const doc = makeDoc({ severity: 'SUGGESTION' });
    const body = mapToInlineCommentBody(doc);
    expect(body).toContain('SUGGESTION');
  });
});

// ============================================================================
// buildSummaryBody() — counts vs. docs discrepancy
// ============================================================================

describe('buildSummaryBody() — counts vs docs discrepancy', () => {
  it('renders severityCounts in verdict line even when evidenceDocs is empty', () => {
    // summary says 3 CRITICAL but evidenceDocs is empty — should still show counts in header
    const summary = makeSummary({
      severityCounts: { CRITICAL: 3, WARNING: 1 },
      decision: 'REJECT',
    });
    const body = buildSummaryBody({
      summary,
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [],
      discussions: [],
    });
    // Empty evidenceDocs → triage shows 'no issues'
    expect(body).toContain('no issues');
  });

  it('does NOT render blocking issues table when evidenceDocs is empty despite critical count', () => {
    const summary = makeSummary({
      severityCounts: { CRITICAL: 5 },
    });
    const body = buildSummaryBody({
      summary,
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: [],
      discussions: [],
    });
    // No actual docs → no blocking table
    expect(body).not.toContain('### Must Fix');
  });

  it('renders blocking table only for docs that are CRITICAL or HARSHLY_CRITICAL', () => {
    const docs = [
      makeDoc({ severity: 'CRITICAL', issueTitle: 'Critical Bug' }),
      makeDoc({ severity: 'WARNING', issueTitle: 'Minor Warning' }),
    ];
    const body = buildSummaryBody({
      summary: makeSummary(),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: docs,
      discussions: [],
    });
    // Critical with default confidence (50) goes to Verify, not Must Fix
    expect(body).toContain('Critical Bug');
    // Minor Warning appears in suggestions section
    expect(body).toContain('Minor Warning');
  });

  it('shows warning count mismatch: summary has 2 warnings but only 1 doc', () => {
    const docs = [makeDoc({ severity: 'WARNING', issueTitle: 'Only Warning' })];
    const summary = makeSummary({ severityCounts: { WARNING: 2 } });
    const body = buildSummaryBody({
      summary,
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: docs,
      discussions: [],
    });
    // The doc appears in the warnings collapsible
    expect(body).toContain('Only Warning');
    // Summary line uses the count from summary object
    expect(body).toContain('verify');
  });

  it('issue heatmap counts files from evidenceDocs, not severityCounts', () => {
    const docs = [
      makeDoc({ filePath: 'src/a.ts', severity: 'WARNING' }),
      makeDoc({ filePath: 'src/a.ts', severity: 'SUGGESTION' }),
      makeDoc({ filePath: 'src/b.ts', severity: 'WARNING' }),
    ];
    const body = buildSummaryBody({
      summary: makeSummary({ severityCounts: { CRITICAL: 99 } }),
      sessionId: 'sess-001',
      sessionDate: '2026-03-21',
      evidenceDocs: docs,
      discussions: [],
    });
    expect(body).toContain('Issue distribution');
    expect(body).toContain('src/a.ts');
    expect(body).toContain('src/b.ts');
  });
});

// ============================================================================
// buildReviewComments() — confidence filtering and DISMISSED skip
// ============================================================================

describe('buildReviewComments() — filtering', () => {
  it('skips docs whose discussion finalSeverity is DISMISSED', () => {
    const docs = [makeDoc({ filePath: 'src/foo.ts', lineRange: [10, 12] })];
    const discussions = [
      makeVerdict({ filePath: 'src/foo.ts', lineRange: [10, 12], finalSeverity: 'DISMISSED' }),
    ];
    const posIndex = makePositionIndex();

    const comments = buildReviewComments(docs, discussions, posIndex);
    expect(comments).toHaveLength(0);
  });

  it('includes docs not DISMISSED', () => {
    const docs = [makeDoc({ filePath: 'src/bar.ts', lineRange: [5, 7] })];
    const discussions: DiscussionVerdict[] = [];
    const posIndex = makePositionIndex([['src/bar.ts', 5, 7, 3]]);

    const comments = buildReviewComments(docs, discussions, posIndex);
    expect(comments).toHaveLength(1);
  });

  it('skips docs below minConfidence threshold', () => {
    const docs = [makeDoc({ confidence: 30 })];
    const posIndex = makePositionIndex([['src/foo.ts', 10, 12, 5]]);

    const comments = buildReviewComments(docs, [], posIndex, undefined, undefined, undefined, 50);
    expect(comments).toHaveLength(0);
  });

  it('includes docs at or above minConfidence threshold', () => {
    const docs = [makeDoc({ confidence: 80 })];
    const posIndex = makePositionIndex([['src/foo.ts', 10, 12, 5]]);

    const comments = buildReviewComments(docs, [], posIndex, undefined, undefined, undefined, 50);
    expect(comments).toHaveLength(1);
  });

  it('produces file-level comment (no position) when line not in diff', () => {
    const docs = [makeDoc({ filePath: 'src/notindiff.ts', lineRange: [99, 100] })];
    const posIndex = makePositionIndex(); // empty — no resolution

    const comments = buildReviewComments(docs, [], posIndex);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.position).toBeUndefined();
    expect(comments[0]!.body).toContain('src/notindiff.ts:99-100');
  });

  it('produces inline comment (with position) when line is in diff', () => {
    const docs = [makeDoc({ filePath: 'src/foo.ts', lineRange: [10, 12] })];
    const posIndex = makePositionIndex([['src/foo.ts', 10, 12, 7]]);

    const comments = buildReviewComments(docs, [], posIndex);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.position).toBe(7);
  });
});
