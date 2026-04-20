/**
 * Prompt Tier Resolver (#464)
 *
 * Maps an L0 model-registry tier onto a prompt verbosity tier so that
 * weaker / unknown models get a compressed prompt (~50% fewer tokens)
 * tuned for instruction-following accuracy over density.
 *
 * Explicit `config.promptTier` setting overrides auto-detection.
 *
 * Rules:
 *   - config.promptTier explicit                    → use as-is
 *   - provider undefined (CLI backend)              → 'standard'
 *   - L0 registry metadata unavailable (unknown)    → 'lite' (safe default)
 *   - L0 tier ∈ {S+, S, A+, A, A-}                   → 'standard'
 *   - L0 tier ∈ {B+, B, C}                           → 'lite'
 *   - L0 tier absent (in registry but not rated)    → 'lite'
 */

import type { AgentConfig } from '../types/config.js';
import type { ModelMetadata } from '../types/l0.js';
import { getModel } from '../l0/model-registry.js';

export type PromptTier = 'lite' | 'standard';

const STRONG_TIERS = new Set(['S+', 'S', 'A+', 'A', 'A-']);

/**
 * Resolve the prompt tier to use for a given reviewer config.
 *
 * Side-effect free: reads the already-loaded L0 registry via getModel.
 * When the registry is not initialized (e.g. isolated unit tests) we
 * default to 'standard' to preserve legacy behavior rather than silently
 * switching to the compressed prompt.
 */
export function resolvePromptTier(config: AgentConfig): PromptTier {
  if (config.promptTier) return config.promptTier;
  // CLI backends (claude / codex / gemini / ...) have no provider — we
  // can't look them up in the registry. Assume 'standard' since these are
  // typically local subscriptions to frontier models.
  if (!config.provider) return 'standard';
  let meta: ModelMetadata | undefined;
  try {
    meta = getModel(config.provider, config.model);
  } catch {
    // Registry not initialized (isolated tests / early startup). Preserve
    // legacy behavior — don't surprise callers with lite compression.
    return 'standard';
  }
  if (!meta) return 'lite';      // registry loaded, model not listed → weak/obscure
  if (!meta.tier) return 'lite'; // listed but not tier-rated → be conservative
  return STRONG_TIERS.has(meta.tier) ? 'standard' : 'lite';
}
