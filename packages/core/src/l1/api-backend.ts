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
  const { model, provider, prompt, systemPrompt, userPrompt, timeout, signal, temperature } = input;

  if (!provider) {
    throw new Error('API backend requires provider parameter');
  }

  const languageModel = getModel(provider, model);

  // Prefer the caller-supplied signal (from AbortController in executeReviewer).
  // Fall back to a local timeout signal when none is provided.
  const abortSignal = signal ?? AbortSignal.timeout(timeout * 1000);

  const { text } = await generateText({
    model: languageModel,
    // Use split system/user messages when available (better instruction following +
    // prompt injection defense). Fall back to combined prompt for callers that only
    // provide a single string (e.g. custom prompt paths, CLI passthrough).
    ...(systemPrompt !== undefined
      ? { system: systemPrompt, prompt: userPrompt ?? prompt }
      : { prompt }),
    abortSignal,
    ...(temperature !== undefined && { temperature }),
    maxRetries: 0, // Disable AI SDK internal retries — app-level retry in reviewer.ts
  });

  return text;
}
