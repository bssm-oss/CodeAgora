/**
 * L0 Model Intelligence Layer Types
 */

import { z } from 'zod';

// ============================================================================
// Model Metadata (frouter model-rankings.json based)
// ============================================================================

export const ModelMetadataSchema = z.object({
  source: z.string(),
  modelId: z.string(),
  name: z.string(),
  tier: z.enum(['S+', 'S', 'A+', 'A', 'A-', 'B+', 'B', 'C']).optional(),
  context: z.string(),
  family: z.string(),
  isReasoning: z.boolean(),
  sweBench: z.string().optional(),
  aaIntelligence: z.number().optional(),
  aaSpeedTps: z.number().optional(),
});
export type ModelMetadata = z.infer<typeof ModelMetadataSchema>;

// ============================================================================
// Circuit Breaker
// ============================================================================

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerState {
  state: CircuitState;
  failCount: number;
  lastFailure: number | null;
  cooldownMs: number;
  successCount: number;
}

// ============================================================================
// Ping
// ============================================================================

export interface PingResult {
  modelId: string;
  provider: string;
  status: 'up' | 'down' | 'rate-limited';
  latencyMs: number | null;
  timestamp: number;
}

// ============================================================================
// Model Selection
// ============================================================================

export interface ModelSelection {
  selections: Array<{
    modelId: string;
    provider: string;
    family: string;
    isReasoning: boolean;
    selectionReason: 'thompson-sampling' | 'exploration' | 'diversity-fill' | 'static';
  }>;
  metadata: {
    familyCount: number;
    reasoningCount: number;
    explorationSlots: number;
  };
}

// ============================================================================
// Bandit Arm
// ============================================================================

export interface BanditArm {
  alpha: number;
  beta: number;
  reviewCount: number;
  lastUsed: number;
}

// ============================================================================
// Model Router Config
// ============================================================================

export const ModelRouterConfigSchema = z.object({
  enabled: z.boolean().default(false),
  strategy: z.enum(['thompson-sampling']).default('thompson-sampling'),
  providers: z.record(z.string(), z.object({
    enabled: z.boolean().default(true),
  })).optional(),
  constraints: z.object({
    familyDiversity: z.boolean().default(true),
    includeReasoning: z.boolean().default(true),
    minFamilies: z.number().default(3),
    reasoningMin: z.number().default(1),
    reasoningMax: z.number().default(2),
    contextMin: z.string().default('32k'),
  }).optional(),
  circuitBreaker: z.object({
    failureThreshold: z.number().default(3),
    cooldownMs: z.number().default(60000),
    maxCooldownMs: z.number().default(300000),
  }).optional(),
  dailyBudget: z.record(z.string(), z.number()).optional(),
  explorationRate: z.number().default(0.1),
});
export type ModelRouterConfig = z.infer<typeof ModelRouterConfigSchema>;

// ============================================================================
// Review Record (Quality Tracking)
// ============================================================================

export interface ReviewRecord {
  reviewId: string;
  diffId: string;
  modelId: string;
  provider: string;
  timestamp: number;
  issuesRaised: number;
  specificityScore: number;
  peerValidationRate: number | null;
  headAcceptanceRate: number | null;
  compositeQ: number | null;
  rewardSignal: 0 | 1 | null;
}
