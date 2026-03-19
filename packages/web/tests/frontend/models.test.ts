/**
 * Tests for model intelligence dashboard utilities.
 */
import { describe, it, expect } from 'vitest';
import {
  computeWinRate,
  computeConfidenceInterval,
  groupByProvider,
  aggregateProviders,
  aggregateHistory,
  getQualityTrend,
  countReviewsByModel,
  extractProvider,
  getModelColor,
  formatShortDate,
} from '../../src/frontend/utils/model-helpers.js';

// ============================================================================
// computeWinRate
// ============================================================================

describe('computeWinRate', () => {
  it('returns alpha / (alpha + beta)', () => {
    expect(computeWinRate({ alpha: 8, beta: 2, reviewCount: 10, lastUsed: 0 })).toBeCloseTo(0.8);
  });

  it('returns 0.5 for equal alpha and beta', () => {
    expect(computeWinRate({ alpha: 5, beta: 5, reviewCount: 10, lastUsed: 0 })).toBeCloseTo(0.5);
  });

  it('returns 0 when both are zero', () => {
    expect(computeWinRate({ alpha: 0, beta: 0, reviewCount: 0, lastUsed: 0 })).toBe(0);
  });

  it('returns 1 when beta is zero', () => {
    expect(computeWinRate({ alpha: 10, beta: 0, reviewCount: 10, lastUsed: 0 })).toBe(1);
  });
});

// ============================================================================
// computeConfidenceInterval
// ============================================================================

describe('computeConfidenceInterval', () => {
  it('returns positive value for normal arm', () => {
    const ci = computeConfidenceInterval({ alpha: 8, beta: 2, reviewCount: 10, lastUsed: 0 });
    expect(ci).toBeGreaterThan(0);
    expect(ci).toBeLessThan(1);
  });

  it('returns 0 for zero sample size', () => {
    expect(computeConfidenceInterval({ alpha: 0, beta: 0, reviewCount: 0, lastUsed: 0 })).toBe(0);
  });

  it('narrows with more samples', () => {
    const ciSmall = computeConfidenceInterval({ alpha: 4, beta: 1, reviewCount: 5, lastUsed: 0 });
    const ciLarge = computeConfidenceInterval({ alpha: 80, beta: 20, reviewCount: 100, lastUsed: 0 });
    expect(ciLarge).toBeLessThan(ciSmall);
  });
});

// ============================================================================
// extractProvider
// ============================================================================

describe('extractProvider', () => {
  it('extracts provider from model key', () => {
    expect(extractProvider('anthropic/claude-sonnet-4')).toBe('anthropic');
  });

  it('returns full string if no slash', () => {
    expect(extractProvider('gpt-4o')).toBe('gpt-4o');
  });
});

// ============================================================================
// groupByProvider
// ============================================================================

describe('groupByProvider', () => {
  it('groups arms by provider prefix', () => {
    const arms = [
      { modelId: 'anthropic/claude-3', alpha: 5, beta: 2, reviewCount: 7, lastUsed: 0, winRate: 0.71 },
      { modelId: 'anthropic/claude-4', alpha: 8, beta: 1, reviewCount: 9, lastUsed: 0, winRate: 0.89 },
      { modelId: 'openai/gpt-4o', alpha: 6, beta: 4, reviewCount: 10, lastUsed: 0, winRate: 0.6 },
    ];
    const grouped = groupByProvider(arms);
    expect(grouped.get('anthropic')?.length).toBe(2);
    expect(grouped.get('openai')?.length).toBe(1);
  });

  it('returns empty map for empty input', () => {
    expect(groupByProvider([]).size).toBe(0);
  });
});

// ============================================================================
// aggregateProviders
// ============================================================================

describe('aggregateProviders', () => {
  it('computes aggregate stats per provider', () => {
    const arms = [
      { modelId: 'anthropic/claude-3', alpha: 8, beta: 2, reviewCount: 10, lastUsed: 0, winRate: 0.8 },
      { modelId: 'openai/gpt-4o', alpha: 3, beta: 7, reviewCount: 10, lastUsed: 0, winRate: 0.3 },
    ];
    const agg = aggregateProviders(arms);
    const anthropic = agg.find(a => a.provider === 'anthropic');
    expect(anthropic?.status).toBe('healthy');
    const openai = agg.find(a => a.provider === 'openai');
    expect(openai?.status).toBe('unhealthy');
  });
});

// ============================================================================
// aggregateHistory
// ============================================================================

describe('aggregateHistory', () => {
  const history = [
    { reviewId: 'r1', diffId: 'd1', modelId: 'm1', provider: 'p1', timestamp: 1000, issuesRaised: 3, specificityScore: 0.8, peerValidationRate: null, headAcceptanceRate: null, compositeQ: 0.7, rewardSignal: 1 as const },
    { reviewId: 'r2', diffId: 'd2', modelId: 'm1', provider: 'p1', timestamp: 2000, issuesRaised: 2, specificityScore: 0.6, peerValidationRate: null, headAcceptanceRate: null, compositeQ: 0.5, rewardSignal: 0 as const },
  ];

  it('computes average compositeQ', () => {
    const stats = aggregateHistory(history);
    expect(stats.averageCompositeQ).toBeCloseTo(0.6);
  });

  it('computes reward rate', () => {
    const stats = aggregateHistory(history);
    expect(stats.rewardRate).toBeCloseTo(0.5);
  });

  it('filters by modelId when provided', () => {
    const stats = aggregateHistory(history, 'm1');
    expect(stats.totalReviews).toBe(2);
  });

  it('returns zeros for empty history', () => {
    const stats = aggregateHistory([]);
    expect(stats.totalReviews).toBe(0);
    expect(stats.averageCompositeQ).toBe(0);
  });
});

// ============================================================================
// getQualityTrend
// ============================================================================

describe('getQualityTrend', () => {
  it('extracts data points with compositeQ', () => {
    const history = [
      { reviewId: 'r1', diffId: 'd1', modelId: 'm1', provider: 'p1', timestamp: 1000, issuesRaised: 3, specificityScore: 0.8, peerValidationRate: null, headAcceptanceRate: null, compositeQ: 0.7, rewardSignal: null },
      { reviewId: 'r2', diffId: 'd2', modelId: 'm2', provider: 'p2', timestamp: 2000, issuesRaised: 2, specificityScore: 0.6, peerValidationRate: null, headAcceptanceRate: null, compositeQ: null, rewardSignal: null },
    ];
    const trend = getQualityTrend(history);
    expect(trend.length).toBe(1);
    expect(trend[0].modelId).toBe('m1');
  });

  it('returns empty for empty history', () => {
    expect(getQualityTrend([]).length).toBe(0);
  });
});

// ============================================================================
// countReviewsByModel
// ============================================================================

describe('countReviewsByModel', () => {
  it('counts reviews per model', () => {
    const history = [
      { reviewId: 'r1', diffId: 'd1', modelId: 'm1', provider: 'p1', timestamp: 1000, issuesRaised: 3, specificityScore: 0.8, peerValidationRate: null, headAcceptanceRate: null, compositeQ: null, rewardSignal: null },
      { reviewId: 'r2', diffId: 'd2', modelId: 'm1', provider: 'p1', timestamp: 2000, issuesRaised: 2, specificityScore: 0.6, peerValidationRate: null, headAcceptanceRate: null, compositeQ: null, rewardSignal: null },
      { reviewId: 'r3', diffId: 'd3', modelId: 'm2', provider: 'p2', timestamp: 3000, issuesRaised: 1, specificityScore: 0.5, peerValidationRate: null, headAcceptanceRate: null, compositeQ: null, rewardSignal: null },
    ];
    const counts = countReviewsByModel(history);
    expect(counts.get('m1')).toBe(2);
    expect(counts.get('m2')).toBe(1);
  });
});

// ============================================================================
// getModelColor
// ============================================================================

describe('getModelColor', () => {
  it('returns a string color', () => {
    expect(typeof getModelColor(0)).toBe('string');
    expect(getModelColor(0)).toMatch(/^#/);
  });

  it('wraps around for large indices', () => {
    expect(typeof getModelColor(100)).toBe('string');
  });
});
