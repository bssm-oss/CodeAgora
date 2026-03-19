/**
 * Cost Analytics — Utility Function Tests
 * Tests computeTotalCost, computeAverageCost, findMostExpensive,
 * aggregateByReviewer, aggregateByProvider, computeRunningAverage,
 * formatCost, findMostExpensiveReviewer, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  computeTotalCost,
  computeAverageCost,
  findMostExpensive,
  aggregateByReviewer,
  aggregateByProvider,
  computeRunningAverage,
  formatCost,
  findMostExpensiveReviewer,
} from '../../src/frontend/utils/cost-helpers.js';
import type { SessionCost } from '../../src/frontend/utils/cost-helpers.js';

// ============================================================================
// Test Data
// ============================================================================

const session1: SessionCost = {
  date: '2025-01-15',
  sessionId: '001',
  totalCost: 0.0523,
  reviewerCosts: {
    'openai/gpt-4': 0.035,
    'anthropic/claude-3': 0.0173,
  },
  layerCosts: { L1: 0.04, L2: 0.01, L3: 0.0023 },
};

const session2: SessionCost = {
  date: '2025-01-16',
  sessionId: '002',
  totalCost: 0.0891,
  reviewerCosts: {
    'openai/gpt-4': 0.042,
    'google/gemini-pro': 0.0471,
  },
  layerCosts: { L1: 0.07, L2: 0.015, L3: 0.0041 },
};

const session3: SessionCost = {
  date: '2025-01-16',
  sessionId: '003',
  totalCost: 0.0312,
  reviewerCosts: {
    'anthropic/claude-3': 0.0312,
  },
  layerCosts: { L1: 0.025, L2: 0.005, L3: 0.0012 },
};

const session4: SessionCost = {
  date: '2025-01-17',
  sessionId: '004',
  totalCost: 0.1205,
  reviewerCosts: {
    'openai/gpt-4': 0.065,
    'anthropic/claude-3': 0.0355,
    'google/gemini-pro': 0.02,
  },
  layerCosts: { L1: 0.09, L2: 0.02, L3: 0.0105 },
};

const allSessions: SessionCost[] = [session1, session2, session3, session4];

const zeroSession: SessionCost = {
  date: '2025-01-20',
  sessionId: '005',
  totalCost: 0,
  reviewerCosts: {},
  layerCosts: {},
};

// ============================================================================
// computeTotalCost Tests
// ============================================================================

describe('computeTotalCost', () => {
  it('should sum all session costs', () => {
    const total = computeTotalCost(allSessions);
    expect(total).toBeCloseTo(0.2931, 4);
  });

  it('should return 0 for empty sessions', () => {
    expect(computeTotalCost([])).toBe(0);
  });

  it('should handle single session', () => {
    expect(computeTotalCost([session1])).toBeCloseTo(0.0523, 4);
  });

  it('should handle sessions with zero cost', () => {
    expect(computeTotalCost([zeroSession])).toBe(0);
  });
});

// ============================================================================
// computeAverageCost Tests
// ============================================================================

describe('computeAverageCost', () => {
  it('should compute mean session cost', () => {
    const avg = computeAverageCost(allSessions);
    expect(avg).toBeCloseTo(0.2931 / 4, 4);
  });

  it('should return 0 for empty sessions', () => {
    expect(computeAverageCost([])).toBe(0);
  });

  it('should return exact cost for single session', () => {
    expect(computeAverageCost([session2])).toBeCloseTo(0.0891, 4);
  });
});

// ============================================================================
// findMostExpensive Tests
// ============================================================================

describe('findMostExpensive', () => {
  it('should find the most expensive session', () => {
    const result = findMostExpensive(allSessions);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe('004');
    expect(result!.totalCost).toBeCloseTo(0.1205, 4);
  });

  it('should return null for empty sessions', () => {
    expect(findMostExpensive([])).toBeNull();
  });

  it('should return the only session for single-element array', () => {
    const result = findMostExpensive([session1]);
    expect(result!.sessionId).toBe('001');
  });

  it('should handle sessions with zero cost', () => {
    const result = findMostExpensive([zeroSession]);
    expect(result).not.toBeNull();
    expect(result!.totalCost).toBe(0);
  });
});

// ============================================================================
// aggregateByReviewer Tests
// ============================================================================

describe('aggregateByReviewer', () => {
  it('should aggregate costs by reviewer across sessions', () => {
    const result = aggregateByReviewer(allSessions);
    expect(result.length).toBe(3);

    const openai = result.find((r) => r.reviewer === 'openai/gpt-4');
    expect(openai).toBeDefined();
    expect(openai!.totalCost).toBeCloseTo(0.035 + 0.042 + 0.065, 4);

    const anthropic = result.find((r) => r.reviewer === 'anthropic/claude-3');
    expect(anthropic).toBeDefined();
    expect(anthropic!.totalCost).toBeCloseTo(0.0173 + 0.0312 + 0.0355, 4);

    const google = result.find((r) => r.reviewer === 'google/gemini-pro');
    expect(google).toBeDefined();
    expect(google!.totalCost).toBeCloseTo(0.0471 + 0.02, 4);
  });

  it('should sort by total cost descending', () => {
    const result = aggregateByReviewer(allSessions);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].totalCost).toBeGreaterThanOrEqual(result[i].totalCost);
    }
  });

  it('should return empty array for empty sessions', () => {
    expect(aggregateByReviewer([])).toEqual([]);
  });

  it('should return empty array for sessions with no reviewer costs', () => {
    expect(aggregateByReviewer([zeroSession])).toEqual([]);
  });
});

// ============================================================================
// aggregateByProvider Tests
// ============================================================================

describe('aggregateByProvider', () => {
  it('should aggregate costs by provider (prefix before /)', () => {
    const result = aggregateByProvider(allSessions);
    expect(result.length).toBe(3);

    const openai = result.find((r) => r.provider === 'openai');
    expect(openai).toBeDefined();
    expect(openai!.totalCost).toBeCloseTo(0.035 + 0.042 + 0.065, 4);

    const anthropic = result.find((r) => r.provider === 'anthropic');
    expect(anthropic).toBeDefined();
    expect(anthropic!.totalCost).toBeCloseTo(0.0173 + 0.0312 + 0.0355, 4);

    const google = result.find((r) => r.provider === 'google');
    expect(google).toBeDefined();
    expect(google!.totalCost).toBeCloseTo(0.0471 + 0.02, 4);
  });

  it('should sort by total cost descending', () => {
    const result = aggregateByProvider(allSessions);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].totalCost).toBeGreaterThanOrEqual(result[i].totalCost);
    }
  });

  it('should use full key as provider when no / separator', () => {
    const session: SessionCost = {
      date: '2025-01-20',
      sessionId: '010',
      totalCost: 0.05,
      reviewerCosts: { 'local-model': 0.05 },
      layerCosts: {},
    };
    const result = aggregateByProvider([session]);
    expect(result.length).toBe(1);
    expect(result[0].provider).toBe('local-model');
  });

  it('should return empty array for empty sessions', () => {
    expect(aggregateByProvider([])).toEqual([]);
  });
});

// ============================================================================
// computeRunningAverage Tests
// ============================================================================

describe('computeRunningAverage', () => {
  it('should compute running average over sorted sessions', () => {
    const result = computeRunningAverage(allSessions);
    expect(result.length).toBe(4);

    // After first session: avg = 0.0523
    expect(result[0].average).toBeCloseTo(0.0523, 4);
    // After second: avg = (0.0523 + next) / 2 — sorted by date then id
    expect(result[1].cost).toBeGreaterThan(0);
    expect(result[1].average).toBeCloseTo(
      (result[0].cost + result[1].cost) / 2,
      4,
    );
  });

  it('should sort by date then sessionId', () => {
    const result = computeRunningAverage(allSessions);
    expect(result[0].date).toBe('2025-01-15');
    expect(result[result.length - 1].date).toBe('2025-01-17');
  });

  it('should return empty array for empty sessions', () => {
    expect(computeRunningAverage([])).toEqual([]);
  });

  it('should handle single session', () => {
    const result = computeRunningAverage([session1]);
    expect(result.length).toBe(1);
    expect(result[0].average).toBeCloseTo(session1.totalCost, 4);
    expect(result[0].cost).toBeCloseTo(session1.totalCost, 4);
  });

  it('should preserve running cumulative calculation', () => {
    const result = computeRunningAverage(allSessions);
    let cumulative = 0;
    for (let i = 0; i < result.length; i++) {
      cumulative += result[i].cost;
      expect(result[i].average).toBeCloseTo(cumulative / (i + 1), 4);
    }
  });
});

// ============================================================================
// formatCost Tests
// ============================================================================

describe('formatCost', () => {
  it('should format as $X.XXXX', () => {
    expect(formatCost(0.0523)).toBe('$0.0523');
  });

  it('should format zero', () => {
    expect(formatCost(0)).toBe('$0.0000');
  });

  it('should format larger values', () => {
    expect(formatCost(1.5)).toBe('$1.5000');
  });

  it('should round to 4 decimal places', () => {
    expect(formatCost(0.123456789)).toBe('$0.1235');
  });
});

// ============================================================================
// findMostExpensiveReviewer Tests
// ============================================================================

describe('findMostExpensiveReviewer', () => {
  it('should find reviewer with highest aggregate cost', () => {
    const result = findMostExpensiveReviewer(allSessions);
    expect(result).not.toBeNull();
    expect(result!.reviewer).toBe('openai/gpt-4');
  });

  it('should return null for empty sessions', () => {
    expect(findMostExpensiveReviewer([])).toBeNull();
  });

  it('should return null for sessions with no reviewer costs', () => {
    expect(findMostExpensiveReviewer([zeroSession])).toBeNull();
  });
});
