/**
 * Model-specific confidence calibration (#467)
 *
 * Reviewer-emitted confidence values are systematically optimistic — a
 * cheap model reporting "90% confident" empirically corresponds to lower
 * real accuracy than a frontier model with the same self-report. This
 * module maps L0 model-registry tiers onto a conservative multiplier
 * applied to the raw confidence before downstream penalty stages.
 *
 * Resolution priority:
 *   1. `config.calibrationMultiplier` (explicit, per-reviewer)
 *   2. Tier-based auto-mapping (requires L0 registry loaded)
 *   3. 1.0 (no adjustment — BC fallback)
 *
 * Tier → multiplier baseline (manual, will be refined via bandit rewards
 * in Phase 2):
 *   S+/S  → 1.00   (frontier, trusted self-calibration)
 *   A+    → 0.90
 *   A     → 0.80
 *   A-    → 0.75
 *   B+    → 0.70
 *   B     → 0.60
 *   C     → 0.50
 *   unknown / not in registry → 0.70
 *   CLI backend (no provider) → 1.00
 */

import type { AgentConfig } from '../types/config.js';
import type { ModelMetadata } from '../types/l0.js';
import { getModel } from '../l0/model-registry.js';

const TIER_MULTIPLIER: Record<NonNullable<ModelMetadata['tier']>, number> = {
  'S+': 1.0,
  'S':  1.0,
  'A+': 0.9,
  'A':  0.8,
  'A-': 0.75,
  'B+': 0.7,
  'B':  0.6,
  'C':  0.5,
};

const UNKNOWN_TIER_DEFAULT = 0.7;
const CLI_BACKEND_DEFAULT = 1.0;
const REGISTRY_UNLOADED_DEFAULT = 1.0; // BC: no surprise when registry missing

/**
 * Resolve the calibration multiplier for a reviewer config.
 *
 * @param config Reviewer config (provider, model, explicit override)
 * @returns Multiplier in [0, 1]
 */
export function getCalibrationMultiplier(config: AgentConfig): number {
  // Priority 1: explicit per-reviewer override
  if (typeof config.calibrationMultiplier === 'number') {
    return config.calibrationMultiplier;
  }
  // CLI backends have no provider → registry lookup impossible. Assume
  // frontier since these are typically local subscriptions.
  if (!config.provider) return CLI_BACKEND_DEFAULT;
  let meta: ModelMetadata | undefined;
  try {
    meta = getModel(config.provider, config.model);
  } catch {
    // Registry not initialized (isolated tests / early startup). Don't
    // surprise callers with a silent penalty.
    return REGISTRY_UNLOADED_DEFAULT;
  }
  if (!meta || !meta.tier) return UNKNOWN_TIER_DEFAULT;
  return TIER_MULTIPLIER[meta.tier] ?? UNKNOWN_TIER_DEFAULT;
}

/**
 * Decide whether to apply auto calibration for a given pipeline.
 * Explicit per-reviewer `calibrationMultiplier` is ALWAYS respected;
 * tier-based auto-mapping is gated by the global opt-in flag.
 */
export function shouldAutoCalibrate(opts: {
  reviewContext?: { calibrateReviewerConfidence?: boolean };
  config: AgentConfig;
}): boolean {
  if (typeof opts.config.calibrationMultiplier === 'number') return true;
  return opts.reviewContext?.calibrateReviewerConfidence === true;
}
