/**
 * MCP Tool Helpers
 * Shared logic for running reviews and formatting results.
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { formatCompact, type CompactReviewResult } from '@codeagora/core/pipeline/compact-formatter.js';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';

const execFile = promisify(execFileCb);

// ============================================================================
// Types
// ============================================================================

export interface ReviewOptions {
  skipDiscussion?: boolean;
  skipHead?: boolean;
  reviewerCount?: number;
  reviewerNames?: string[];
  /** Override LLM provider for all reviewers */
  provider?: string;
  /** Override LLM model for all reviewers */
  model?: string;
  /** Pipeline-wide timeout in seconds */
  timeoutSeconds?: number;
  /** Per-reviewer timeout in seconds */
  reviewerTimeoutSeconds?: number;
  /** Disable result caching */
  noCache?: boolean;
  /** Git repo root path for surrounding code context */
  repoPath?: string;
  /** Number of context lines around changed ranges (default 20, 0 = disabled) */
  contextLines?: number;
}

// ============================================================================
// PipelineInput mapping
// ============================================================================

function mapToPipelineInput(diffPath: string, options: ReviewOptions) {
  return {
    diffPath,
    ...(options.skipDiscussion != null && { skipDiscussion: options.skipDiscussion }),
    ...(options.skipHead != null && { skipHead: options.skipHead }),
    ...(options.provider && { providerOverride: options.provider }),
    ...(options.model && { modelOverride: options.model }),
    ...(options.timeoutSeconds != null && { timeoutMs: options.timeoutSeconds * 1000 }),
    ...(options.reviewerTimeoutSeconds != null && { reviewerTimeoutMs: options.reviewerTimeoutSeconds * 1000 }),
    ...(options.noCache != null && { noCache: options.noCache }),
    ...(options.repoPath && { repoPath: options.repoPath }),
    ...(options.contextLines != null && { contextLines: options.contextLines }),
    ...((options.reviewerCount != null || options.reviewerNames != null) && {
      reviewerSelection: {
        ...(options.reviewerCount != null && { count: options.reviewerCount }),
        ...(options.reviewerNames != null && { names: options.reviewerNames }),
      },
    }),
  };
}

// ============================================================================
// Temp file management
// ============================================================================

async function createTempDiffFile(diff: string): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), 'codeagora-mcp');
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `review-${crypto.randomBytes(8).toString('hex')}.patch`);
  await fs.writeFile(tmpFile, diff);
  return tmpFile;
}

// ============================================================================
// Staged diff
// ============================================================================

/**
 * Get staged changes via `git diff --staged`.
 * Throws if no staged changes exist.
 */
export async function getStagedDiff(): Promise<string> {
  const { stdout } = await execFile('git', ['diff', '--staged']);
  const diff = stdout.trim();
  if (!diff) {
    throw new Error('No staged changes found. Stage files with `git add` first.');
  }
  return diff;
}

// ============================================================================
// Core review functions
// ============================================================================

/**
 * Run review and return raw PipelineResult (for post-actions).
 */
export async function runReviewRaw(
  diff: string,
  options: ReviewOptions = {},
): Promise<PipelineResult> {
  const tmpFile = await createTempDiffFile(diff);

  try {
    const { runPipeline } = await import('@codeagora/core/pipeline/orchestrator.js');
    return await runPipeline(mapToPipelineInput(tmpFile, options));
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

/**
 * Run review and return compact result (for MCP tool responses).
 */
export async function runReviewCompact(
  diff: string,
  options: ReviewOptions = {},
): Promise<CompactReviewResult> {
  const result = await runReviewRaw(diff, options);

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
}

