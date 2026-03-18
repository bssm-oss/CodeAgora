/**
 * Health Monitor
 * Delegates circuit breaker logic to the unified L1 CircuitBreaker (#84).
 * Adds daily RPD budget tracking and ping functionality on top.
 */

import type { PingResult } from '../types/l0.js';
import { CircuitBreaker } from '../l1/circuit-breaker.js';

// ============================================================================
// Health Monitor
// ============================================================================

export class HealthMonitor {
  private readonly cb: CircuitBreaker;
  private dailyCounts = new Map<string, number>();
  private dailyBudgets = new Map<string, number>();
  private nowFn: () => number;

  constructor(options?: {
    circuitBreaker?: Partial<{
      failureThreshold: number;
      cooldownMs: number;
      maxCooldownMs: number;
    }>;
    dailyBudget?: Record<string, number>;
    nowFn?: () => number;
  }) {
    this.nowFn = options?.nowFn ?? (() => Date.now());

    // Delegate to unified CircuitBreaker from L1
    this.cb = new CircuitBreaker({
      failureThreshold: options?.circuitBreaker?.failureThreshold,
      cooldownMs: options?.circuitBreaker?.cooldownMs,
      maxCooldownMs: options?.circuitBreaker?.maxCooldownMs,
      nowFn: this.nowFn,
    });

    if (options?.dailyBudget) {
      for (const [provider, limit] of Object.entries(options.dailyBudget)) {
        this.dailyBudgets.set(provider, limit);
      }
    }
  }

  // ==========================================================================
  // Circuit Breaker (delegated to unified L1 CircuitBreaker)
  // ==========================================================================

  getCircuitState(provider: string, modelId: string) {
    return this.cb.getFullState(provider, modelId);
  }

  /**
   * Check if a model is available (circuit not open + within RPD budget).
   */
  isAvailable(provider: string, modelId: string): boolean {
    if (this.cb.isOpen(provider, modelId)) {
      return false;
    }

    // Check RPD budget
    if (!this.isWithinBudget(provider)) {
      return false;
    }

    return true;
  }

  recordSuccess(provider: string, modelId: string): void {
    this.cb.recordSuccess(provider, modelId);
  }

  recordFailure(provider: string, modelId: string): void {
    this.cb.recordFailure(provider, modelId);
  }

  // ==========================================================================
  // Ping
  // ==========================================================================

  /**
   * Ping a model endpoint via AI SDK generateText.
   * Accepts an executor function to decouple from provider-registry.
   */
  async ping(
    modelId: string,
    provider: string,
    executor: (modelId: string, provider: string) => Promise<string>
  ): Promise<PingResult> {
    const start = this.nowFn();

    try {
      await executor(modelId, provider);
      const latencyMs = this.nowFn() - start;

      this.recordSuccess(provider, modelId);

      return {
        modelId,
        provider,
        status: 'up',
        latencyMs,
        timestamp: start,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimited = /rate.?limit|429|too many/i.test(message);

      this.recordFailure(provider, modelId);

      return {
        modelId,
        provider,
        status: isRateLimited ? 'rate-limited' : 'down',
        latencyMs: null,
        timestamp: start,
      };
    }
  }

  /**
   * Ping multiple models concurrently.
   */
  async pingAll(
    models: Array<{ modelId: string; provider: string }>,
    executor: (modelId: string, provider: string) => Promise<string>,
    concurrency: number = 20
  ): Promise<PingResult[]> {
    const results: PingResult[] = [];
    const queue = [...models];

    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift()!;
        const result = await this.ping(item.modelId, item.provider, executor);
        results.push(result);
      }
    });

    await Promise.all(workers);
    return results;
  }

  // ==========================================================================
  // RPD Budget
  // ==========================================================================

  recordRequest(provider: string): void {
    const current = this.dailyCounts.get(provider) ?? 0;
    this.dailyCounts.set(provider, current + 1);
  }

  getRemainingBudget(provider: string): number | null {
    const budget = this.dailyBudgets.get(provider);
    if (budget === undefined) return null;

    const used = this.dailyCounts.get(provider) ?? 0;
    return Math.max(0, budget - used);
  }

  isWithinBudget(provider: string): boolean {
    const budget = this.dailyBudgets.get(provider);
    if (budget === undefined) return true; // No budget set = unlimited

    const used = this.dailyCounts.get(provider) ?? 0;
    return used < budget;
  }

  /**
   * Check if provider is at 80%+ budget usage (warning threshold).
   */
  isNearBudgetLimit(provider: string): boolean {
    const budget = this.dailyBudgets.get(provider);
    if (budget === undefined) return false;

    const used = this.dailyCounts.get(provider) ?? 0;
    return used >= budget * 0.8;
  }

  resetDailyBudgets(): void {
    this.dailyCounts.clear();
  }
}
