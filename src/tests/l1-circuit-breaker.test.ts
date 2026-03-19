/**
 * L1 Circuit Breaker Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from '@codeagora/core/l1/circuit-breaker.js';
import type { CircuitState } from '@codeagora/core/l1/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let currentTime: number;
  let cb: CircuitBreaker;

  beforeEach(() => {
    currentTime = 1_000_000;
    cb = new CircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 30_000,
      maxCooldownMs: 300_000,
      nowFn: () => currentTime,
    });
  });

  // 1. Normal call — circuit closed
  it('should start in closed state', () => {
    expect(cb.getState('groq', 'model-a')).toBe<CircuitState>('closed');
    expect(cb.isOpen('groq', 'model-a')).toBe(false);
  });

  // 2. failureThreshold consecutive failures → circuit open
  it('should open after failureThreshold consecutive failures', () => {
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');
    expect(cb.getState('groq', 'model-a')).toBe<CircuitState>('closed');

    cb.recordFailure('groq', 'model-a');
    expect(cb.getState('groq', 'model-a')).toBe<CircuitState>('open');
  });

  // 3. isOpen() === true when circuit is open
  it('should return isOpen true when circuit is open', () => {
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');

    expect(cb.isOpen('groq', 'model-a')).toBe(true);
  });

  // 4. cooldown elapsed → half-open
  it('should transition to half-open after cooldown elapses', () => {
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');
    expect(cb.isOpen('groq', 'model-a')).toBe(true);

    currentTime += 30_001;
    expect(cb.getState('groq', 'model-a')).toBe<CircuitState>('half-open');
    expect(cb.isOpen('groq', 'model-a')).toBe(false);
  });

  // 5. half-open success → closed
  it('should close circuit on success from half-open state', () => {
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');

    currentTime += 30_001;
    cb.getState('groq', 'model-a'); // trigger transition

    cb.recordSuccess('groq', 'model-a');
    expect(cb.getState('groq', 'model-a')).toBe<CircuitState>('closed');
    expect(cb.isOpen('groq', 'model-a')).toBe(false);
  });

  // 6. half-open failure → open again, cooldown doubled
  it('should re-open and double cooldown on failure from half-open state', () => {
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');

    currentTime += 30_001;
    cb.getState('groq', 'model-a'); // trigger half-open

    cb.recordFailure('groq', 'model-a');
    expect(cb.getState('groq', 'model-a')).toBe<CircuitState>('open');

    // Cooldown should be 60_000 (doubled from 30_000)
    // Still in cooldown — should still be open
    currentTime += 30_001;
    expect(cb.getState('groq', 'model-a')).toBe<CircuitState>('open');
    expect(cb.isOpen('groq', 'model-a')).toBe(true);

    // Past doubled cooldown → half-open again
    currentTime += 30_000;
    expect(cb.getState('groq', 'model-a')).toBe<CircuitState>('half-open');
  });

  // 7. maxCooldown cap
  it('should not exceed maxCooldownMs with exponential backoff', () => {
    // Repeatedly fail to escalate cooldown past max
    for (let i = 0; i < 12; i++) {
      // Open circuit
      cb.recordFailure('groq', 'model-a');
      cb.recordFailure('groq', 'model-a');
      cb.recordFailure('groq', 'model-a');
      // Advance well past any cooldown
      currentTime += 400_000;
      cb.getState('groq', 'model-a'); // trigger half-open
      cb.recordFailure('groq', 'model-a'); // back to open, cooldown doubles
    }

    // Circuit is open; advance just past maxCooldownMs to confirm cap
    currentTime += 300_001;
    expect(cb.getState('groq', 'model-a')).toBe<CircuitState>('half-open');
  });

  // 8. provider+model combinations are independent
  it('should track circuits independently per provider+model combination', () => {
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');

    expect(cb.isOpen('groq', 'model-a')).toBe(true);
    expect(cb.isOpen('groq', 'model-b')).toBe(false);
    expect(cb.isOpen('openrouter', 'model-a')).toBe(false);
    expect(cb.getState('groq', 'model-b')).toBe<CircuitState>('closed');
  });

  // 9. clear() resets all circuits
  it('should reset all circuits after clear()', () => {
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('openrouter', 'model-b');
    cb.recordFailure('openrouter', 'model-b');
    cb.recordFailure('openrouter', 'model-b');

    expect(cb.isOpen('groq', 'model-a')).toBe(true);
    expect(cb.isOpen('openrouter', 'model-b')).toBe(true);

    cb.clear();

    expect(cb.getState('groq', 'model-a')).toBe<CircuitState>('closed');
    expect(cb.getState('openrouter', 'model-b')).toBe<CircuitState>('closed');
    expect(cb.isOpen('groq', 'model-a')).toBe(false);
  });

  // 10. success resets failure count (no open if success breaks streak)
  it('should reset failure count on success before threshold', () => {
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');
    cb.recordSuccess('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');
    cb.recordFailure('groq', 'model-a');

    // Only 2 failures since last success, threshold is 3
    expect(cb.getState('groq', 'model-a')).toBe<CircuitState>('closed');
  });

  // 11. CircuitOpenError is exported and identifiable
  it('should export CircuitOpenError as a named class', () => {
    const err = new CircuitOpenError('groq', 'model-a');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CircuitOpenError);
    expect(err.provider).toBe('groq');
    expect(err.model).toBe('model-a');
    expect(err.message).toContain('groq');
    expect(err.message).toContain('model-a');
  });

  // Default options
  it('should use default options when constructed without arguments', () => {
    const defaultCb = new CircuitBreaker();
    expect(defaultCb.getState('groq', 'model-x')).toBe<CircuitState>('closed');
    // Default failureThreshold is 3
    defaultCb.recordFailure('groq', 'model-x');
    defaultCb.recordFailure('groq', 'model-x');
    expect(defaultCb.getState('groq', 'model-x')).toBe<CircuitState>('closed');
    defaultCb.recordFailure('groq', 'model-x');
    expect(defaultCb.getState('groq', 'model-x')).toBe<CircuitState>('open');
  });
});
