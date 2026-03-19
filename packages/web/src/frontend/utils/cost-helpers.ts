/**
 * Pure utility functions for the cost analytics dashboard.
 * Separated from React components so they can be unit-tested in Node environment.
 */

// ============================================================================
// Types
// ============================================================================

interface SessionCost {
  date: string;
  sessionId: string;
  totalCost: number;
  reviewerCosts: Record<string, number>;
  layerCosts: Record<string, number>;
}

interface CostsApiResponse {
  totalCost: number;
  sessionCount: number;
  sessions: SessionCost[];
  perReviewerCosts: Record<string, number>;
  perLayerCosts: Record<string, number>;
}

interface ReviewerAggregate {
  reviewer: string;
  totalCost: number;
}

interface ProviderAggregate {
  provider: string;
  totalCost: number;
}

interface RunningAveragePoint {
  date: string;
  sessionId: string;
  cost: number;
  average: number;
}

// ============================================================================
// Core computations
// ============================================================================

/**
 * Sum all session costs.
 */
function computeTotalCost(sessions: readonly SessionCost[]): number {
  let total = 0;
  for (const session of sessions) {
    total += session.totalCost;
  }
  return total;
}

/**
 * Mean session cost. Returns 0 for empty arrays.
 */
function computeAverageCost(sessions: readonly SessionCost[]): number {
  if (sessions.length === 0) return 0;
  return computeTotalCost(sessions) / sessions.length;
}

/**
 * Find the session with the highest totalCost.
 * Returns null for empty arrays.
 */
function findMostExpensive(sessions: readonly SessionCost[]): SessionCost | null {
  if (sessions.length === 0) return null;
  let most = sessions[0];
  for (let i = 1; i < sessions.length; i++) {
    if (sessions[i].totalCost > most.totalCost) {
      most = sessions[i];
    }
  }
  return most;
}

/**
 * Aggregate costs by reviewer across all sessions, sorted descending by cost.
 */
function aggregateByReviewer(sessions: readonly SessionCost[]): ReviewerAggregate[] {
  const map = new Map<string, number>();

  for (const session of sessions) {
    for (const [reviewer, cost] of Object.entries(session.reviewerCosts)) {
      map.set(reviewer, (map.get(reviewer) ?? 0) + cost);
    }
  }

  return [...map.entries()]
    .map(([reviewer, totalCost]) => ({ reviewer, totalCost }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

/**
 * Aggregate costs by provider across all sessions, sorted descending by cost.
 * Extracts provider from reviewer key (format: "provider/model" or just the key).
 */
function aggregateByProvider(sessions: readonly SessionCost[]): ProviderAggregate[] {
  const map = new Map<string, number>();

  for (const session of sessions) {
    for (const [reviewer, cost] of Object.entries(session.reviewerCosts)) {
      const provider = reviewer.includes('/') ? reviewer.split('/')[0] : reviewer;
      map.set(provider, (map.get(provider) ?? 0) + cost);
    }
  }

  return [...map.entries()]
    .map(([provider, totalCost]) => ({ provider, totalCost }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

/**
 * Compute running average of session costs over time.
 * Sessions are sorted by date, then sessionId.
 */
function computeRunningAverage(sessions: readonly SessionCost[]): RunningAveragePoint[] {
  if (sessions.length === 0) return [];

  const sorted = [...sessions].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.sessionId.localeCompare(b.sessionId);
  });

  let cumulative = 0;
  return sorted.map((session, index) => {
    cumulative += session.totalCost;
    return {
      date: session.date,
      sessionId: session.sessionId,
      cost: session.totalCost,
      average: cumulative / (index + 1),
    };
  });
}

/**
 * Format a cost value as $X.XXXX.
 */
function formatCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

/**
 * Find the reviewer with the highest aggregate cost.
 * Returns null for empty arrays.
 */
function findMostExpensiveReviewer(sessions: readonly SessionCost[]): ReviewerAggregate | null {
  const aggregated = aggregateByReviewer(sessions);
  return aggregated.length > 0 ? aggregated[0] : null;
}

// ============================================================================
// Exports
// ============================================================================

export {
  computeTotalCost,
  computeAverageCost,
  findMostExpensive,
  aggregateByReviewer,
  aggregateByProvider,
  computeRunningAverage,
  formatCost,
  findMostExpensiveReviewer,
};

export type {
  SessionCost,
  CostsApiResponse,
  ReviewerAggregate,
  ProviderAggregate,
  RunningAveragePoint,
};
