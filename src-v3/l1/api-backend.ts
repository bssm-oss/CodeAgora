/**
 * API Backend Executor
 * Vercel AI SDK based direct API call backend.
 */

import { generateText } from 'ai';
import { getModel } from './provider-registry.js';
import type { BackendInput } from './backend.js';

/**
 * Execute a review via direct API call using Vercel AI SDK.
 */
export async function executeViaAISDK(input: BackendInput): Promise<string> {
  const { model, provider, prompt, timeout } = input;

  if (!provider) {
    throw new Error('API backend requires provider parameter');
  }

  const languageModel = getModel(provider, model);
  const timeoutMs = timeout * 1000;

  const { text } = await generateText({
    model: languageModel,
    prompt,
    abortSignal: AbortSignal.timeout(timeoutMs),
  });

  return text;
}
