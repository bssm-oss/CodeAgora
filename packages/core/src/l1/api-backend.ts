/**
 * API Backend Executor
 * Vercel AI SDK based direct API call backend.
 */

import { generateText } from 'ai';
import { getModel } from './provider-registry.js';
import type { BackendInput } from './backend.js';
import type { TokenUsage } from '../pipeline/telemetry.js';

type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  raw?: unknown;
};

/**
 * Execute a review via direct API call using Vercel AI SDK.
 */
export async function executeViaAISDK(input: BackendInput): Promise<string> {
  const { model, provider, prompt, systemPrompt, userPrompt, timeout, signal, temperature, maxOutputTokens } = input;

  if (!provider) {
    throw new Error('API backend requires provider parameter');
  }

  const languageModel = getModel(provider, model);

  // Prefer the caller-supplied signal (from AbortController in executeReviewer).
  // Fall back to a local timeout signal when none is provided.
  const abortSignal = signal ?? AbortSignal.timeout(timeout * 1000);

  const result = await generateText({
    model: languageModel,
    // Use split system/user messages when available (better instruction following +
    // prompt injection defense). Fall back to combined prompt for callers that only
    // provide a single string (e.g. custom prompt paths, CLI passthrough).
    ...(systemPrompt !== undefined
      ? { system: systemPrompt, prompt: userPrompt ?? prompt }
      : { prompt }),
    abortSignal,
    ...(temperature !== undefined && { temperature }),
    maxOutputTokens: maxOutputTokens ?? 4096,
    maxRetries: 0, // Disable AI SDK internal retries — app-level retry in reviewer.ts
  });

  const usage = normalizeUsage((result as { usage?: UsageLike }).usage);
  if (usage) input.onUsage?.(usage);

  return result.text;
}

function normalizeUsage(usage: UsageLike | undefined): TokenUsage | undefined {
  if (!usage) return undefined;
  const raw = isRecord(usage.raw) ? usage.raw : undefined;
  const promptTokens = firstNumber(
    usage.inputTokens,
    usage.promptTokens,
    usage.prompt_tokens,
    raw?.inputTokens,
    raw?.input_tokens,
    raw?.promptTokens,
    raw?.prompt_tokens,
  );
  const completionTokens = firstNumber(
    usage.outputTokens,
    usage.completionTokens,
    usage.completion_tokens,
    raw?.outputTokens,
    raw?.output_tokens,
    raw?.completionTokens,
    raw?.completion_tokens,
  );
  const totalTokens = firstNumber(
    usage.totalTokens,
    usage.total_tokens,
    raw?.totalTokens,
    raw?.total_tokens,
  ) ?? (promptTokens !== undefined || completionTokens !== undefined
    ? (promptTokens ?? 0) + (completionTokens ?? 0)
    : undefined);

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    promptTokens: promptTokens ?? 0,
    completionTokens: completionTokens ?? 0,
    totalTokens: totalTokens ?? (promptTokens ?? 0) + (completionTokens ?? 0),
  };
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
