/**
 * CLI Verbose Output Tests
 * Tests for --verbose flag behavior in formatText and formatMarkdown.
 */

import { describe, it, expect } from 'vitest';
import {
  formatText,
  formatMarkdown,
  formatOutput,
} from '@codeagora/cli/formatters/review-output.js';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';
import type { EvidenceDocument } from '@codeagora/core/types/core.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeDoc = (overrides: Partial<EvidenceDocument> = {}): EvidenceDocument => ({
  issueTitle: 'SQL Injection',
  problem: 'The user input is directly concatenated into the SQL query string.',
  evidence: [
    'Username parameter is taken directly from user input',
    'String concatenation is used instead of parameterized queries',
  ],
  severity: 'CRITICAL',
  suggestion: 'Use parameterized queries with prepared statements.',
  filePath: 'auth.ts',
  lineRange: [10, 12],
  confidence: 85,
  ...overrides,
});

const baseResult: PipelineResult = {
  sessionId: '001',
  date: '2026-03-20',
  status: 'success',
  summary: {
    decision: 'REJECT',
    reasoning: 'Critical security issues found',
    totalReviewers: 3,
    forfeitedReviewers: 0,
    severityCounts: { CRITICAL: 1, WARNING: 1 },
    topIssues: [
      { severity: 'CRITICAL', filePath: 'auth.ts', lineRange: [10, 10] as [number, number], title: 'SQL Injection' },
      { severity: 'WARNING', filePath: 'utils.ts', lineRange: [23, 23] as [number, number], title: 'Missing error handling' },
    ],
    totalDiscussions: 1,
    resolved: 1,
    escalated: 0,
  },
  evidenceDocs: [
    makeDoc(),
    makeDoc({
      issueTitle: 'Missing error handling',
      problem: 'The function does not handle promise rejections.',
      evidence: ['No try-catch around async operation'],
      severity: 'WARNING',
      suggestion: 'Wrap in try-catch or use .catch().',
      filePath: 'utils.ts',
      lineRange: [23, 23],
      confidence: 72,
    }),
  ],
};

// ---------------------------------------------------------------------------
// formatText verbose tests — new triage-based format
// ---------------------------------------------------------------------------

describe('formatText verbose mode', () => {
  it('should show triage sections and issue titles in default mode', () => {
    const output = formatText(baseResult);
    expect(output).toContain('must-fix');
    expect(output).toContain('SQL Injection');
    // Default mode shows one-line problem, not full Fix:
    expect(output).toContain('The user input is directly concatenated');
  });

  it('should show full detail when verbose=true', () => {
    const output = formatText(baseResult, { verbose: true });
    expect(output).toContain('must-fix');
    expect(output).toContain('SQL Injection');
    expect(output).toContain('The user input is directly concatenated');
    expect(output).toContain('Username parameter');
    expect(output).toContain('String concatenation');
    expect(output).toContain('Fix:');
    expect(output).toContain('Use parameterized queries');
  });

  it('should show verdict box with decision', () => {
    const output = formatText(baseResult);
    expect(output).toContain('REJECT');
    expect(output).toContain('must-fix');
  });

  it('should show confidence score when available', () => {
    const output = formatText(baseResult, { verbose: true });
    expect(output).toContain('85%');
    expect(output).toContain('72%');
  });

  it('should show line range for multi-line issues', () => {
    const output = formatText(baseResult);
    expect(output).toContain('auth.ts:10-12');
  });

  it('should show single line number when start equals end', () => {
    const output = formatText(baseResult);
    expect(output).toContain('utils.ts:23');
  });

  it('should show verify section for warnings', () => {
    const output = formatText(baseResult);
    expect(output).toContain('verify');
    expect(output).toContain('Missing error handling');
  });

  it('should handle empty evidenceDocs without crash', () => {
    const resultEmpty: PipelineResult = { ...baseResult, evidenceDocs: [] };
    const output = formatText(resultEmpty);
    expect(output).toContain('REJECT');
    expect(output).toContain('no issues');
  });

  it('should handle doc without confidence score', () => {
    const resultNoConfidence: PipelineResult = {
      ...baseResult,
      evidenceDocs: [makeDoc({ confidence: undefined })],
    };
    const output = formatText(resultNoConfidence, { verbose: true });
    expect(output).toContain('CRITICAL');
    expect(output).not.toContain('(%)');
  });

  it('should handle doc with empty evidence array', () => {
    const resultNoEvidence: PipelineResult = {
      ...baseResult,
      evidenceDocs: [makeDoc({ evidence: [] })],
    };
    const output = formatText(resultNoEvidence, { verbose: true });
    expect(output).toContain('Fix:');
    expect(output).toContain('Use parameterized queries');
  });

  it('should collapse suggestions by default', () => {
    const resultWithSuggestion: PipelineResult = {
      ...baseResult,
      evidenceDocs: [makeDoc({ severity: 'SUGGESTION', confidence: 10 })],
    };
    const output = formatText(resultWithSuggestion);
    expect(output).toContain('suggestion');
    expect(output).toContain('--verbose');
  });

  it('should expand suggestions in verbose mode', () => {
    const resultWithSuggestion: PipelineResult = {
      ...baseResult,
      evidenceDocs: [makeDoc({ severity: 'SUGGESTION', confidence: 10 })],
    };
    const output = formatText(resultWithSuggestion, { verbose: true });
    expect(output).toContain('SQL Injection');
    expect(output).toContain('Fix:');
  });
});

// ---------------------------------------------------------------------------
// All severity levels render correctly
// ---------------------------------------------------------------------------

describe('formatText renders all severity levels', () => {
  const severities = ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION'] as const;

  for (const severity of severities) {
    it(`should render ${severity} severity`, () => {
      const result: PipelineResult = {
        ...baseResult,
        evidenceDocs: [makeDoc({ severity, issueTitle: `${severity} issue` })],
      };
      const output = formatText(result, { verbose: true });
      expect(output).toContain(severity);
      expect(output).toContain(`${severity} issue`);
    });
  }
});

// ---------------------------------------------------------------------------
// formatMarkdown verbose tests
// ---------------------------------------------------------------------------

describe('formatMarkdown verbose mode', () => {
  it('should show only titles when verbose=false (default)', () => {
    const output = formatMarkdown(baseResult);
    expect(output).toContain('**Top Issues:**');
    expect(output).toContain('SQL Injection');
    expect(output).not.toContain('**Problem:**');
    expect(output).not.toContain('**Evidence:**');
    expect(output).not.toContain('**Suggestion:**');
  });

  it('should show full detail when verbose=true', () => {
    const output = formatMarkdown(baseResult, { verbose: true });
    expect(output).toContain('### Detailed Issues');
    expect(output).toContain('**Problem:**');
    expect(output).toContain('The user input is directly concatenated');
    expect(output).toContain('**Evidence:**');
    expect(output).toContain('- Username parameter is taken directly from user input');
    expect(output).toContain('**Suggestion:**');
    expect(output).toContain('Use parameterized queries');
  });

  it('should show severity in markdown header', () => {
    const output = formatMarkdown(baseResult, { verbose: true });
    expect(output).toContain('**[CRITICAL]**');
    expect(output).toContain('**[WARNING]**');
  });

  it('should show confidence badge', () => {
    const output = formatMarkdown(baseResult, { verbose: true });
    expect(output).toContain('85%');
  });

  it('should show line range in backticks', () => {
    const output = formatMarkdown(baseResult, { verbose: true });
    expect(output).toContain('`auth.ts:10-12`');
  });

  it('should NOT show Top Issues section when verbose=true', () => {
    const output = formatMarkdown(baseResult, { verbose: true });
    expect(output).not.toContain('**Top Issues:**');
  });

  it('should still show Top Issues when verbose=true but no evidenceDocs', () => {
    const resultNoEvidence: PipelineResult = { ...baseResult, evidenceDocs: undefined };
    const output = formatMarkdown(resultNoEvidence, { verbose: true });
    expect(output).toContain('**Top Issues:**');
    expect(output).not.toContain('### Detailed Issues');
  });

  it('should handle empty evidenceDocs without crash', () => {
    const resultEmpty: PipelineResult = { ...baseResult, evidenceDocs: [] };
    const output = formatMarkdown(resultEmpty, { verbose: true });
    expect(output).toContain('**Top Issues:**');
    expect(output).not.toContain('### Detailed Issues');
  });
});

// ---------------------------------------------------------------------------
// formatOutput passes verbose through
// ---------------------------------------------------------------------------

describe('formatOutput verbose passthrough', () => {
  it('should pass verbose to text formatter', () => {
    const output = formatOutput(baseResult, 'text', { verbose: true });
    expect(output).toContain('Fix:');
    expect(output).toContain('Use parameterized queries');
  });

  it('should pass verbose to md formatter', () => {
    const output = formatOutput(baseResult, 'md', { verbose: true });
    expect(output).toContain('### Detailed Issues');
    expect(output).toContain('**Problem:**');
  });

  it('should not affect json format', () => {
    const output = formatOutput(baseResult, 'json', { verbose: true });
    const parsed = JSON.parse(output);
    expect(parsed.status).toBe('success');
  });

  it('should not affect github format', () => {
    const output = formatOutput(baseResult, 'github', { verbose: true });
    expect(output).toContain('CodeAgora Review');
  });

  it('should default to non-verbose when options omitted', () => {
    const output = formatOutput(baseResult, 'text');
    expect(output).toContain('REJECT');
    expect(output).toContain('SQL Injection');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('formatText verbose edge cases', () => {
  it('should handle error result without crash', () => {
    const errorResult: PipelineResult = {
      sessionId: '002',
      date: '2026-03-20',
      status: 'error',
      error: 'All reviewers failed',
    };
    const output = formatText(errorResult, { verbose: true });
    expect(output).toContain('Review failed');
    expect(output).not.toContain('must-fix');
  });

  it('should handle result with no summary', () => {
    const noSummary: PipelineResult = {
      sessionId: '003',
      date: '2026-03-20',
      status: 'success',
    };
    const output = formatText(noSummary, { verbose: true });
    expect(output).toContain('Review complete!');
    expect(output).not.toContain('must-fix');
  });
});
