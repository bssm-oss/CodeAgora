import { describe, expect, it } from 'vitest';
import { simulateRateLimitRun } from '../l1/rate-limit-sim.js';

describe('simulateRateLimitRun', () => {
  it('completes all jobs when the per-minute cap can absorb the run', () => {
    const result = simulateRateLimitRun({
      requests: 6,
      concurrency: 3,
      maxRetries: 2,
      retryAfterMs: 5_000,
      requestDurationMs: 1_000,
      perMinuteLimit: 20,
    });

    expect(result.completedJobs).toBe(6);
    expect(result.failedJobs).toBe(0);
    expect(result.rateLimitedAttempts).toBe(0);
    expect(result.peakConcurrency).toBe(3);
  });

  it('surfaces 429 pressure when concurrency exceeds a tight per-minute cap', () => {
    const result = simulateRateLimitRun({
      requests: 6,
      concurrency: 6,
      maxRetries: 1,
      retryAfterMs: 1_000,
      requestDurationMs: 500,
      perMinuteLimit: 3,
    });

    expect(result.completedJobs).toBe(3);
    expect(result.failedJobs).toBe(3);
    expect(result.rateLimitedAttempts).toBeGreaterThan(0);
    expect(result.recommendations.join(' ')).toMatch(/lower concurrency/);
  });

  it('models daily-cap exhaustion separately from transient 429 pressure', () => {
    const result = simulateRateLimitRun({
      requests: 5,
      concurrency: 2,
      maxRetries: 2,
      retryAfterMs: 1_000,
      requestDurationMs: 500,
      dailyLimit: 3,
    });

    expect(result.completedJobs).toBe(3);
    expect(result.failedJobs).toBe(2);
    expect(result.dailyLimitBlockedAttempts).toBe(2);
    expect(result.recommendations.join(' ')).toMatch(/split runs across days/);
  });

  it('rejects invalid simulation inputs', () => {
    expect(() =>
      simulateRateLimitRun({
        requests: 0,
        concurrency: 1,
        maxRetries: 1,
        retryAfterMs: 1_000,
        requestDurationMs: 500,
      }),
    ).toThrow(/requests/);
  });
});
