/**
 * post-actions.ts — formatReviewResult, postToGitHub
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@codeagora/cli/formatters/review-output.js', () => ({
  formatOutput: vi.fn((_result: unknown, format: string) => `formatted-${format}`),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    status: 'success',
    sessionId: '001',
    date: '2026-04-12',
    summary: {
      decision: 'ACCEPT',
      reasoning: 'Clean code',
      severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 0, WARNING: 1, SUGGESTION: 2 },
      topIssues: [{ severity: 'WARNING', filePath: 'a.ts', title: 'Minor issue' }],
      totalDiscussions: 1,
      resolved: 1,
      escalated: 0,
    },
    evidenceDocs: [],
    discussions: [],
    ...overrides,
  } as PipelineResult;
}

// ---------------------------------------------------------------------------
// formatReviewResult
// ---------------------------------------------------------------------------

describe('formatReviewResult', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('formats with default text format', async () => {
    const { formatReviewResult } = await import('../post-actions.js');
    const result = await formatReviewResult(makeResult());
    expect(result).toBe('formatted-text');
  });

  it('passes format through to formatter', async () => {
    const { formatReviewResult } = await import('../post-actions.js');
    const result = await formatReviewResult(makeResult(), 'json');
    expect(result).toBe('formatted-json');
  });

  it('supports all format types', async () => {
    const { formatReviewResult } = await import('../post-actions.js');
    for (const fmt of ['text', 'json', 'md', 'github', 'html', 'junit', 'sarif'] as const) {
      const result = await formatReviewResult(makeResult(), fmt);
      expect(result).toBe(`formatted-${fmt}`);
    }
  });
});

// ---------------------------------------------------------------------------
// postToGitHub
// ---------------------------------------------------------------------------

describe('postToGitHub', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws when pipeline did not succeed', async () => {
    const { postToGitHub } = await import('../post-actions.js');
    const result = makeResult({ status: 'error', summary: undefined });
    await expect(postToGitHub(result, 'https://github.com/o/r/pull/1'))
      .rejects.toThrow('pipeline did not succeed');
  });

  it('throws on invalid PR URL', async () => {
    const { postToGitHub } = await import('../post-actions.js');
    await expect(postToGitHub(makeResult(), 'not-a-url'))
      .rejects.toThrow('Invalid GitHub PR URL');
  });

  it('throws on non-GitHub URL', async () => {
    const { postToGitHub } = await import('../post-actions.js');
    await expect(postToGitHub(makeResult(), 'https://gitlab.com/o/r/pull/1'))
      .rejects.toThrow('Invalid GitHub PR URL');
  });
});
