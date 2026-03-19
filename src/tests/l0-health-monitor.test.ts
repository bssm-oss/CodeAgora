/**
 * Health Monitor Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HealthMonitor } from '@codeagora/core/l0/health-monitor.js';

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;
  let currentTime: number;

  beforeEach(() => {
    currentTime = 1000000;
    monitor = new HealthMonitor({
      circuitBreaker: {
        failureThreshold: 3,
        cooldownMs: 60_000,
        maxCooldownMs: 300_000,
      },
      dailyBudget: { groq: 100, openrouter: 50 },
      nowFn: () => currentTime,
    });
  });

  describe('Circuit Breaker', () => {
    it('should start in closed state', () => {
      const state = monitor.getCircuitState('groq', 'model-a');
      expect(state.state).toBe('closed');
      expect(state.failCount).toBe(0);
    });

    it('should open after threshold failures', () => {
      monitor.recordFailure('groq', 'model-a');
      monitor.recordFailure('groq', 'model-a');
      expect(monitor.isAvailable('groq', 'model-a')).toBe(true);

      monitor.recordFailure('groq', 'model-a');
      expect(monitor.getCircuitState('groq', 'model-a').state).toBe('open');
      expect(monitor.isAvailable('groq', 'model-a')).toBe(false);
    });

    it('should transition to half-open after cooldown', () => {
      // Open the circuit
      monitor.recordFailure('groq', 'model-a');
      monitor.recordFailure('groq', 'model-a');
      monitor.recordFailure('groq', 'model-a');
      expect(monitor.isAvailable('groq', 'model-a')).toBe(false);

      // Advance time past cooldown
      currentTime += 60_001;
      expect(monitor.isAvailable('groq', 'model-a')).toBe(true);
      expect(monitor.getCircuitState('groq', 'model-a').state).toBe('half-open');
    });

    it('should close on success in half-open state', () => {
      // Open → half-open
      monitor.recordFailure('groq', 'model-a');
      monitor.recordFailure('groq', 'model-a');
      monitor.recordFailure('groq', 'model-a');
      currentTime += 60_001;
      monitor.isAvailable('groq', 'model-a'); // trigger half-open

      // Success in half-open → closed
      monitor.recordSuccess('groq', 'model-a');
      expect(monitor.getCircuitState('groq', 'model-a').state).toBe('closed');
    });

    it('should double cooldown on failure in half-open state', () => {
      // Open → half-open
      monitor.recordFailure('groq', 'model-a');
      monitor.recordFailure('groq', 'model-a');
      monitor.recordFailure('groq', 'model-a');
      currentTime += 60_001;
      monitor.isAvailable('groq', 'model-a'); // trigger half-open

      // Failure in half-open → open with doubled cooldown
      monitor.recordFailure('groq', 'model-a');
      const state = monitor.getCircuitState('groq', 'model-a');
      expect(state.state).toBe('open');
      expect(state.cooldownMs).toBe(120_000);
    });

    it('should cap cooldown at maxCooldownMs', () => {
      // Repeatedly fail to escalate cooldown
      for (let i = 0; i < 10; i++) {
        monitor.recordFailure('groq', 'model-a');
        monitor.recordFailure('groq', 'model-a');
        monitor.recordFailure('groq', 'model-a');
        currentTime += 500_000; // way past cooldown
        monitor.isAvailable('groq', 'model-a'); // half-open
        monitor.recordFailure('groq', 'model-a'); // back to open
      }

      const state = monitor.getCircuitState('groq', 'model-a');
      expect(state.cooldownMs).toBeLessThanOrEqual(300_000);
    });

    it('should track circuits per model independently', () => {
      monitor.recordFailure('groq', 'model-a');
      monitor.recordFailure('groq', 'model-a');
      monitor.recordFailure('groq', 'model-a');

      expect(monitor.isAvailable('groq', 'model-a')).toBe(false);
      expect(monitor.isAvailable('groq', 'model-b')).toBe(true);
    });
  });

  describe('Ping', () => {
    it('should return up on successful ping', async () => {
      const executor = async () => 'pong';
      const result = await monitor.ping('model-a', 'groq', executor);

      expect(result.status).toBe('up');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.modelId).toBe('model-a');
      expect(result.provider).toBe('groq');
    });

    it('should return down on failure', async () => {
      const executor = async () => { throw new Error('Connection refused'); };
      const result = await monitor.ping('model-a', 'groq', executor);

      expect(result.status).toBe('down');
      expect(result.latencyMs).toBeNull();
    });

    it('should detect rate limiting', async () => {
      const executor = async () => { throw new Error('429 Too Many Requests'); };
      const result = await monitor.ping('model-a', 'groq', executor);

      expect(result.status).toBe('rate-limited');
    });

    it('should ping all models concurrently', async () => {
      const executor = async () => 'pong';
      const models = [
        { modelId: 'a', provider: 'groq' },
        { modelId: 'b', provider: 'groq' },
        { modelId: 'c', provider: 'nim' },
      ];

      const results = await monitor.pingAll(models, executor);
      expect(results.length).toBe(3);
      expect(results.every((r) => r.status === 'up')).toBe(true);
    });
  });

  describe('RPD Budget', () => {
    it('should track requests per provider', () => {
      expect(monitor.isWithinBudget('groq')).toBe(true);
      expect(monitor.getRemainingBudget('groq')).toBe(100);

      for (let i = 0; i < 50; i++) {
        monitor.recordRequest('groq');
      }

      expect(monitor.getRemainingBudget('groq')).toBe(50);
    });

    it('should block at budget limit', () => {
      for (let i = 0; i < 100; i++) {
        monitor.recordRequest('groq');
      }

      expect(monitor.isWithinBudget('groq')).toBe(false);
      expect(monitor.getRemainingBudget('groq')).toBe(0);
      // isAvailable should return false due to budget
      expect(monitor.isAvailable('groq', 'any-model')).toBe(false);
    });

    it('should warn at 80% budget', () => {
      for (let i = 0; i < 80; i++) {
        monitor.recordRequest('groq');
      }

      expect(monitor.isNearBudgetLimit('groq')).toBe(true);
      expect(monitor.isWithinBudget('groq')).toBe(true); // still within
    });

    it('should return null for providers without budget', () => {
      expect(monitor.getRemainingBudget('nim')).toBeNull();
      expect(monitor.isWithinBudget('nim')).toBe(true);
      expect(monitor.isNearBudgetLimit('nim')).toBe(false);
    });

    it('should reset daily counts', () => {
      for (let i = 0; i < 100; i++) {
        monitor.recordRequest('groq');
      }
      expect(monitor.isWithinBudget('groq')).toBe(false);

      monitor.resetDailyBudgets();
      expect(monitor.isWithinBudget('groq')).toBe(true);
      expect(monitor.getRemainingBudget('groq')).toBe(100);
    });
  });
});
