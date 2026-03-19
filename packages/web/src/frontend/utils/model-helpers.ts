/**
 * Pure utility functions for the model intelligence dashboard.
 * Separated from React components so they can be unit-tested in Node environment.
 */

// ============================================================================
// Types
// ============================================================================

interface BanditArm {
  alpha: number;
  beta: number;
  reviewCount: number;
  lastUsed: number;
}

interface ArmWithStats extends BanditArm {
  modelId: string;
  winRate: number;
}

interface ReviewRecord {
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

interface ProviderAggregate {
  provider: string;
  totalReviews: number;
  averageWinRate: number;
  activeModels: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
}

interface QualityDataPoint {
  timestamp: number;
  modelId: string;
  compositeQ: number;
}

interface HistoryStats {
  totalReviews: number;
  averageCompositeQ: number;
  averageSpecificity: number;
  rewardRate: number;
}

// ============================================================================
// Win rate / confidence computation
// ============================================================================

/**
 * Compute win rate from alpha/beta parameters.
 * Returns alpha / (alpha + beta), or 0 if both are zero.
 */
function computeWinRate(arm: BanditArm): number {
  const total = arm.alpha + arm.beta;
  if (total === 0) return 0;
  return arm.alpha / total;
}

/**
 * Compute 95% confidence interval half-width: ±1.96 * sqrt(p*(1-p)/n).
 * Returns 0 for zero sample size.
 */
function computeConfidenceInterval(arm: BanditArm): number {
  const n = arm.alpha + arm.beta;
  if (n === 0) return 0;
  const p = arm.alpha / n;
  return 1.96 * Math.sqrt((p * (1 - p)) / n);
}

// ============================================================================
// Grouping / aggregation
// ============================================================================

/**
 * Extract provider prefix from modelId (e.g. "openai/gpt-4" -> "openai").
 */
function extractProvider(modelId: string): string {
  const slashIndex = modelId.indexOf('/');
  return slashIndex > 0 ? modelId.slice(0, slashIndex) : modelId;
}

/**
 * Group model keys by their provider prefix.
 * Returns a map of provider -> list of ArmWithStats.
 */
function groupByProvider(arms: readonly ArmWithStats[]): Map<string, ArmWithStats[]> {
  const groups = new Map<string, ArmWithStats[]>();

  for (const arm of arms) {
    const provider = extractProvider(arm.modelId);
    const list = groups.get(provider);
    if (list) {
      list.push(arm);
    } else {
      groups.set(provider, [arm]);
    }
  }

  return groups;
}

/**
 * Compute provider-level aggregates from arms grouped by provider.
 */
function aggregateProviders(arms: readonly ArmWithStats[]): ProviderAggregate[] {
  const groups = groupByProvider(arms);
  const result: ProviderAggregate[] = [];

  for (const [provider, providerArms] of groups) {
    const totalReviews = providerArms.reduce((sum, a) => sum + a.reviewCount, 0);
    const averageWinRate =
      providerArms.length > 0
        ? providerArms.reduce((sum, a) => sum + a.winRate, 0) / providerArms.length
        : 0;

    let status: ProviderAggregate['status'];
    if (averageWinRate > 0.6) {
      status = 'healthy';
    } else if (averageWinRate >= 0.4) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    result.push({
      provider,
      totalReviews,
      averageWinRate,
      activeModels: providerArms.length,
      status,
    });
  }

  return result.sort((a, b) => b.averageWinRate - a.averageWinRate);
}

/**
 * Compute aggregate statistics from review history, optionally filtered by modelId.
 */
function aggregateHistory(history: readonly ReviewRecord[], modelId?: string): HistoryStats {
  const filtered = modelId
    ? history.filter((r) => r.modelId === modelId)
    : history;

  if (filtered.length === 0) {
    return { totalReviews: 0, averageCompositeQ: 0, averageSpecificity: 0, rewardRate: 0 };
  }

  const withQ = filtered.filter((r) => r.compositeQ !== null);
  const averageCompositeQ =
    withQ.length > 0
      ? withQ.reduce((sum, r) => sum + (r.compositeQ as number), 0) / withQ.length
      : 0;

  const averageSpecificity =
    filtered.reduce((sum, r) => sum + r.specificityScore, 0) / filtered.length;

  const withReward = filtered.filter((r) => r.rewardSignal !== null);
  const rewardRate =
    withReward.length > 0
      ? withReward.filter((r) => r.rewardSignal === 1).length / withReward.length
      : 0;

  return {
    totalReviews: filtered.length,
    averageCompositeQ,
    averageSpecificity,
    rewardRate,
  };
}

/**
 * Extract quality trend time series data, grouped by model.
 * Returns data points sorted by timestamp.
 */
function getQualityTrend(history: readonly ReviewRecord[]): QualityDataPoint[] {
  const points: QualityDataPoint[] = [];

  for (const record of history) {
    if (record.compositeQ !== null) {
      points.push({
        timestamp: record.timestamp,
        modelId: record.modelId,
        compositeQ: record.compositeQ,
      });
    }
  }

  return points.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Get unique model IDs from quality data points.
 */
function getUniqueModels(points: readonly QualityDataPoint[]): string[] {
  return [...new Set(points.map((p) => p.modelId))];
}

/**
 * Count reviews per model from history records.
 */
function countReviewsByModel(history: readonly ReviewRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of history) {
    counts.set(record.modelId, (counts.get(record.modelId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Format a timestamp as a short date string (MM/DD).
 */
function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * Format a timestamp as a full date string.
 */
function formatFullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString();
}

// ============================================================================
// Color palette for chart lines
// ============================================================================

const MODEL_COLORS = [
  '#58a6ff', // accent blue
  '#3fb950', // green
  '#d29922', // yellow
  '#f85149', // red
  '#bc6bff', // purple
  '#79c0ff', // light blue
  '#56d364', // light green
  '#e3b341', // light yellow
  '#ff7b72', // light red
  '#d2a8ff', // light purple
];

function getModelColor(index: number): string {
  return MODEL_COLORS[index % MODEL_COLORS.length];
}

// ============================================================================
// Exports
// ============================================================================

export {
  computeWinRate,
  computeConfidenceInterval,
  extractProvider,
  groupByProvider,
  aggregateProviders,
  aggregateHistory,
  getQualityTrend,
  getUniqueModels,
  countReviewsByModel,
  formatShortDate,
  formatFullDate,
  getModelColor,
  MODEL_COLORS,
};

export type {
  BanditArm,
  ArmWithStats,
  ReviewRecord,
  ProviderAggregate,
  QualityDataPoint,
  HistoryStats,
};
