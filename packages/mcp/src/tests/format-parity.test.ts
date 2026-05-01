/**
 * CLI/MCP review JSON parity.
 */

import { describe, expect, it } from 'vitest';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';
import { formatOutput } from '@codeagora/cli/formatters/review-output.js';
import { formatReviewResult } from '../post-actions.js';

function makePipelineResult(): PipelineResult {
  return {
    status: 'success',
    date: '2026-05-01',
    sessionId: 'parity-001',
    summary: {
      decision: 'ACCEPT',
      reasoning: 'No blocking issues.',
      totalReviewers: 3,
      forfeitedReviewers: 0,
      severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
      topIssues: [],
      totalDiscussions: 0,
      resolved: 0,
      escalated: 0,
    },
    evidenceDocs: [],
    discussions: [],
  } as PipelineResult;
}

describe('CLI/MCP JSON formatting parity', () => {
  it('formatOutput(result, json) and formatReviewResult(result, json) emit equivalent JSON', async () => {
    const result = makePipelineResult();

    const cliJson = JSON.parse(formatOutput(result, 'json'));
    const mcpJson = JSON.parse(await formatReviewResult(result, 'json'));

    expect(mcpJson).toEqual(cliJson);
    expect(mcpJson.schemaVersion).toBe('codeagora.review.v1');
  });
});
