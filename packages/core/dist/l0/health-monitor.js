import { CircuitBreaker } from "../l1/circuit-breaker.js";
class HealthMonitor {
  cb;
  dailyCounts = /* @__PURE__ */ new Map();
  dailyBudgets = /* @__PURE__ */ new Map();
  nowFn;
  constructor(options) {
    this.nowFn = options?.nowFn ?? (() => Date.now());
    this.cb = new CircuitBreaker({
      failureThreshold: options?.circuitBreaker?.failureThreshold,
      cooldownMs: options?.circuitBreaker?.cooldownMs,
      maxCooldownMs: options?.circuitBreaker?.maxCooldownMs,
      nowFn: this.nowFn
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
  getCircuitState(provider, modelId) {
    return this.cb.getFullState(provider, modelId);
  }
  /**
   * Check if a model is available (circuit not open + within RPD budget).
   */
  isAvailable(provider, modelId) {
    if (this.cb.isOpen(provider, modelId)) {
      return false;
    }
    if (!this.isWithinBudget(provider)) {
      return false;
    }
    return true;
  }
  recordSuccess(provider, modelId) {
    this.cb.recordSuccess(provider, modelId);
  }
  recordFailure(provider, modelId) {
    this.cb.recordFailure(provider, modelId);
  }
  // ==========================================================================
  // Ping
  // ==========================================================================
  /**
   * Ping a model endpoint via AI SDK generateText.
   * Accepts an executor function to decouple from provider-registry.
   */
  async ping(modelId, provider, executor) {
    const start = this.nowFn();
    try {
      await executor(modelId, provider);
      const latencyMs = this.nowFn() - start;
      this.recordSuccess(provider, modelId);
      return {
        modelId,
        provider,
        status: "up",
        latencyMs,
        timestamp: start
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimited = /rate.?limit|429|too many/i.test(message);
      this.recordFailure(provider, modelId);
      return {
        modelId,
        provider,
        status: isRateLimited ? "rate-limited" : "down",
        latencyMs: null,
        timestamp: start
      };
    }
  }
  /**
   * Ping multiple models concurrently.
   */
  async pingAll(models, executor, concurrency = 20) {
    const results = [];
    const queue = [...models];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
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
  recordRequest(provider) {
    const current = this.dailyCounts.get(provider) ?? 0;
    this.dailyCounts.set(provider, current + 1);
  }
  getRemainingBudget(provider) {
    const budget = this.dailyBudgets.get(provider);
    if (budget === void 0) return null;
    const used = this.dailyCounts.get(provider) ?? 0;
    return Math.max(0, budget - used);
  }
  isWithinBudget(provider) {
    const budget = this.dailyBudgets.get(provider);
    if (budget === void 0) return true;
    const used = this.dailyCounts.get(provider) ?? 0;
    return used < budget;
  }
  /**
   * Check if provider is at 80%+ budget usage (warning threshold).
   */
  isNearBudgetLimit(provider) {
    const budget = this.dailyBudgets.get(provider);
    if (budget === void 0) return false;
    const used = this.dailyCounts.get(provider) ?? 0;
    return used >= budget * 0.8;
  }
  resetDailyBudgets() {
    this.dailyCounts.clear();
  }
}
export {
  HealthMonitor
};
