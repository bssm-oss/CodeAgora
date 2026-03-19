/**
 * Cost Analytics API Routes
 * Aggregate cost data across all sessions.
 */

import { Hono } from 'hono';
import { readFile } from 'fs/promises';
import path from 'path';
import { readJsonSafe, readdirSafe } from '../utils/fs-helpers.js';

const CA_ROOT = '.ca';

interface SessionCost {
  date: string;
  sessionId: string;
  totalCost: number;
  reviewerCosts: Record<string, number>;
  layerCosts: Record<string, number>;
}

export const costRoutes = new Hono();

/**
 * GET /api/costs — Aggregate cost data across all sessions.
 */
costRoutes.get('/', async (c) => {
  const sessionsDir = path.join(CA_ROOT, 'sessions');
  const dateDirs = await readdirSafe(sessionsDir);

  const sessionCosts: SessionCost[] = [];
  let totalCost = 0;
  const perReviewerCosts: Record<string, number> = {};
  const perLayerCosts: Record<string, number> = {};

  for (const dateDir of dateDirs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDir)) continue;

    const datePath = path.join(sessionsDir, dateDir);
    const sessionIds = await readdirSafe(datePath);

    for (const sessionId of sessionIds) {
      if (!/^\d{3}$/.test(sessionId)) continue;

      const reportPath = path.join(datePath, sessionId, 'report.json');
      const report = await readJsonSafe<Record<string, unknown>>(reportPath);

      if (!report) continue;

      const cost = extractCosts(report, dateDir, sessionId);
      sessionCosts.push(cost);
      totalCost += cost.totalCost;

      for (const [reviewer, amount] of Object.entries(cost.reviewerCosts)) {
        perReviewerCosts[reviewer] = (perReviewerCosts[reviewer] ?? 0) + amount;
      }

      for (const [layer, amount] of Object.entries(cost.layerCosts)) {
        perLayerCosts[layer] = (perLayerCosts[layer] ?? 0) + amount;
      }
    }
  }

  return c.json({
    totalCost,
    sessionCount: sessionCosts.length,
    sessions: sessionCosts,
    perReviewerCosts,
    perLayerCosts,
  });
});

/**
 * GET /api/costs/pricing — Return pricing.json data.
 */
costRoutes.get('/pricing', async (c) => {
  try {
    const pricingPath = path.join(process.cwd(), 'packages', 'shared', 'src', 'data', 'pricing.json');
    const content = await readFile(pricingPath, 'utf-8');
    return c.json(JSON.parse(content));
  } catch {
    return c.json({ error: 'Pricing data not found' }, 404);
  }
});

/**
 * Extract cost information from a session report.
 */
function extractCosts(
  report: Record<string, unknown>,
  date: string,
  sessionId: string,
): SessionCost {
  const costs = report['costs'] as Record<string, unknown> | undefined;
  const reviewerCosts: Record<string, number> = {};
  const layerCosts: Record<string, number> = {};
  let totalCost = 0;

  if (costs && typeof costs === 'object') {
    const total = costs['total'];
    if (typeof total === 'number') {
      totalCost = total;
    }

    const byReviewer = costs['byReviewer'];
    if (byReviewer && typeof byReviewer === 'object') {
      for (const [key, value] of Object.entries(byReviewer as Record<string, unknown>)) {
        if (typeof value === 'number') {
          reviewerCosts[key] = value;
        }
      }
    }

    const byLayer = costs['byLayer'];
    if (byLayer && typeof byLayer === 'object') {
      for (const [key, value] of Object.entries(byLayer as Record<string, unknown>)) {
        if (typeof value === 'number') {
          layerCosts[key] = value;
        }
      }
    }
  }

  return { date, sessionId, totalCost, reviewerCosts, layerCosts };
}

