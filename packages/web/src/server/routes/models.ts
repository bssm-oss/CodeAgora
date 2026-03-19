/**
 * Model Intelligence API Routes
 * Read bandit store data for Thompson Sampling visualization.
 */

import { Hono } from 'hono';
import { readFile } from 'fs/promises';
import path from 'path';
import type { BanditArm, ReviewRecord } from '@codeagora/core/types/l0.js';

const CA_ROOT = '.ca';
const MODEL_QUALITY_PATH = path.join(CA_ROOT, 'model-quality.json');

interface BanditStoreData {
  version: number;
  lastUpdated: string;
  arms: Record<string, BanditArm>;
  history: ReviewRecord[];
}

interface ArmWithStats extends BanditArm {
  modelId: string;
  winRate: number;
}

export const modelRoutes = new Hono();

/**
 * GET /api/models — Return arms with computed win rates, history summary, health status.
 */
modelRoutes.get('/', async (c) => {
  const data = await loadBanditData();

  if (!data) {
    return c.json({ arms: [], historySummary: { totalReviews: 0 }, status: 'no_data' });
  }

  const arms: ArmWithStats[] = Object.entries(data.arms).map(([modelId, arm]) => ({
    modelId,
    ...arm,
    winRate: arm.alpha / (arm.alpha + arm.beta),
  }));

  return c.json({
    arms,
    historySummary: {
      totalReviews: data.history.length,
      lastUpdated: data.lastUpdated,
    },
    status: 'ok',
  });
});

/**
 * GET /api/models/history — Return full review history from BanditStore.
 */
modelRoutes.get('/history', async (c) => {
  const data = await loadBanditData();

  if (!data) {
    return c.json({ history: [] });
  }

  return c.json({ history: data.history });
});

/**
 * Load bandit store data from disk.
 */
async function loadBanditData(): Promise<BanditStoreData | null> {
  try {
    const content = await readFile(MODEL_QUALITY_PATH, 'utf-8');
    return JSON.parse(content) as BanditStoreData;
  } catch {
    return null;
  }
}
