/**
 * Review Detail Frontend Tests
 * Tests utility/parsing functions used by the review dashboard components.
 */

import { describe, it, expect } from 'vitest';
import {
  parseDiffLines,
  severityClassMap,
  severityLabelMap,
  decisionClassMap,
  decisionLabelMap,
  aggregateIssues,
  computeSeverityCounts,
  issuesToMarkers,
  formatDuration,
  formatDate,
} from '../../src/frontend/utils/review-helpers.js';
import type { Severity, ReviewEntry, AggregatedIssue } from '../../src/frontend/utils/review-helpers.js';

// ============================================================================
// DiffViewer — parseDiffLines
// ============================================================================

describe('parseDiffLines', () => {
  it('should parse added, removed, and context lines', () => {
    const diff = [
      '@@ -1,3 +1,3 @@',
      ' const a = 1;',
      '-const b = 2;',
      '+const b = 3;',
      ' const c = 4;',
    ].join('\n');

    const lines = parseDiffLines(diff);

    // Header
    expect(lines[0].type).toBe('header');
    expect(lines[0].content).toContain('@@');

    // Context line
    expect(lines[1].type).toBe('context');
    expect(lines[1].content).toBe('const a = 1;');
    expect(lines[1].oldLineNumber).toBe(1);
    expect(lines[1].newLineNumber).toBe(1);

    // Removed line
    expect(lines[2].type).toBe('removed');
    expect(lines[2].content).toBe('const b = 2;');
    expect(lines[2].oldLineNumber).toBe(2);
    expect(lines[2].newLineNumber).toBeNull();

    // Added line
    expect(lines[3].type).toBe('added');
    expect(lines[3].content).toBe('const b = 3;');
    expect(lines[3].oldLineNumber).toBeNull();
    expect(lines[3].newLineNumber).toBe(2);

    // Trailing context
    expect(lines[4].type).toBe('context');
    expect(lines[4].oldLineNumber).toBe(3);
    expect(lines[4].newLineNumber).toBe(3);
  });

  it('should parse hunk headers with correct line numbers', () => {
    const diff = '@@ -10,5 +20,7 @@ function foo() {\n context\n+added';

    const lines = parseDiffLines(diff);

    expect(lines[0].type).toBe('header');
    // Context line after hunk should start at old=10, new=20
    expect(lines[1].type).toBe('context');
    expect(lines[1].oldLineNumber).toBe(10);
    expect(lines[1].newLineNumber).toBe(20);

    // Added line
    expect(lines[2].type).toBe('added');
    expect(lines[2].newLineNumber).toBe(21);
  });

  it('should handle diff file headers as header type', () => {
    const diff = [
      'diff --git a/file.ts b/file.ts',
      'index abc..def 100644',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,2 +1,2 @@',
      '-old',
      '+new',
    ].join('\n');

    const lines = parseDiffLines(diff);

    expect(lines[0].type).toBe('header');
    expect(lines[1].type).toBe('header');
    expect(lines[2].type).toBe('header');
    expect(lines[3].type).toBe('header');
    expect(lines[4].type).toBe('header'); // @@ header
    expect(lines[5].type).toBe('removed');
    expect(lines[6].type).toBe('added');
  });

  it('should return a line for empty diff text', () => {
    const lines = parseDiffLines('');
    expect(lines.length).toBe(1);
    expect(lines[0].type).toBe('context');
  });
});

// ============================================================================
// SeverityBadge — class/label maps
// ============================================================================

describe('SeverityBadge maps', () => {
  it('should map all severity levels to CSS classes', () => {
    const severities: Severity[] = ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION'];

    for (const severity of severities) {
      expect(severityClassMap[severity]).toBeDefined();
      expect(severityClassMap[severity]).toContain('severity-badge--');
    }
  });

  it('should provide human-readable labels for all severities', () => {
    expect(severityLabelMap.HARSHLY_CRITICAL).toBe('Harshly Critical');
    expect(severityLabelMap.CRITICAL).toBe('Critical');
    expect(severityLabelMap.WARNING).toBe('Warning');
    expect(severityLabelMap.SUGGESTION).toBe('Suggestion');
  });
});

// ============================================================================
// VerdictBanner — class/label maps
// ============================================================================

describe('VerdictBanner maps', () => {
  it('should map all decisions to CSS classes', () => {
    expect(decisionClassMap.ACCEPT).toBe('verdict-banner--accept');
    expect(decisionClassMap.REJECT).toBe('verdict-banner--reject');
    expect(decisionClassMap.NEEDS_HUMAN).toBe('verdict-banner--needs-human');
  });

  it('should provide human-readable labels for all decisions', () => {
    expect(decisionLabelMap.ACCEPT).toBe('Accepted');
    expect(decisionLabelMap.REJECT).toBe('Rejected');
    expect(decisionLabelMap.NEEDS_HUMAN).toBe('Needs Human Review');
  });
});

// ============================================================================
// ReviewDetail — aggregateIssues
// ============================================================================

describe('aggregateIssues', () => {
  const makeReview = (
    reviewerId: string,
    issues: Array<{
      issueTitle: string;
      filePath: string;
      lineRange: [number, number];
      severity: Severity;
    }>,
  ): ReviewEntry => ({
    reviewerId,
    model: 'test-model',
    group: 'src/',
    status: 'success',
    evidenceDocs: issues.map((i) => ({
      ...i,
      problem: 'test problem',
      evidence: ['evidence 1'],
      suggestion: 'fix it',
    })),
  });

  it('should aggregate the same issue from multiple reviewers', () => {
    const reviews: ReviewEntry[] = [
      makeReview('r1', [
        { issueTitle: 'Bug', filePath: 'file.ts', lineRange: [10, 12], severity: 'CRITICAL' },
      ]),
      makeReview('r2', [
        { issueTitle: 'Bug', filePath: 'file.ts', lineRange: [10, 12], severity: 'CRITICAL' },
      ]),
    ];

    const aggregated = aggregateIssues(reviews);

    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].reviewers).toEqual(['r1', 'r2']);
    expect(aggregated[0].issueTitle).toBe('Bug');
  });

  it('should keep distinct issues separate', () => {
    const reviews: ReviewEntry[] = [
      makeReview('r1', [
        { issueTitle: 'Bug A', filePath: 'file.ts', lineRange: [10, 12], severity: 'CRITICAL' },
        { issueTitle: 'Bug B', filePath: 'other.ts', lineRange: [5, 8], severity: 'WARNING' },
      ]),
    ];

    const aggregated = aggregateIssues(reviews);

    expect(aggregated).toHaveLength(2);
  });

  it('should skip forfeit and error reviews', () => {
    const reviews: ReviewEntry[] = [
      {
        reviewerId: 'r1',
        model: 'test',
        group: 'src/',
        status: 'forfeit',
        evidenceDocs: [
          {
            issueTitle: 'Ghost',
            problem: 'p',
            evidence: [],
            severity: 'CRITICAL',
            suggestion: 's',
            filePath: 'f.ts',
            lineRange: [1, 2],
          },
        ],
      },
    ];

    const aggregated = aggregateIssues(reviews);
    expect(aggregated).toHaveLength(0);
  });
});

// ============================================================================
// ReviewDetail — computeSeverityCounts
// ============================================================================

describe('computeSeverityCounts', () => {
  it('should count severity levels correctly', () => {
    const issues: AggregatedIssue[] = [
      { issueTitle: 'A', problem: 'p', evidence: [], severity: 'CRITICAL', suggestion: 's', filePath: 'f.ts', lineRange: [1, 2], reviewers: ['r1'] },
      { issueTitle: 'B', problem: 'p', evidence: [], severity: 'CRITICAL', suggestion: 's', filePath: 'f.ts', lineRange: [3, 4], reviewers: ['r1'] },
      { issueTitle: 'C', problem: 'p', evidence: [], severity: 'WARNING', suggestion: 's', filePath: 'f.ts', lineRange: [5, 6], reviewers: ['r1'] },
      { issueTitle: 'D', problem: 'p', evidence: [], severity: 'SUGGESTION', suggestion: 's', filePath: 'f.ts', lineRange: [7, 8], reviewers: ['r1'] },
      { issueTitle: 'E', problem: 'p', evidence: [], severity: 'HARSHLY_CRITICAL', suggestion: 's', filePath: 'f.ts', lineRange: [9, 10], reviewers: ['r1'] },
    ];

    const counts = computeSeverityCounts(issues);

    expect(counts.HARSHLY_CRITICAL).toBe(1);
    expect(counts.CRITICAL).toBe(2);
    expect(counts.WARNING).toBe(1);
    expect(counts.SUGGESTION).toBe(1);
  });

  it('should return all zeros for empty issues array', () => {
    const counts = computeSeverityCounts([]);

    expect(counts.HARSHLY_CRITICAL).toBe(0);
    expect(counts.CRITICAL).toBe(0);
    expect(counts.WARNING).toBe(0);
    expect(counts.SUGGESTION).toBe(0);
  });
});

// ============================================================================
// ReviewDetail — issuesToMarkers
// ============================================================================

describe('issuesToMarkers', () => {
  it('should convert aggregated issues to diff markers', () => {
    const issues: AggregatedIssue[] = [
      { issueTitle: 'Bug', problem: 'p', evidence: [], severity: 'CRITICAL', suggestion: 's', filePath: 'f.ts', lineRange: [10, 15], reviewers: ['r1'] },
    ];

    const markers = issuesToMarkers(issues);

    expect(markers).toHaveLength(1);
    expect(markers[0].issueTitle).toBe('Bug');
    expect(markers[0].severity).toBe('CRITICAL');
    expect(markers[0].lineStart).toBe(10);
    expect(markers[0].lineEnd).toBe(15);
  });
});

// ============================================================================
// ReviewDetail — formatDuration
// ============================================================================

describe('formatDuration', () => {
  it('should format short durations in seconds', () => {
    const start = 1000000;
    const end = start + 45_000;
    expect(formatDuration(start, end)).toBe('45s');
  });

  it('should format longer durations in minutes and seconds', () => {
    const start = 1000000;
    const end = start + 125_000;
    expect(formatDuration(start, end)).toBe('2m 5s');
  });
});

// ============================================================================
// ReviewDetail — formatDate
// ============================================================================

describe('formatDate', () => {
  it('should return a non-empty string for a valid timestamp', () => {
    const result = formatDate(1705312800000);
    expect(result.length).toBeGreaterThan(0);
    expect(typeof result).toBe('string');
  });
});
