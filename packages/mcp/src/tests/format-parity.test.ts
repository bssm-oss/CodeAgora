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

describe('CLI/MCP SARIF formatting parity', () => {
  it('uses full evidenceDocs through both surfaces', async () => {
    const result = {
      ...makePipelineResult(),
      summary: {
        ...makePipelineResult().summary!,
        topIssues: [
          { severity: 'WARNING', filePath: 'src/top.ts', lineRange: [1, 1] as [number, number], title: 'Top issue only' },
        ],
      },
      evidenceDocs: [
        {
          issueTitle: 'Full issue A',
          problem: 'A',
          evidence: ['A'],
          severity: 'WARNING',
          suggestion: 'Fix A',
          filePath: 'src/a.ts',
          lineRange: [1, 1] as [number, number],
        },
        {
          issueTitle: 'Full issue B',
          problem: 'B',
          evidence: ['B'],
          severity: 'CRITICAL',
          suggestion: 'Fix B',
          filePath: 'src/b.ts',
          lineRange: [2, 2] as [number, number],
        },
      ],
    } as PipelineResult;

    const cliSarif = JSON.parse(formatOutput(result, 'sarif'));
    const mcpSarif = JSON.parse(await formatReviewResult(result, 'sarif'));

    expect(cliSarif.runs[0].results).toHaveLength(2);
    expect(mcpSarif.runs[0].results).toEqual(cliSarif.runs[0].results);
    expect(JSON.stringify(cliSarif)).not.toContain('Top issue only');
  });
});
