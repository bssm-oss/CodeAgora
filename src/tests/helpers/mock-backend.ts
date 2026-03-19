/**
 * Mock LLM Backend Infrastructure
 * Provides deterministic, pattern-based mock for executeBackend.
 * All integration tests depend on this helper.
 */

import { vi } from 'vitest';
import type { BackendInput } from '@codeagora/core/l1/backend.js';

// ============================================================================
// Types
// ============================================================================

interface MockRegistration {
  pattern: string | RegExp;
  handler: MockHandler;
}

type MockHandler =
  | { type: 'response'; value: string | (() => string) }
  | { type: 'error'; error: Error }
  | { type: 'delay'; delayMs: number; value: string };

interface CallLogEntry {
  input: BackendInput;
  timestamp: number;
}

// ============================================================================
// MockLLMBackend
// ============================================================================

export class MockLLMBackend {
  private registrations: MockRegistration[] = [];
  private callLog: CallLogEntry[] = [];
  private defaultResponse = 'Mock response';

  /**
   * Register a pattern → response mapping.
   * Pattern matches against the prompt string.
   */
  register(pattern: string | RegExp, response: string | (() => string)): void {
    this.registrations.push({
      pattern,
      handler: { type: 'response', value: response },
    });
  }

  /**
   * Register a pattern → error mapping.
   */
  registerError(pattern: string | RegExp, error: Error): void {
    this.registrations.push({
      pattern,
      handler: { type: 'error', error },
    });
  }

  /**
   * Register a pattern → delayed response mapping.
   */
  registerDelay(pattern: string | RegExp, delayMs: number, response: string): void {
    this.registrations.push({
      pattern,
      handler: { type: 'delay', delayMs, value: response },
    });
  }

  /**
   * Set default response when no pattern matches.
   */
  setDefaultResponse(response: string): void {
    this.defaultResponse = response;
  }

  /**
   * Execute mock backend — matches patterns in registration order (last wins).
   * Compatible with BackendInput signature.
   */
  async execute(input: BackendInput): Promise<string> {
    this.callLog.push({ input, timestamp: Date.now() });

    // Match in reverse order (last registered wins)
    for (let i = this.registrations.length - 1; i >= 0; i--) {
      const reg = this.registrations[i];
      if (this.matches(input.prompt, reg.pattern)) {
        return this.handleRegistration(reg.handler, input);
      }
    }

    return this.defaultResponse;
  }

  /**
   * Get total call count, or filtered by pattern.
   */
  callCount(pattern?: string | RegExp): number {
    if (!pattern) return this.callLog.length;
    return this.callLog.filter((entry) => this.matches(entry.input.prompt, pattern)).length;
  }

  /**
   * Get full call log.
   */
  getCallLog(): CallLogEntry[] {
    return [...this.callLog];
  }

  /**
   * Get calls filtered by reviewer ID.
   */
  getCallsForReviewer(reviewerId: string): CallLogEntry[] {
    return this.callLog.filter(
      (entry) => entry.input.model === reviewerId || entry.input.provider === reviewerId
    );
  }

  /**
   * Reset all registrations and call log.
   */
  reset(): void {
    this.registrations = [];
    this.callLog = [];
    this.defaultResponse = 'Mock response';
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private matches(prompt: string, pattern: string | RegExp): boolean {
    if (typeof pattern === 'string') {
      return prompt.includes(pattern);
    }
    return pattern.test(prompt);
  }

  private async handleRegistration(handler: MockHandler, input: BackendInput): Promise<string> {
    switch (handler.type) {
      case 'response':
        return typeof handler.value === 'function' ? handler.value() : handler.value;
      case 'error':
        throw handler.error;
      case 'delay': {
        // Check if AbortSignal is already aborted
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, handler.delayMs);
          // If caller passes an abort signal in the future, we can handle it
          // For now, just delay
          if ((input as any).signal?.aborted) {
            clearTimeout(timer);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          }
        });
        return handler.value;
      }
    }
  }
}

// ============================================================================
// Factory Helpers
// ============================================================================

/**
 * Create a valid reviewer response text for testing.
 */
export function createMockReviewResponse(overrides?: {
  issueTitle?: string;
  severity?: string;
  filePath?: string;
  lineRange?: string;
}): string {
  const {
    issueTitle = 'SQL Injection Risk',
    severity = 'CRITICAL',
    filePath = 'auth.ts',
    lineRange = '10-15',
  } = overrides ?? {};

  return `## Issue: ${issueTitle}

### 문제
In ${filePath}:${lineRange}

User input is directly concatenated into SQL query.

### 근거
1. Username parameter is unsanitized
2. String concatenation used instead of parameterized queries
3. No input validation

### 심각도
${severity}

### 제안
Use parameterized queries: db.query('SELECT * FROM users WHERE username = ?', [username])
`;
}

/**
 * Create a mock debate/supporter response.
 */
export function createMockDebateResponse(
  stance: 'agree' | 'disagree' | 'neutral'
): string {
  switch (stance) {
    case 'agree':
      return 'I AGREE with the reviewer. The evidence clearly shows a vulnerability that needs to be addressed. The SQL injection risk is real and well-documented.';
    case 'disagree':
      return 'I DISAGREE with this finding. The code uses an ORM layer that handles parameterization internally. The apparent string concatenation is actually a template for the query builder.';
    case 'neutral':
      return 'I am NEUTRAL on this issue. While the concern is valid, I need more context about the ORM layer being used. Additional information is needed to determine the actual risk.';
  }
}

/**
 * Install MockLLMBackend onto an already-mocked executeBackend.
 * Caller must have vi.mock('../../packages/core/src/l1/backend.js') at module level first,
 * then pass the mocked function here.
 */
export function installMockBackend(
  mockedExecuteBackend: ReturnType<typeof vi.fn>
): MockLLMBackend {
  const mock = new MockLLMBackend();
  mockedExecuteBackend.mockImplementation((input: BackendInput) => mock.execute(input));
  return mock;
}

/**
 * Create a mock backend and return both the instance and the mock function.
 * Use this when you need explicit control without vi.mock.
 */
export function createMockBackend(): {
  mock: MockLLMBackend;
  executeFn: (input: BackendInput) => Promise<string>;
} {
  const mock = new MockLLMBackend();
  return {
    mock,
    executeFn: (input: BackendInput) => mock.execute(input),
  };
}
