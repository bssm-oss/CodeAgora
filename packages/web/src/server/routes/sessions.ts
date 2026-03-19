/**
 * Session API Routes
 * CRUD operations for review session data stored in .ca/sessions/.
 */

import { Hono } from 'hono';
import path from 'path';
import type { SessionMetadata } from '@codeagora/core/types/core.js';
import { readJsonSafe, readdirSafe } from '../utils/fs-helpers.js';

const CA_ROOT = '.ca';

export const sessionRoutes = new Hono();

/**
 * GET /api/sessions — List all sessions from .ca/sessions/ directory tree.
 */
sessionRoutes.get('/', async (c) => {
  const sessionsDir = path.join(CA_ROOT, 'sessions');
  const dateDirs = await readdirSafe(sessionsDir);

  const sessions: SessionMetadata[] = [];

  for (const dateDir of dateDirs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDir)) continue;

    const datePath = path.join(sessionsDir, dateDir);
    const sessionIds = await readdirSafe(datePath);

    for (const sessionId of sessionIds) {
      if (!/^\d{3}$/.test(sessionId)) continue;

      const metadataPath = path.join(datePath, sessionId, 'metadata.json');
      const metadata = await readJsonSafe<SessionMetadata>(metadataPath);

      if (metadata) {
        sessions.push(metadata);
      }
    }
  }

  return c.json(sessions);
});

/**
 * GET /api/sessions/:date/:id — Get single session detail.
 */
sessionRoutes.get('/:date/:id', async (c) => {
  const { date, id } = c.req.param();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{3}$/.test(id)) {
    return c.json({ error: 'Invalid session identifier' }, 400);
  }

  const sessionDir = path.join(CA_ROOT, 'sessions', date, id);
  const metadata = await readJsonSafe<SessionMetadata>(path.join(sessionDir, 'metadata.json'));

  if (!metadata) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const reviews = await loadSessionReviews(sessionDir);
  const discussions = await loadSessionDiscussions(sessionDir);
  const verdict = await readJsonSafe(path.join(sessionDir, 'verdict.json'));

  return c.json({ metadata, reviews, discussions, verdict });
});

/**
 * GET /api/sessions/:date/:id/reviews — Get review outputs for a session.
 */
sessionRoutes.get('/:date/:id/reviews', async (c) => {
  const { date, id } = c.req.param();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{3}$/.test(id)) {
    return c.json({ error: 'Invalid session identifier' }, 400);
  }

  const sessionDir = path.join(CA_ROOT, 'sessions', date, id);
  const reviews = await loadSessionReviews(sessionDir);
  return c.json(reviews);
});

/**
 * GET /api/sessions/:date/:id/discussions — Get discussion rounds and verdicts.
 */
sessionRoutes.get('/:date/:id/discussions', async (c) => {
  const { date, id } = c.req.param();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{3}$/.test(id)) {
    return c.json({ error: 'Invalid session identifier' }, 400);
  }

  const sessionDir = path.join(CA_ROOT, 'sessions', date, id);
  const discussions = await loadSessionDiscussions(sessionDir);
  return c.json(discussions);
});

/**
 * GET /api/sessions/:date/:id/verdict — Get head verdict.
 */
sessionRoutes.get('/:date/:id/verdict', async (c) => {
  const { date, id } = c.req.param();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{3}$/.test(id)) {
    return c.json({ error: 'Invalid session identifier' }, 400);
  }

  const sessionDir = path.join(CA_ROOT, 'sessions', date, id);
  const verdict = await readJsonSafe(path.join(sessionDir, 'verdict.json'));

  if (!verdict) {
    return c.json({ error: 'Verdict not found' }, 404);
  }

  return c.json(verdict);
});

/**
 * Load all review JSON files from a session's reviews/ directory.
 */
async function loadSessionReviews(sessionDir: string): Promise<Record<string, unknown>[]> {
  const reviewsDir = path.join(sessionDir, 'reviews');
  const files = await readdirSafe(reviewsDir);
  const reviews: Record<string, unknown>[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const data = await readJsonSafe<Record<string, unknown>>(path.join(reviewsDir, file));
    if (data) reviews.push(data);
  }

  return reviews;
}

/**
 * Load all discussion JSON files from a session's discussions/ directory.
 */
async function loadSessionDiscussions(sessionDir: string): Promise<Record<string, unknown>[]> {
  const discussionsDir = path.join(sessionDir, 'discussions');
  const files = await readdirSafe(discussionsDir);
  const discussions: Record<string, unknown>[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const data = await readJsonSafe<Record<string, unknown>>(path.join(discussionsDir, file));
    if (data) discussions.push(data);
  }

  return discussions;
}
