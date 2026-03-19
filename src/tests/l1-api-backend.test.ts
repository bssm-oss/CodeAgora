/**
 * API Backend Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeViaAISDK } from '@codeagora/core/l1/api-backend.js';

// Mock the provider registry
vi.mock('../../packages/core/src/l1/provider-registry.js', () => ({
  getModel: vi.fn(),
}));

// Mock the ai package
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { getModel } from '@codeagora/core/l1/provider-registry.js';
import { generateText } from 'ai';

const mockGetModel = vi.mocked(getModel);
const mockGenerateText = vi.mocked(generateText);

describe('API Backend (executeViaAISDK)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call generateText with correct parameters', async () => {
    const fakeModel = { modelId: 'test-model' };
    mockGetModel.mockReturnValue(fakeModel as any);
    mockGenerateText.mockResolvedValue({ text: 'review output' } as any);

    const result = await executeViaAISDK({
      backend: 'api',
      model: 'deepseek-r1',
      provider: 'groq',
      prompt: 'Review this code',
      timeout: 120,
    });

    expect(mockGetModel).toHaveBeenCalledWith('groq', 'deepseek-r1');
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: fakeModel,
        prompt: 'Review this code',
      })
    );
    expect(result).toBe('review output');
  });

  it('should set abort signal with correct timeout', async () => {
    const fakeModel = { modelId: 'test-model' };
    mockGetModel.mockReturnValue(fakeModel as any);
    mockGenerateText.mockResolvedValue({ text: 'ok' } as any);

    await executeViaAISDK({
      backend: 'api',
      model: 'model',
      provider: 'groq',
      prompt: 'test',
      timeout: 60,
    });

    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.abortSignal).toBeDefined();
  });

  it('should throw when provider is missing', async () => {
    await expect(
      executeViaAISDK({
        backend: 'api',
        model: 'model',
        provider: undefined,
        prompt: 'test',
        timeout: 60,
      })
    ).rejects.toThrow('API backend requires provider parameter');
  });

  it('should propagate generateText errors', async () => {
    const fakeModel = { modelId: 'test-model' };
    mockGetModel.mockReturnValue(fakeModel as any);
    mockGenerateText.mockRejectedValue(new Error('Rate limit exceeded'));

    await expect(
      executeViaAISDK({
        backend: 'api',
        model: 'model',
        provider: 'groq',
        prompt: 'test',
        timeout: 60,
      })
    ).rejects.toThrow('Rate limit exceeded');
  });

  it('should propagate provider registry errors', async () => {
    mockGetModel.mockImplementation(() => {
      throw new Error('API key not found. Set GROQ_API_KEY environment variable.');
    });

    await expect(
      executeViaAISDK({
        backend: 'api',
        model: 'model',
        provider: 'groq',
        prompt: 'test',
        timeout: 60,
      })
    ).rejects.toThrow('API key not found');
  });
});
