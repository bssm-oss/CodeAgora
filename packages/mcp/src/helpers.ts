/**
 * MCP Tool Helpers
 * Shared logic for running reviews and formatting results.
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { formatCompact, type CompactReviewResult } from '@codeagora/core/pipeline/compact-formatter.js';

/**
 * Write diff to temp file, run pipeline, return compact result.
 */
async function runReviewWithDiff(
  diff: string,
  options: { skipDiscussion?: boolean; skipHead?: boolean; reviewerCount?: number },
): Promise<CompactReviewResult> {
  const tmpDir = path.join(os.tmpdir(), 'codeagora-mcp');
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `review-${Date.now()}.patch`);

  try {
    await fs.writeFile(tmpFile, diff);

    const { runPipeline } = await import('@codeagora/core/pipeline/orchestrator.js');
    const result = await runPipeline({
      diffPath: tmpFile,
      skipDiscussion: options.skipDiscussion,
      skipHead: options.skipHead,
      ...(options.reviewerCount != null && {
        reviewerSelection: { count: options.reviewerCount },
      }),
    });

    if (result.status !== 'success' || !result.summary) {
      return {
        decision: 'ERROR',
        reasoning: result.error ?? 'Pipeline failed',
        issues: [],
        summary: 'error',
        sessionId: result.sessionId,
      };
    }

    return formatCompact({
      decision: result.summary.decision,
      reasoning: result.summary.reasoning,
      evidenceDocs: result.evidenceDocs ?? [],
      discussions: result.discussions,
      reviewerMap: result.reviewerMap,
      reviewerOpinions: result.reviewerOpinions,
      sessionId: `${result.date}/${result.sessionId}`,
    });
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

/**
 * Quick review: L1 only, no debate, no head verdict.
 */
export async function runQuickReview(diff: string, reviewerCount: number = 3): Promise<CompactReviewResult> {
  return runReviewWithDiff(diff, {
    skipDiscussion: true,
    skipHead: true,
    reviewerCount,
  });
}

/**
 * Full review: L0→L1→L2→L3 pipeline.
 */
export async function runFullReview(diff: string): Promise<CompactReviewResult> {
  return runReviewWithDiff(diff, {});
}
