/**
 * L1 Reviewer Fallback Tests
 *
 * Verifies that executeReviewer falls back to the configured fallback
 * backend+model when the primary backend fails all retries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../packages/core/src/l1/backend.js', () => ({
  executeBackend: vi.fn(),
}));

import { executeReviewer } from '@codeagora/core/l1/reviewer.js';
import { executeBackend } from '@codeagora/core/l1/backend.js';
import type { ReviewerInput } from '@codeagora/core/l1/reviewer.js';
import type { BackendInput } from '@codeagora/core/l1/backend.js';
import { AgentConfigSchema } from '@codeagora/core/types/config.js';

const mockExecuteBackend = vi.mocked(executeBackend);

// ============================================================================
// Helpers
// ============================================================================

const MOCK_RESPONSE = `## Issue: Test Issue

### 문제
In file.ts:1-1

Test problem description.

### 근거
1. Evidence point

### 심각도
WARNING

### 제안
Fix it
`;

function makeInput(
  configOverrides: Partial<ReviewerInput['config']> = {}
): ReviewerInput {
  return {
    config: {
      id: 'reviewer-1',
      backend: 'api',
      model: 'gpt-4o',
      provider: 'openai',
      timeout: 30,
      enabled: true,
      ...configOverrides,
    },
    groupName: 'test-group',
    diffContent: '--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new',
    prSummary: 'Test PR',
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('executeReviewer — fallback mechanism', () => {
  beforeEach(() => {
    mockExecuteBackend.mockReset();
  });

  it('1. primary succeeds — fallback is never called', async () => {
    mockExecuteBackend.mockResolvedValueOnce(MOCK_RESPONSE);

    const result = await executeReviewer(makeInput(), 0);

    expect(result.status).toBe('success');
    expect(mockExecuteBackend).toHaveBeenCalledTimes(1);
  });

  it('2. primary fails with timeout — fallback called and succeeds', async () => {
    const timeoutError = new Error('Backend timeout after 30s');
    mockExecuteBackend
      .mockRejectedValueOnce(timeoutError)   // primary attempt 0
      .mockResolvedValueOnce(MOCK_RESPONSE); // fallback

    const input = makeInput({
      fallback: { model: 'claude-3-haiku', backend: 'claude' },
    });

    const result = await executeReviewer(input, 0);

    expect(result.status).toBe('success');
    expect(mockExecuteBackend).toHaveBeenCalledTimes(2);
  });

  it('3. primary fails with generic error — fallback called and succeeds', async () => {
    const networkError = new Error('network error');
    mockExecuteBackend
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(MOCK_RESPONSE);

    const input = makeInput({
      fallback: { model: 'gemini-pro', backend: 'gemini' },
    });

    const result = await executeReviewer(input, 0);

    expect(result.status).toBe('success');
    expect(result.model).toBe('gemini-pro');
  });

  it('4. primary + fallback both fail — returns forfeit', async () => {
    mockExecuteBackend.mockRejectedValue(new Error('all backends down'));

    const input = makeInput({
      fallback: { model: 'claude-3-haiku', backend: 'claude' },
    });

    const result = await executeReviewer(input, 0);

    expect(result.status).toBe('forfeit');
    expect(result.error).toBeDefined();
    // primary (1 attempt) + fallback (1 attempt) = 2 calls
    expect(mockExecuteBackend).toHaveBeenCalledTimes(2);
  });

  it('5. no fallback configured — existing retry behavior, returns forfeit', async () => {
    mockExecuteBackend.mockRejectedValue(new Error('primary error'));

    // No fallback field
    const input = makeInput();

    const result = await executeReviewer(input, 1); // retries=1 → 2 attempts

    expect(result.status).toBe('forfeit');
    // only primary retries, no fallback
    expect(mockExecuteBackend).toHaveBeenCalledTimes(2);
  });

  it('6. fallback config passes zod validation (valid config)', () => {
    const raw = {
      id: 'r1',
      model: 'gpt-4o',
      backend: 'api',
      provider: 'openai',
      fallback: {
        model: 'claude-3-haiku',
        backend: 'claude',
      },
    };

    expect(() => AgentConfigSchema.parse(raw)).not.toThrow();
    const parsed = AgentConfigSchema.parse(raw);
    expect(parsed.fallback?.model).toBe('claude-3-haiku');
    expect(parsed.fallback?.backend).toBe('claude');
  });

  it('7. config without fallback passes zod validation (optional field)', () => {
    const raw = {
      id: 'r1',
      model: 'gpt-4o',
      backend: 'api',
      provider: 'openai',
    };

    expect(() => AgentConfigSchema.parse(raw)).not.toThrow();
    const parsed = AgentConfigSchema.parse(raw);
    expect(parsed.fallback).toBeUndefined();
  });

  it('8. fallback backend/model/provider are passed exactly to executeBackend', async () => {
    mockExecuteBackend
      .mockRejectedValueOnce(new Error('primary failed'))
      .mockResolvedValueOnce(MOCK_RESPONSE);

    const input = makeInput({
      fallback: {
        model: 'claude-3-5-sonnet',
        backend: 'claude',
        provider: undefined,
      },
    });

    await executeReviewer(input, 0);

    expect(mockExecuteBackend).toHaveBeenCalledTimes(2);
    const fallbackCall = mockExecuteBackend.mock.calls[1][0] as BackendInput;
    expect(fallbackCall.backend).toBe('claude');
    expect(fallbackCall.model).toBe('claude-3-5-sonnet');
    expect(fallbackCall.provider).toBeUndefined();
    expect(fallbackCall.timeout).toBe(30); // inherited from primary config
  });
});
