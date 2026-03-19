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
  const { model, provider, prompt, timeout, signal } = input;

  if (!provider) {
    throw new Error('API backend requires provider parameter');
  }

  const languageModel = getModel(provider, model);

  // Prefer the caller-supplied signal (from AbortController in executeReviewer).
  // Fall back to a local timeout signal when none is provided.
  const abortSignal = signal ?? AbortSignal.timeout(timeout * 1000);

  const { text } = await generateText({
    model: languageModel,
    prompt,
    abortSignal,
  });

  return text;
}
