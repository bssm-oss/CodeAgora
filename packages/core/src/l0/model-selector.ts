/**
 * Model Selector
 * Thompson Sampling + diversity constraint based model selection.
 */

import type { ModelMetadata, ModelSelection, BanditArm } from '../types/l0.js';

// ============================================================================
// Beta Distribution Sampling
// ============================================================================

/**
 * Sample from Beta(alpha, beta) using the Jöhnk algorithm.
 * No external dependencies needed.
 */
export function sampleBeta(alpha: number, beta: number, rng?: () => number): number {
  const random = rng ?? Math.random;

  // Handle edge cases
  if (alpha <= 0) alpha = 0.01;
  if (beta <= 0) beta = 0.01;

  // For alpha=1, beta=1, it's uniform
  if (alpha === 1 && beta === 1) return random();

  // Use gamma sampling approach for general case
  const x = sampleGamma(alpha, random);
  const y = sampleGamma(beta, random);
  return x / (x + y);
}

/**
 * Sample from Gamma(alpha, 1) using Marsaglia and Tsang's method.
 */
function sampleGamma(alpha: number, random: () => number): number {
  if (alpha < 1) {
    // Boost: Gamma(alpha) = Gamma(alpha+1) * U^(1/alpha)
    return sampleGamma(alpha + 1, random) * Math.pow(random(), 1 / alpha);
  }

  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  const MAX_ITERATIONS = 10000;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let x: number;
    let v: number;

    do {
      x = normalRandom(random);
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }

  // Fallback: return mean of Gamma(alpha, 1)
  return alpha;
}

/**
 * Standard normal random using Box-Muller transform.
 */
function normalRandom(random: () => number): number {
  // Clamp u1 away from 0 to avoid Math.log(0) = -Infinity
  const u1 = Math.max(random(), 1e-10);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ============================================================================
// Selection Request
// ============================================================================

export interface SelectionRequest {
  count: number;
  availableModels: ModelMetadata[];
  banditState: Map<string, BanditArm>;
  constraints?: {
    familyDiversity?: boolean;
    includeReasoning?: boolean;
    minFamilies?: number;
    reasoningMin?: number;
    reasoningMax?: number;
  };
  explorationRate?: number;
  rng?: () => number;
}

// ============================================================================
// Model Selector
// ============================================================================

function armKey(model: ModelMetadata): string {
  return `${model.source}/${model.modelId}`;
}

/**
 * Select models using Thompson Sampling with diversity constraints.
 */
export function selectModels(request: SelectionRequest): ModelSelection {
  const {
    count,
    availableModels,
    banditState,
    constraints = {},
    explorationRate = 0.1,
    rng,
  } = request;

  if (availableModels.length === 0) {
    return {
      selections: [],
      metadata: { familyCount: 0, reasoningCount: 0, explorationSlots: 0 },
    };
  }

  const {
    familyDiversity = true,
    includeReasoning = true,
    minFamilies = 3,
    reasoningMin = 1,
    reasoningMax = 2,
  } = constraints;

  const actualCount = Math.min(count, availableModels.length);

  // 1. Determine exploration slots
  const explorationSlots = Math.max(0, Math.floor(actualCount * explorationRate));
  const _samplingSlots = actualCount - explorationSlots;

  const selected: Array<{
    model: ModelMetadata;
    reason: ModelSelection['selections'][number]['selectionReason'];
  }> = [];
  const usedKeys = new Set<string>();

  // 2. Exploration: pick least-used models
  if (explorationSlots > 0) {
    const sorted = [...availableModels].sort((a, b) => {
      const armA = banditState.get(armKey(a));
      const armB = banditState.get(armKey(b));
      return (armA?.reviewCount ?? 0) - (armB?.reviewCount ?? 0);
    });

    for (const model of sorted) {
      if (selected.length >= explorationSlots) break;
      const key = armKey(model);
      if (!usedKeys.has(key)) {
        selected.push({ model, reason: 'exploration' });
        usedKeys.add(key);
      }
    }
  }

  // 3. Thompson Sampling for remaining slots
  const candidates = availableModels
    .filter((m) => !usedKeys.has(armKey(m)))
    .map((model) => {
      const arm = banditState.get(armKey(model));
      // Cold start: optimistic initialization α=2, β=1
      const alpha = arm ? arm.alpha + 1 : 3;
      const beta = arm ? arm.beta + 1 : 2;
      const theta = sampleBeta(alpha, beta, rng);
      return { model, theta };
    })
    .sort((a, b) => b.theta - a.theta);

  for (const candidate of candidates) {
    if (selected.length >= actualCount) break;
    const key = armKey(candidate.model);
    if (!usedKeys.has(key)) {
      selected.push({ model: candidate.model, reason: 'thompson-sampling' });
      usedKeys.add(key);
    }
  }

  // 4. Apply diversity constraints
  if (familyDiversity && selected.length >= minFamilies) {
    applyDiversityConstraints(selected, availableModels, usedKeys, {
      minFamilies,
      reasoningMin: includeReasoning ? reasoningMin : 0,
      reasoningMax: includeReasoning ? reasoningMax : 0,
    });
  }

  // Build result
  const selections = selected.map((s) => ({
    modelId: s.model.modelId,
    provider: s.model.source,
    family: s.model.family,
    isReasoning: s.model.isReasoning,
    selectionReason: s.reason,
  }));

  const families = new Set(selections.map((s) => s.family));
  const reasoningCount = selections.filter((s) => s.isReasoning).length;

  return {
    selections,
    metadata: {
      familyCount: families.size,
      reasoningCount,
      explorationSlots,
    },
  };
}

// ============================================================================
// Diversity Constraints
// ============================================================================

function applyDiversityConstraints(
  selected: Array<{ model: ModelMetadata; reason: ModelSelection['selections'][number]['selectionReason'] }>,
  pool: ModelMetadata[],
  usedKeys: Set<string>,
  constraints: { minFamilies: number; reasoningMin: number; reasoningMax: number }
): void {
  const { minFamilies, reasoningMin, reasoningMax } = constraints;

  // Enforce family diversity: replace duplicates if under minFamilies
  let families = new Set(selected.map((s) => s.model.family));
  if (families.size < minFamilies) {
    // Find families not yet represented
    const missingFamilies = new Set<string>();
    for (const model of pool) {
      if (!families.has(model.family) && !usedKeys.has(armKey(model))) {
        missingFamilies.add(model.family);
      }
    }

    // Replace over-represented family members
    const familyCounts = new Map<string, number>();
    for (const s of selected) {
      familyCounts.set(s.model.family, (familyCounts.get(s.model.family) ?? 0) + 1);
    }

    for (const targetFamily of missingFamilies) {
      if (families.size >= minFamilies) break;

      // Find a candidate from the target family
      const replacement = pool.find(
        (m) => m.family === targetFamily && !usedKeys.has(armKey(m))
      );
      if (!replacement) continue;

      // Find the most over-represented family to remove from
      let maxFamily = '';
      let maxCount = 0;
      for (const [fam, cnt] of familyCounts) {
        if (cnt > maxCount) {
          maxFamily = fam;
          maxCount = cnt;
        }
      }

      if (maxCount <= 1) break; // Can't remove without losing a family

      // Replace last member of over-represented family
      const removeIdx = selected.findLastIndex((s) => s.model.family === maxFamily);
      if (removeIdx >= 0) {
        usedKeys.delete(armKey(selected[removeIdx].model));
        selected[removeIdx] = { model: replacement, reason: 'diversity-fill' };
        usedKeys.add(armKey(replacement));
        familyCounts.set(maxFamily, maxCount - 1);
        familyCounts.set(targetFamily, 1);
        families = new Set(selected.map((s) => s.model.family));
      }
    }
  }

  // Enforce reasoning bounds
  let reasoningCount = selected.filter((s) => s.model.isReasoning).length;

  // Too few reasoning models
  while (reasoningCount < reasoningMin) {
    const replacement = pool.find(
      (m) => m.isReasoning && !usedKeys.has(armKey(m))
    );
    if (!replacement) break;

    // Replace a non-reasoning model (prefer keeping diversity)
    const removeIdx = selected.findIndex(
      (s) => !s.model.isReasoning && countFamily(selected, s.model.family) > 1
    );
    const fallbackIdx = selected.findIndex((s) => !s.model.isReasoning);
    const idx = removeIdx >= 0 ? removeIdx : fallbackIdx;
    if (idx < 0) break;

    usedKeys.delete(armKey(selected[idx].model));
    selected[idx] = { model: replacement, reason: 'diversity-fill' };
    usedKeys.add(armKey(replacement));
    reasoningCount++;
  }

  // Too many reasoning models
  while (reasoningCount > reasoningMax) {
    const replacement = pool.find(
      (m) => !m.isReasoning && !usedKeys.has(armKey(m))
    );
    if (!replacement) break;

    const removeIdx = selected.findIndex(
      (s) => s.model.isReasoning && countFamily(selected, s.model.family) > 1
    );
    const fallbackIdx = selected.findLastIndex((s) => s.model.isReasoning);
    const idx = removeIdx >= 0 ? removeIdx : fallbackIdx;
    if (idx < 0) break;

    usedKeys.delete(armKey(selected[idx].model));
    selected[idx] = { model: replacement, reason: 'diversity-fill' };
    usedKeys.add(armKey(replacement));
    reasoningCount--;
  }
}

function countFamily(
  selected: Array<{ model: ModelMetadata }>,
  family: string
): number {
  return selected.filter((s) => s.model.family === family).length;
}

// ============================================================================
// Bandit State Management
// ============================================================================

export function createBanditState(): Map<string, BanditArm> {
  return new Map();
}

export function updateBandit(
  state: Map<string, BanditArm>,
  key: string,
  reward: 0 | 1
): void {
  const arm = state.get(key) ?? { alpha: 1, beta: 1, reviewCount: 0, lastUsed: 0 };

  if (reward === 1) {
    arm.alpha += 1;
  } else {
    arm.beta += 1;
  }
  arm.reviewCount += 1;
  arm.lastUsed = Date.now();

  state.set(key, arm);
}
