/**
 * Provider Status Utilities
 * Check API key availability and run health checks for TUI components.
 */

import { PROVIDER_ENV_VARS, getProviderEnvVar } from '@codeagora/shared/providers/env-vars.js';

// ============================================================================
// API Key Status
// ============================================================================

export interface ProviderStatus {
  provider: string;
  envVar: string;
  hasKey: boolean;
}

/**
 * Get status of all known providers.
 */
export function getAllProviderStatuses(): ProviderStatus[] {
  return Object.keys(PROVIDER_ENV_VARS).map(provider => ({
    provider,
    envVar: getProviderEnvVar(provider),
    hasKey: Boolean(process.env[getProviderEnvVar(provider)]),
  }));
}

/**
 * Check if a specific provider has an API key configured.
 */
export function isProviderAvailable(provider: string): boolean {
  const envVar = getProviderEnvVar(provider);
  return Boolean(process.env[envVar]);
}

/**
 * Get count of active (key-set) providers.
 */
export function getActiveProviderCount(): { active: number; total: number } {
  const all = getAllProviderStatuses();
  return {
    active: all.filter(s => s.hasKey).length,
    total: all.length,
  };
}

/**
 * Check which providers from a list are missing API keys.
 */
export function getMissingProviders(providers: string[]): string[] {
  return providers.filter(p => !isProviderAvailable(p));
}

// ============================================================================
// Health Check
// ============================================================================

export interface HealthCheckResult {
  provider: string;
  model: string;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
}

const TEST_MODELS: Record<string, string> = {
  groq: 'llama-3.3-70b-versatile',
  'nvidia-nim': 'deepseek-r1',
  openrouter: 'google/gemini-2.5-flash',
  google: 'gemini-2.0-flash',
  mistral: 'mistral-large-latest',
  cerebras: 'llama-3.3-70b',
  together: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  xai: 'grok-2',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
  deepseek: 'deepseek-chat',
  qwen: 'qwen-turbo',
  zai: 'zai-default',
  'github-models': 'gpt-4o-mini',
  'github-copilot': 'gpt-4o',
};

/**
 * Run a health check for a single provider.
 */
export async function checkProviderHealth(provider: string): Promise<HealthCheckResult> {
  const model = TEST_MODELS[provider] ?? 'llama-3.3-70b-versatile';
  const start = Date.now();
  try {
    const { getModel } = await import('@codeagora/core/l1/provider-registry.js');
    const { generateText } = await import('ai');
    const languageModel = getModel(provider, model);
    const abortSignal = AbortSignal.timeout(10_000);
    await generateText({ model: languageModel, prompt: 'Say OK', abortSignal });
    return { provider, model, ok: true, latencyMs: Date.now() - start, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { provider, model, ok: false, latencyMs: null, error: msg.slice(0, 100) };
  }
}

/**
 * Run health checks for all providers with API keys set.
 */
export async function checkAllProviderHealth(
  onProgress?: (result: HealthCheckResult, done: number, total: number) => void
): Promise<HealthCheckResult[]> {
  const available = getAllProviderStatuses().filter(s => s.hasKey);
  const results: HealthCheckResult[] = [];
  let done = 0;

  // Run 3 at a time to avoid rate limits
  for (let i = 0; i < available.length; i += 3) {
    const batch = available.slice(i, i + 3);
    const batchResults = await Promise.allSettled(
      batch.map(s => checkProviderHealth(s.provider))
    );
    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j]!;
      const providerName = batch[j]?.provider ?? 'unknown';
      const result = r.status === 'fulfilled'
        ? r.value
        : { provider: providerName, model: '', ok: false, latencyMs: null, error: 'Check failed' };
      results.push(result);
      done++;
      onProgress?.(result, done, available.length);
    }
  }

  return results;
}
