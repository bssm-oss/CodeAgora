/**
 * CLI Review Options & Formatters Tests
 */

import { describe, it, expect } from 'vitest';
import {
  formatText,
  formatJson,
  formatMarkdown,
  formatGithub,
  formatOutput,
} from '@codeagora/cli/formatters/review-output.js';
import {
  parseReviewerOption,
  isStdinPiped,
} from '@codeagora/cli/options/review-options.js';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const successResult: PipelineResult = {
  status: 'success',
  sessionId: '001',
  date: '2026-03-13',
};

const errorResult: PipelineResult = {
  status: 'error',
  sessionId: '002',
  date: '2026-03-13',
  error: 'All reviewers failed',
};

// ---------------------------------------------------------------------------
// formatText
// ---------------------------------------------------------------------------

describe('formatText', () => {
  it('should format success result', () => {
    const output = formatText(successResult);
    expect(output).toContain('Review complete!');
    expect(output).toContain('2026-03-13/001');
  });

  it('should format error result', () => {
    const output = formatText(errorResult);
    expect(output).toContain('Review failed');
    expect(output).toContain('All reviewers failed');
  });
});

// ---------------------------------------------------------------------------
// formatJson
// ---------------------------------------------------------------------------

describe('formatJson', () => {
  it('should return valid JSON', () => {
    const output = formatJson(successResult);
    const parsed = JSON.parse(output);
    expect(parsed.status).toBe('success');
    expect(parsed.sessionId).toBe('001');
  });

  it('should include error field for error result', () => {
    const output = formatJson(errorResult);
    const parsed = JSON.parse(output);
    expect(parsed.error).toBe('All reviewers failed');
  });
});

// ---------------------------------------------------------------------------
// formatMarkdown
// ---------------------------------------------------------------------------

describe('formatMarkdown', () => {
  it('should contain markdown header', () => {
    const output = formatMarkdown(successResult);
    expect(output).toContain('## CodeAgora Review');
  });

  it('should contain session info', () => {
    const output = formatMarkdown(successResult);
    expect(output).toContain('2026-03-13/001');
  });

  it('should format error with Error prefix', () => {
    const output = formatMarkdown(errorResult);
    expect(output).toContain('**Error:**');
  });
});

// ---------------------------------------------------------------------------
// formatGithub
// ---------------------------------------------------------------------------

describe('formatGithub', () => {
  it('should contain emoji header', () => {
    const output = formatGithub(successResult);
    expect(output).toContain('🔍 CodeAgora Review');
  });

  it('should contain severity section headers', () => {
    const output = formatGithub(successResult);
    expect(output).toContain('CRITICAL');
    expect(output).toContain('WARNING');
  });

  it('should format error with ❌', () => {
    const output = formatGithub(errorResult);
    expect(output).toContain('❌');
  });
});

// ---------------------------------------------------------------------------
// formatOutput dispatcher
// ---------------------------------------------------------------------------

describe('formatOutput', () => {
  it('should dispatch to text formatter', () => {
    const output = formatOutput(successResult, 'text');
    expect(output).toContain('Review complete!');
  });

  it('should dispatch to json formatter', () => {
    const output = formatOutput(successResult, 'json');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('should dispatch to md formatter', () => {
    const output = formatOutput(successResult, 'md');
    expect(output).toContain('## CodeAgora Review');
  });

  it('should dispatch to github formatter', () => {
    const output = formatOutput(successResult, 'github');
    expect(output).toContain('🔍');
  });
});

// ---------------------------------------------------------------------------
// Fixtures with populated summary
// ---------------------------------------------------------------------------

const mockResultWithSummary: PipelineResult = {
  sessionId: '001',
  date: '2026-03-14',
  status: 'success',
  summary: {
    decision: 'REJECT',
    reasoning: 'Critical security issues found',
    totalReviewers: 3,
    forfeitedReviewers: 0,
    severityCounts: { CRITICAL: 2, WARNING: 3, SUGGESTION: 1 },
    topIssues: [
      { severity: 'CRITICAL', filePath: 'auth.ts', lineRange: [10, 10] as [number, number], title: 'SQL injection vulnerability' },
      { severity: 'CRITICAL', filePath: 'api.ts', lineRange: [45, 45] as [number, number], title: 'Unvalidated user input' },
      { severity: 'WARNING', filePath: 'utils.ts', lineRange: [23, 23] as [number, number], title: 'Missing error handling' },
    ],
    totalDiscussions: 5,
    resolved: 3,
    escalated: 2,
  },
};

// ---------------------------------------------------------------------------
// formatText with summary
// ---------------------------------------------------------------------------

describe('formatText with summary', () => {
  it('should contain REJECT decision', () => {
    const output = formatText(mockResultWithSummary);
    expect(output).toContain('REJECT');
  });

  it('should contain CRITICAL count', () => {
    const output = formatText(mockResultWithSummary);
    expect(output).toContain('CRITICAL: 2');
  });

  it('should contain auth.ts:10 issue location', () => {
    const output = formatText(mockResultWithSummary);
    expect(output).toContain('auth.ts:10');
  });

  it('should contain SQL injection title', () => {
    const output = formatText(mockResultWithSummary);
    expect(output).toContain('SQL injection');
  });
});

// ---------------------------------------------------------------------------
// formatMarkdown with summary
// ---------------------------------------------------------------------------

describe('formatMarkdown with summary', () => {
  it('should contain severity table header', () => {
    const output = formatMarkdown(mockResultWithSummary);
    expect(output).toContain('| Severity | Count |');
  });

  it('should contain CRITICAL count row', () => {
    const output = formatMarkdown(mockResultWithSummary);
    expect(output).toContain('| CRITICAL | 2 |');
  });
});

// ---------------------------------------------------------------------------
// formatGithub with summary
// ---------------------------------------------------------------------------

describe('formatGithub with summary', () => {
  it('should contain CRITICAL count from summary (not 0)', () => {
    const output = formatGithub(mockResultWithSummary);
    expect(output).toContain('🟠');
    expect(output).toContain('(2)');
  });

  it('should contain WARNING count from summary (not 0)', () => {
    const output = formatGithub(mockResultWithSummary);
    expect(output).toContain('🟡');
    expect(output).toContain('(3)');
  });
});

// ---------------------------------------------------------------------------
// formatJson with summary
// ---------------------------------------------------------------------------

describe('formatJson with summary', () => {
  it('should have summary.decision === REJECT', () => {
    const output = formatJson(mockResultWithSummary);
    const parsed = JSON.parse(output);
    expect(parsed.summary.decision).toBe('REJECT');
  });
});

// ---------------------------------------------------------------------------
// formatOutput dispatcher with summary
// ---------------------------------------------------------------------------

describe('formatOutput with summary', () => {
  it('text format should contain REJECT', () => {
    const output = formatOutput(mockResultWithSummary, 'text');
    expect(output).toContain('REJECT');
  });
});

// ---------------------------------------------------------------------------
// formatText ACCEPT decision / zero discussions
// ---------------------------------------------------------------------------

describe('formatText with ACCEPT decision', () => {
  const acceptResult: PipelineResult = {
    sessionId: '003',
    date: '2026-03-15',
    status: 'success',
    summary: {
      decision: 'ACCEPT',
      reasoning: 'No issues found',
      totalReviewers: 2,
      forfeitedReviewers: 0,
      severityCounts: {},
      topIssues: [],
      totalDiscussions: 0,
      resolved: 0,
      escalated: 0,
    },
  };

  it('should contain ACCEPT', () => {
    const output = formatText(acceptResult);
    expect(output).toContain('ACCEPT');
  });

  it('should NOT contain Discussions: when totalDiscussions is 0', () => {
    const output = formatText(acceptResult);
    expect(output).not.toContain('Discussions:');
  });
});

describe('formatText with NEEDS_HUMAN decision', () => {
  const needsHumanResult: PipelineResult = {
    sessionId: '004',
    date: '2026-03-15',
    status: 'success',
    summary: {
      decision: 'NEEDS_HUMAN',
      reasoning: 'Ambiguous changes require human judgement',
      totalReviewers: 3,
      forfeitedReviewers: 1,
      severityCounts: { WARNING: 1 },
      topIssues: [],
      totalDiscussions: 1,
      resolved: 0,
      escalated: 1,
    },
  };

  it('should contain NEEDS_HUMAN', () => {
    const output = formatText(needsHumanResult);
    expect(output).toContain('NEEDS_HUMAN');
  });
});

describe('formatGithub with HARSHLY_CRITICAL severity', () => {
  const hcResult: PipelineResult = {
    sessionId: '005',
    date: '2026-03-15',
    status: 'success',
    summary: {
      decision: 'REJECT',
      reasoning: 'Data loss vulnerability',
      totalReviewers: 2,
      forfeitedReviewers: 0,
      severityCounts: { HARSHLY_CRITICAL: 1 },
      topIssues: [
        { severity: 'HARSHLY_CRITICAL', filePath: 'db.ts', lineRange: [5, 5] as [number, number], title: 'Data loss on migration' },
      ],
      totalDiscussions: 1,
      resolved: 0,
      escalated: 1,
    },
  };

  it('should contain 🔴 **Critical** for HARSHLY_CRITICAL severity section', () => {
    const output = formatGithub(hcResult);
    expect(output).toContain('🔴 **Critical**');
  });
});

// ---------------------------------------------------------------------------
// parseReviewerOption
// ---------------------------------------------------------------------------

describe('parseReviewerOption', () => {
  it('should parse numeric value as count', () => {
    const result = parseReviewerOption('3');
    expect(result).toEqual({ count: 3 });
  });

  it('should parse large number as count', () => {
    const result = parseReviewerOption('10');
    expect(result).toEqual({ count: 10 });
  });

  it('should parse comma-separated names', () => {
    const result = parseReviewerOption('r1-kimi,r2-deepseek');
    expect(result).toEqual({ names: ['r1-kimi', 'r2-deepseek'] });
  });

  it('should parse single name', () => {
    const result = parseReviewerOption('r1-kimi');
    expect(result).toEqual({ names: ['r1-kimi'] });
  });

  it('should trim whitespace in names', () => {
    const result = parseReviewerOption(' r1-kimi , r2-deepseek ');
    expect(result).toEqual({ names: ['r1-kimi', 'r2-deepseek'] });
  });

  it('should throw on empty string', () => {
    expect(() => parseReviewerOption('')).toThrow('cannot be empty');
  });

  it('should throw on zero count', () => {
    expect(() => parseReviewerOption('0')).toThrow('must be >= 1');
  });

  it('should throw on mixed numeric in names list', () => {
    expect(() => parseReviewerOption('r1-kimi,3')).toThrow('numeric entry');
  });
});

// ---------------------------------------------------------------------------
// isStdinPiped
// ---------------------------------------------------------------------------

describe('isStdinPiped', () => {
  it('should return a boolean', () => {
    expect(typeof isStdinPiped()).toBe('boolean');
  });
});
