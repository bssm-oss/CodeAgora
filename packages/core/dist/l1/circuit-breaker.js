class CircuitOpenError extends Error {
  provider;
  model;
  constructor(provider, model) {
    super(`Circuit open for ${provider}/${model} \u2014 skipping backend call`);
    this.name = "CircuitOpenError";
    this.provider = provider;
    this.model = model;
  }
}
const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 3e4;
const DEFAULT_MAX_COOLDOWN_MS = 3e5;
class CircuitBreaker {
  failureThreshold;
  initialCooldownMs;
  maxCooldownMs;
  nowFn;
  circuits = /* @__PURE__ */ new Map();
  constructor(options) {
    this.failureThreshold = options?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.initialCooldownMs = options?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.maxCooldownMs = options?.maxCooldownMs ?? DEFAULT_MAX_COOLDOWN_MS;
    this.nowFn = options?.nowFn ?? (() => Date.now());
  }
  key(provider, model) {
    return `${provider}/${model}`;
  }
  getOrCreate(provider, model) {
    const k = this.key(provider, model);
    let entry = this.circuits.get(k);
    if (!entry) {
      entry = {
        state: "closed",
        failCount: 0,
        lastFailure: null,
        cooldownMs: this.initialCooldownMs
      };
      this.circuits.set(k, entry);
    }
    return entry;
  }
  /**
   * Evaluate state transitions driven by elapsed time.
   * open → half-open when cooldown has elapsed.
   */
  evaluate(entry) {
    if (entry.state === "open") {
      const elapsed = this.nowFn() - (entry.lastFailure ?? 0);
      if (elapsed >= entry.cooldownMs) {
        entry.state = "half-open";
      }
    }
  }
  getState(provider, model) {
    const entry = this.getOrCreate(provider, model);
    this.evaluate(entry);
    return entry.state;
  }
  isOpen(provider, model) {
    return this.getState(provider, model) === "open";
  }
  /**
   * Get full internal state for a circuit (for monitoring/debugging).
   */
  getFullState(provider, model) {
    const entry = this.getOrCreate(provider, model);
    this.evaluate(entry);
    return { ...entry };
  }
  recordSuccess(provider, model) {
    const entry = this.getOrCreate(provider, model);
    this.evaluate(entry);
    if (entry.state === "half-open") {
      entry.state = "closed";
      entry.failCount = 0;
      entry.lastFailure = null;
      entry.cooldownMs = this.initialCooldownMs;
    } else {
      entry.failCount = 0;
    }
  }
  recordFailure(provider, model) {
    const entry = this.getOrCreate(provider, model);
    this.evaluate(entry);
    const now = this.nowFn();
    entry.lastFailure = now;
    if (entry.state === "half-open") {
      entry.state = "open";
      entry.cooldownMs = Math.min(entry.cooldownMs * 2, this.maxCooldownMs);
      entry.failCount++;
    } else {
      entry.failCount++;
      if (entry.failCount >= this.failureThreshold) {
        entry.state = "open";
      }
    }
  }
  clear() {
    this.circuits.clear();
  }
}
export {
  CircuitBreaker,
  CircuitOpenError
};
