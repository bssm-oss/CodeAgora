/**
 * L1 API Backend — system/user message split tests (#308)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so the mock fn is available when vi.mock factory is hoisted to top
const { mockGenerateText } = vi.hoisted(() => {
  const mockGenerateText = vi.fn();
  return { mockGenerateText };
});

vi.mock('ai', () => ({
  generateText: mockGenerateText,
}));

vi.mock('../l1/provider-registry.js', () => ({
  getModel: vi.fn(() => 'mock-language-model'),
}));

import { executeViaAISDK } from '../l1/api-backend.js';
import type { BackendInput } from '../l1/backend.js';

function makeInput(overrides: Partial<BackendInput> = {}): BackendInput {
  return {
    backend: 'api',
    model: 'xiaomi/mimo-v2.5',
    provider: 'openrouter',
    prompt: 'combined fallback prompt',
    timeout: 30,
    ...overrides,
  };
}

beforeEach(() => {
  mockGenerateText.mockReset();
  mockGenerateText.mockResolvedValue({ text: 'mock review response' });
});

describe('executeViaAISDK — system/user split', () => {
  it('passes system and prompt separately when systemPrompt and userPrompt are provided', async () => {
    await executeViaAISDK(makeInput({
      systemPrompt: 'You are a reviewer. Instructions here.',
      userPrompt: 'Here is the diff content.',
    }));

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.system).toBe('You are a reviewer. Instructions here.');
    expect(callArgs.prompt).toBe('Here is the diff content.');
    // Must NOT have the combined fallback in prompt when split is available
    expect(callArgs.prompt).not.toBe('combined fallback prompt');
  });

  it('falls back to combined prompt when systemPrompt is not provided', async () => {
    await executeViaAISDK(makeInput({
      prompt: 'full combined prompt text',
      // no systemPrompt/userPrompt
    }));

    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toBe('full combined prompt text');
    expect(callArgs.system).toBeUndefined();
  });

  it('uses input.prompt as prompt when systemPrompt is set but userPrompt is absent', async () => {
    await executeViaAISDK(makeInput({
      systemPrompt: 'Instructions.',
      // userPrompt omitted — should fall back to input.prompt
      prompt: 'fallback user content',
    }));

    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.system).toBe('Instructions.');
    expect(callArgs.prompt).toBe('fallback user content');
  });

  it('passes temperature when provided', async () => {
    await executeViaAISDK(makeInput({
      systemPrompt: 'sys',
      userPrompt: 'usr',
      temperature: 0.7,
    }));

    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.temperature).toBe(0.7);
  });

  it('omits temperature when not provided', async () => {
    await executeViaAISDK(makeInput({
      systemPrompt: 'sys',
      userPrompt: 'usr',
    }));

    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.temperature).toBeUndefined();
  });

  it('defaults maxOutputTokens to 4096 for API calls', async () => {
    await executeViaAISDK(makeInput({
      systemPrompt: 'sys',
      userPrompt: 'usr',
    }));

    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.maxOutputTokens).toBe(4096);
  });

  it('passes explicit maxOutputTokens when provided', async () => {
    await executeViaAISDK(makeInput({
      systemPrompt: 'sys',
      userPrompt: 'usr',
      maxOutputTokens: 2048,
    }));

    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.maxOutputTokens).toBe(2048);
  });

  it('throws when provider is missing', async () => {
    await expect(
      executeViaAISDK(makeInput({ provider: undefined }))
    ).rejects.toThrow('API backend requires provider');
  });

  it('returns the text from generateText', async () => {
    mockGenerateText.mockResolvedValueOnce({ text: 'great review output' });
    const result = await executeViaAISDK(makeInput({
      systemPrompt: 'sys',
      userPrompt: 'usr',
    }));
    expect(result).toBe('great review output');
  });

  it('normalizes AI SDK usage into pipeline token usage', async () => {
    const onUsage = vi.fn();
    mockGenerateText.mockResolvedValueOnce({
      text: 'usage-bearing response',
      usage: {
        inputTokens: 77,
        outputTokens: 23,
        totalTokens: 100,
      },
    });

    await executeViaAISDK(makeInput({ onUsage }));

    expect(onUsage).toHaveBeenCalledWith({
      promptTokens: 77,
      completionTokens: 23,
      totalTokens: 100,
    });
  });
});

describe('executeViaAISDK — CLI backend regression (combined prompt path)', () => {
  it('does not set system when no systemPrompt is supplied (CLI backend compat)', async () => {
    await executeViaAISDK(makeInput({
      prompt: 'full prompt for cli',
    }));

    const callArgs = mockGenerateText.mock.calls[0][0];
    // system must be absent — combined prompt path should not inject a system key
    expect('system' in callArgs).toBe(false);
    expect(callArgs.prompt).toBe('full prompt for cli');
  });
});
