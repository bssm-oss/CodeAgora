/**
 * L1 Circuit Breaker
 * Lightweight per-(provider, model) circuit breaker with exponential backoff cooldown.
 */

// ============================================================================
// Types
// ============================================================================

export type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitEntry {
  state: CircuitState;
  failCount: number;
  lastFailure: number | null;
  cooldownMs: number;
}

// ============================================================================
// CircuitOpenError
// ============================================================================

export class CircuitOpenError extends Error {
  readonly provider: string;
  readonly model: string;

  constructor(provider: string, model: string) {
    super(`Circuit open for ${provider}/${model} — skipping backend call`);
    this.name = 'CircuitOpenError';
    this.provider = provider;
    this.model = model;
  }
}

// ============================================================================
// CircuitBreaker
// ============================================================================

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_MAX_COOLDOWN_MS = 300_000;

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly initialCooldownMs: number;
  private readonly maxCooldownMs: number;
  private readonly nowFn: () => number;
  private readonly circuits = new Map<string, CircuitEntry>();

  constructor(options?: {
    failureThreshold?: number;
    cooldownMs?: number;
    maxCooldownMs?: number;
    nowFn?: () => number;
  }) {
    this.failureThreshold = options?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.initialCooldownMs = options?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.maxCooldownMs = options?.maxCooldownMs ?? DEFAULT_MAX_COOLDOWN_MS;
    this.nowFn = options?.nowFn ?? (() => Date.now());
  }

  private key(provider: string, model: string): string {
    return `${provider}/${model}`;
  }

  private getOrCreate(provider: string, model: string): CircuitEntry {
    const k = this.key(provider, model);
    let entry = this.circuits.get(k);
    if (!entry) {
      entry = {
        state: 'closed',
        failCount: 0,
        lastFailure: null,
        cooldownMs: this.initialCooldownMs,
      };
      this.circuits.set(k, entry);
    }
    return entry;
  }

  /**
   * Evaluate state transitions driven by elapsed time.
   * open → half-open when cooldown has elapsed.
   */
  private evaluate(entry: CircuitEntry): void {
    if (entry.state === 'open') {
      const elapsed = this.nowFn() - (entry.lastFailure ?? 0);
      if (elapsed >= entry.cooldownMs) {
        entry.state = 'half-open';
      }
    }
  }

  getState(provider: string, model: string): CircuitState {
    const entry = this.getOrCreate(provider, model);
    this.evaluate(entry);
    return entry.state;
  }

  isOpen(provider: string, model: string): boolean {
    return this.getState(provider, model) === 'open';
  }

  /**
   * Get full internal state for a circuit (for monitoring/debugging).
   */
  getFullState(provider: string, model: string): {
    state: CircuitState;
    failCount: number;
    lastFailure: number | null;
    cooldownMs: number;
  } {
    const entry = this.getOrCreate(provider, model);
    this.evaluate(entry);
    return { ...entry };
  }

  recordSuccess(provider: string, model: string): void {
    const entry = this.getOrCreate(provider, model);
    this.evaluate(entry);

    if (entry.state === 'half-open') {
      // Restore fully closed state, reset cooldown to initial value
      entry.state = 'closed';
      entry.failCount = 0;
      entry.lastFailure = null;
      entry.cooldownMs = this.initialCooldownMs;
    } else {
      // Closed: reset failure streak
      entry.failCount = 0;
    }
  }

  recordFailure(provider: string, model: string): void {
    const entry = this.getOrCreate(provider, model);
    this.evaluate(entry);

    const now = this.nowFn();
    entry.lastFailure = now;

    if (entry.state === 'half-open') {
      // Half-open failure → reopen with doubled cooldown (capped)
      entry.state = 'open';
      entry.cooldownMs = Math.min(entry.cooldownMs * 2, this.maxCooldownMs);
      entry.failCount++;
    } else {
      // Closed: accumulate failures
      entry.failCount++;
      if (entry.failCount >= this.failureThreshold) {
        entry.state = 'open';
      }
    }
  }

  clear(): void {
    this.circuits.clear();
  }
}
