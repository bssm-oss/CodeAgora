/**
 * Mock LLM Backend Infrastructure Tests
 * Phase 0: Foundation for all integration tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MockLLMBackend,
  createMockReviewResponse,
  createMockDebateResponse,
  createMockBackend,
} from './helpers/mock-backend.js';
import type { BackendInput } from '@codeagora/core/l1/backend.js';

// ============================================================================
// Helpers
// ============================================================================

function makeInput(overrides?: Partial<BackendInput>): BackendInput {
  return {
    backend: 'api',
    model: 'test-model',
    provider: 'groq',
    prompt: 'Review this code',
    timeout: 120,
    ...overrides,
  };
}

// ============================================================================
// MockLLMBackend Tests
// ============================================================================

describe('MockLLMBackend', () => {
  let mock: MockLLMBackend;

  beforeEach(() => {
    mock = new MockLLMBackend();
  });

  // --------------------------------------------------------------------------
  // Pattern matching
  // --------------------------------------------------------------------------

  describe('register(pattern, response)', () => {
    it('should return string response when prompt matches string pattern', async () => {
      mock.register('Review this', 'Found 2 issues');

      const result = await mock.execute(makeInput({ prompt: 'Review this code please' }));
      expect(result).toBe('Found 2 issues');
    });

    it('should return string response when prompt matches regex pattern', async () => {
      mock.register(/code\s+review/i, 'LGTM');

      const result = await mock.execute(makeInput({ prompt: 'Please do a Code Review' }));
      expect(result).toBe('LGTM');
    });

    it('should return factory response when given a function', async () => {
      let callNum = 0;
      mock.register('test', () => `response-${++callNum}`);

      const r1 = await mock.execute(makeInput({ prompt: 'test 1' }));
      const r2 = await mock.execute(makeInput({ prompt: 'test 2' }));

      expect(r1).toBe('response-1');
      expect(r2).toBe('response-2');
    });

    it('should use last matching registration (last wins)', async () => {
      mock.register('test', 'first');
      mock.register('test', 'second');

      const result = await mock.execute(makeInput({ prompt: 'test' }));
      expect(result).toBe('second');
    });

    it('should return default response when no pattern matches', async () => {
      mock.register('specific', 'matched');

      const result = await mock.execute(makeInput({ prompt: 'unrelated prompt' }));
      expect(result).toBe('Mock response');
    });

    it('should use custom default response', async () => {
      mock.setDefaultResponse('custom default');

      const result = await mock.execute(makeInput({ prompt: 'anything' }));
      expect(result).toBe('custom default');
    });
  });

  // --------------------------------------------------------------------------
  // Error simulation
  // --------------------------------------------------------------------------

  describe('registerError(pattern, error)', () => {
    it('should throw registered error when prompt matches', async () => {
      mock.registerError('fail', new Error('Rate limit exceeded'));

      await expect(
        mock.execute(makeInput({ prompt: 'this should fail' }))
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should not throw for non-matching prompts', async () => {
      mock.registerError('fail', new Error('boom'));

      const result = await mock.execute(makeInput({ prompt: 'success path' }));
      expect(result).toBe('Mock response');
    });
  });

  // --------------------------------------------------------------------------
  // Delay simulation
  // --------------------------------------------------------------------------

  describe('registerDelay(pattern, delayMs, response)', () => {
    it('should delay then return response', async () => {
      vi.useFakeTimers();
      mock.registerDelay('slow', 50, 'delayed response');

      const promise = mock.execute(makeInput({ prompt: 'slow request' }));
      await vi.advanceTimersByTimeAsync(50);
      const result = await promise;

      expect(result).toBe('delayed response');
      vi.useRealTimers();
    });
  });

  // --------------------------------------------------------------------------
  // Call tracking
  // --------------------------------------------------------------------------

  describe('callCount / getCallLog', () => {
    it('should track total call count', async () => {
      expect(mock.callCount()).toBe(0);

      await mock.execute(makeInput({ prompt: 'call 1' }));
      await mock.execute(makeInput({ prompt: 'call 2' }));
      await mock.execute(makeInput({ prompt: 'call 3' }));

      expect(mock.callCount()).toBe(3);
    });

    it('should filter call count by string pattern', async () => {
      await mock.execute(makeInput({ prompt: 'review auth' }));
      await mock.execute(makeInput({ prompt: 'review payment' }));
      await mock.execute(makeInput({ prompt: 'test something' }));

      expect(mock.callCount('review')).toBe(2);
      expect(mock.callCount('test')).toBe(1);
    });

    it('should filter call count by regex pattern', async () => {
      await mock.execute(makeInput({ prompt: 'review auth.ts' }));
      await mock.execute(makeInput({ prompt: 'review utils.ts' }));
      await mock.execute(makeInput({ prompt: 'check auth.ts' }));

      expect(mock.callCount(/auth\.ts/)).toBe(2);
    });

    it('should return full call log with timestamps', async () => {
      const input = makeInput({ prompt: 'logged call' });
      await mock.execute(input);

      const log = mock.getCallLog();
      expect(log).toHaveLength(1);
      expect(log[0].input.prompt).toBe('logged call');
      expect(log[0].timestamp).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  describe('reset()', () => {
    it('should clear registrations, call log, and default response', async () => {
      mock.register('test', 'response');
      mock.setDefaultResponse('custom');
      await mock.execute(makeInput({ prompt: 'test' }));

      mock.reset();

      expect(mock.callCount()).toBe(0);
      const result = await mock.execute(makeInput({ prompt: 'test' }));
      expect(result).toBe('Mock response'); // Back to original default
    });
  });

  // --------------------------------------------------------------------------
  // Multi-reviewer scenarios
  // --------------------------------------------------------------------------

  describe('multi-reviewer scenarios', () => {
    it('should return different responses for different reviewers', async () => {
      mock.register('auth review', createMockReviewResponse({ severity: 'CRITICAL' }));
      mock.register('perf review', createMockReviewResponse({ severity: 'WARNING', issueTitle: 'N+1 Query' }));

      const r1 = await mock.execute(makeInput({ prompt: 'auth review task', model: 'r1' }));
      const r2 = await mock.execute(makeInput({ prompt: 'perf review task', model: 'r2' }));

      expect(r1).toContain('CRITICAL');
      expect(r2).toContain('WARNING');
      expect(r2).toContain('N+1 Query');
    });

    it('should handle mixed success/failure across reviewers', async () => {
      mock.register('reviewer-a', 'success response');
      mock.registerError('reviewer-b', new Error('timeout'));

      const resultA = await mock.execute(makeInput({ prompt: 'reviewer-a prompt' }));
      expect(resultA).toBe('success response');

      await expect(
        mock.execute(makeInput({ prompt: 'reviewer-b prompt' }))
      ).rejects.toThrow('timeout');
    });
  });

  // --------------------------------------------------------------------------
  // Timeout simulation (AbortSignal)
  // --------------------------------------------------------------------------

  describe('timeout simulation', () => {
    it('should simulate delay longer than typical timeout', async () => {
      vi.useFakeTimers();
      mock.registerDelay('slow-model', 100, 'too late');

      const promise = mock.execute(makeInput({ prompt: 'slow-model call' }));
      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result).toBe('too late');
      vi.useRealTimers();
    });
  });
});

// ============================================================================
// Factory Helper Tests
// ============================================================================

describe('createMockReviewResponse', () => {
  it('should create valid review format with defaults', () => {
    const response = createMockReviewResponse();

    expect(response).toContain('## Issue: SQL Injection Risk');
    expect(response).toContain('### 문제');
    expect(response).toContain('In auth.ts:10-15');
    expect(response).toContain('### 심각도');
    expect(response).toContain('CRITICAL');
    expect(response).toContain('### 근거');
    expect(response).toContain('### 제안');
  });

  it('should accept overrides', () => {
    const response = createMockReviewResponse({
      issueTitle: 'Memory Leak',
      severity: 'WARNING',
      filePath: 'server.ts',
      lineRange: '42-50',
    });

    expect(response).toContain('## Issue: Memory Leak');
    expect(response).toContain('In server.ts:42-50');
    expect(response).toContain('WARNING');
  });
});

describe('createMockDebateResponse', () => {
  it('should create agree response', () => {
    const response = createMockDebateResponse('agree');
    expect(response.toLowerCase()).toContain('agree');
    expect(response.toLowerCase()).not.toContain('disagree');
  });

  it('should create disagree response', () => {
    const response = createMockDebateResponse('disagree');
    expect(response.toLowerCase()).toContain('disagree');
  });

  it('should create neutral response', () => {
    const response = createMockDebateResponse('neutral');
    expect(response.toLowerCase()).toContain('neutral');
  });
});

// ============================================================================
// createMockBackend helper
// ============================================================================

describe('createMockBackend', () => {
  it('should return mock instance and execute function', async () => {
    const { mock, executeFn } = createMockBackend();

    mock.register('hello', 'world');
    const result = await executeFn(makeInput({ prompt: 'hello there' }));

    expect(result).toBe('world');
    expect(mock.callCount()).toBe(1);
  });

  it('should work as drop-in replacement for executeBackend', async () => {
    const { mock, executeFn } = createMockBackend();
    mock.setDefaultResponse(createMockReviewResponse());

    const result = await executeFn(makeInput());
    expect(result).toContain('## Issue:');
  });
});
