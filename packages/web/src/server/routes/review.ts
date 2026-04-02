/**
 * Review Trigger Route
 * POST /api/review — Trigger a code review from the web dashboard.
 */

import { Hono } from 'hono';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ProgressEmitter } from '@codeagora/core/pipeline/progress.js';
import { DiscussionEmitter } from '@codeagora/core/l2/event-emitter.js';
import { runPipeline } from '@codeagora/core/pipeline/orchestrator.js';
import { setEmitters } from '../ws.js';

const execFileAsync = promisify(execFile);

// ============================================================================
// Pipeline Mutex
// ============================================================================

let pipelineRunning = false;
let activeEmitter: ProgressEmitter | null = null;

/**
 * Returns the active ProgressEmitter if a pipeline is currently running.
 * Used by WebSocket handler to attach listeners mid-flight.
 */
export function getActiveEmitter(): ProgressEmitter | null {
  return activeEmitter;
}

// ============================================================================
// Input Validation
// ============================================================================

/** Validates that a PR URL is a recognized GitHub/GitLab PR URL over HTTPS. */
function isValidPrUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    // Must look like a PR or MR path
    return /\/(pull|merge_requests)\/\d+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

// ============================================================================
// Route
// ============================================================================

export const reviewRoutes = new Hono();

reviewRoutes.post('/', async (c) => {
  // ---- Mutex check --------------------------------------------------------
  if (pipelineRunning) {
    return c.json(
      { error: 'A pipeline is already running. Wait for it to finish.' },
      409,
    );
  }

  // ---- Parse body ---------------------------------------------------------
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Invalid JSON body.' }, 400);
  }

  const { diff, pr_url, staged, mode, provider, model } = body as {
    diff?: string;
    pr_url?: string;
    staged?: boolean;
    mode?: 'quick' | 'full';
    provider?: string;
    model?: string;
  };

  // Exactly one input source required
  const sourceCount = [diff, pr_url, staged].filter(Boolean).length;
  if (sourceCount === 0) {
    return c.json(
      { error: 'Provide one of: diff, pr_url, or staged.' },
      400,
    );
  }
  if (sourceCount > 1) {
    return c.json(
      { error: 'Provide only one of: diff, pr_url, or staged.' },
      400,
    );
  }

  // ---- Resolve diff text --------------------------------------------------
  let diffText: string;

  try {
    if (typeof diff === 'string' && diff.length > 0) {
      diffText = diff;
    } else if (typeof pr_url === 'string') {
      if (!isValidPrUrl(pr_url)) {
        return c.json({ error: 'Invalid PR URL. Provide an HTTPS GitHub or GitLab PR URL.' }, 400);
      }
      const { stdout } = await execFileAsync('gh', ['pr', 'diff', pr_url], {
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      });
      diffText = stdout;
    } else if (staged) {
      const { stdout } = await execFileAsync('git', ['diff', '--staged'], {
        timeout: 10_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      diffText = stdout;
    } else {
      return c.json({ error: 'No diff source resolved.' }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve diff.';
    return c.json({ error: `Diff resolution failed: ${message}` }, 500);
  }

  if (!diffText.trim()) {
    return c.json({ error: 'Resolved diff is empty. Nothing to review.' }, 400);
  }

  // ---- Write diff to temp file --------------------------------------------
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-review-'));
  const diffPath = path.join(tmpDir, 'review.diff');
  await fs.writeFile(diffPath, diffText, 'utf-8');

  // ---- Prepare session info -----------------------------------------------
  const date = new Date().toISOString().slice(0, 10);
  const sessionId = `web-${Date.now()}`;

  // ---- Set up emitters and run pipeline in background ---------------------
  pipelineRunning = true;
  activeEmitter = new ProgressEmitter();
  const discussionEmitter = new DiscussionEmitter();

  // Wire emitters to WebSocket so connected clients receive live events
  setEmitters(activeEmitter, discussionEmitter);

  const isQuick = mode === 'quick';

  // Fire-and-forget: pipeline runs in the background
  void (async () => {
    try {
      const result = await runPipeline(
        {
          diffPath,
          providerOverride: provider || undefined,
          modelOverride: model || undefined,
          skipDiscussion: isQuick,
          skipHead: isQuick,
          discussionEmitter,
        },
        activeEmitter!,
      );

      // Create notification for completed review
      try {
        const { createNotification } = await import('./notifications.js');
        const verdict = result.summary?.decision;
        if (verdict === 'REJECT') {
          await createNotification({
            type: 'verdict_reject',
            sessionId: `${result.date}/${result.sessionId}`,
            verdict,
            message: `Review completed: REJECT — ${Object.entries(result.summary?.severityCounts ?? {}).map(([k, v]) => `${v} ${k}`).join(', ')}`,
            urgent: true,
          });
        } else if (verdict === 'NEEDS_HUMAN') {
          await createNotification({
            type: 'verdict_needs_human',
            sessionId: `${result.date}/${result.sessionId}`,
            verdict,
            message: `Review completed: NEEDS_HUMAN — requires manual review`,
            urgent: true,
          });
        } else if (result.status === 'success') {
          await createNotification({
            type: 'review_complete',
            sessionId: `${result.date}/${result.sessionId}`,
            verdict: verdict ?? 'ACCEPT',
            message: `Review completed: ${verdict ?? 'ACCEPT'}`,
            urgent: false,
          });
        }
      } catch {
        // Notification creation is non-critical
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Pipeline failed.';
      activeEmitter?.stageError('init', msg);

      // Notify on failure
      try {
        const { createNotification } = await import('./notifications.js');
        await createNotification({
          type: 'review_failed',
          sessionId: `${date}/${sessionId}`,
          message: `Review failed: ${msg}`,
          urgent: false,
        });
      } catch {
        // Non-critical
      }
    } finally {
      pipelineRunning = false;
      activeEmitter = null;
      setEmitters(null, null);

      // Cleanup temp file (best-effort)
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  })();

  // ---- Return immediately -------------------------------------------------
  return c.json({
    sessionId,
    date,
    status: 'started' as const,
  });
});
