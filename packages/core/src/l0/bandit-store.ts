/**
 * Bandit Store
 * Persists Thompson Sampling bandit state and review history to disk.
 * Storage: .ca/model-quality.json
 */

import type { BanditArm, ReviewRecord } from '../types/l0.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface BanditStoreData {
  version: number;
  lastUpdated: string;
  arms: Record<string, BanditArm>;
  history: ReviewRecord[];
}

const BanditArmSchema = z.object({
  alpha: z.number(),
  beta: z.number(),
  reviewCount: z.number(),
  lastUsed: z.number(),
});

const BanditStoreDataSchema = z.object({
  version: z.number(),
  lastUpdated: z.string(),
  arms: z.record(z.string(), BanditArmSchema),
  history: z.array(z.object({
    reviewId: z.string(),
    diffId: z.string(),
    modelId: z.string(),
    provider: z.string(),
    timestamp: z.number(),
    issuesRaised: z.number(),
    specificityScore: z.number(),
    peerValidationRate: z.number().nullable(),
    headAcceptanceRate: z.number().nullable(),
    compositeQ: z.number().nullable(),
    rewardSignal: z.union([z.literal(0), z.literal(1), z.null()]),
  })),
});

// ============================================================================
// Store
// ============================================================================

const DEFAULT_STORE_PATH = path.join(process.cwd(), '.ca', 'model-quality.json');

export class BanditStore {
  private data: BanditStoreData;
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? DEFAULT_STORE_PATH;
    this.data = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      arms: {},
      history: [],
    };
  }

  async load(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(content);
      this.data = BanditStoreDataSchema.parse(parsed) as BanditStoreData;
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.warn('[BanditStore] Invalid data file, using defaults:', error.message);
      }
      // File doesn't exist or invalid — use defaults
    }
  }

  async save(): Promise<void> {
    this.data.lastUpdated = new Date().toISOString();
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  getArm(key: string): BanditArm | undefined {
    return this.data.arms[key];
  }

  getAllArms(): Map<string, BanditArm> {
    return new Map(Object.entries(this.data.arms));
  }

  updateArm(key: string, reward: 0 | 1): void {
    const arm = this.data.arms[key] ?? {
      alpha: 1,
      beta: 1,
      reviewCount: 0,
      lastUsed: 0,
    };

    if (reward === 1) {
      arm.alpha += 1;
    } else {
      arm.beta += 1;
    }
    arm.reviewCount += 1;
    arm.lastUsed = Date.now();
    this.data.arms[key] = arm;
  }

  /**
   * Warm-start a new model version from an old arm's prior (50% decay).
   */
  warmStart(oldKey: string, newKey: string): void {
    const oldArm = this.data.arms[oldKey];
    if (!oldArm) return;

    this.data.arms[newKey] = {
      alpha: Math.round(oldArm.alpha * 0.5) + 1,
      beta: Math.round(oldArm.beta * 0.5) + 1,
      reviewCount: 0,
      lastUsed: Date.now(),
    };
  }

  addHistory(record: ReviewRecord, maxHistory: number = 1000): void {
    this.data.history.push(record);
    // Trim oldest entries if over limit
    if (this.data.history.length > maxHistory) {
      this.data.history = this.data.history.slice(-maxHistory);
    }
  }

  getHistory(): ReviewRecord[] {
    return this.data.history;
  }

  getData(): BanditStoreData {
    return this.data;
  }
}
