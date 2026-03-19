/**
 * Model Selector Tests
 */

import { describe, it, expect } from 'vitest';
import { selectModels, sampleBeta, createBanditState, updateBandit } from '@codeagora/core/l0/model-selector.js';
import type { ModelMetadata, BanditArm } from '@codeagora/core/types/l0.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeModel(overrides: Partial<ModelMetadata> & { modelId: string; source: string }): ModelMetadata {
  return {
    name: overrides.modelId,
    context: '128k',
    family: 'unknown',
    isReasoning: false,
    ...overrides,
  };
}

const DIVERSE_MODELS: ModelMetadata[] = [
  makeModel({ modelId: 'deepseek-r1', source: 'nim', family: 'deepseek', isReasoning: true }),
  makeModel({ modelId: 'deepseek-chat', source: 'nim', family: 'deepseek', isReasoning: false }),
  makeModel({ modelId: 'qwen3-235b', source: 'nim', family: 'qwen', isReasoning: false }),
  makeModel({ modelId: 'qwen-qwq-32b', source: 'groq', family: 'qwen', isReasoning: true }),
  makeModel({ modelId: 'llama-3.3-70b', source: 'groq', family: 'llama', isReasoning: false }),
  makeModel({ modelId: 'mistral-large', source: 'openrouter', family: 'mistral', isReasoning: false }),
  makeModel({ modelId: 'gemma2-9b', source: 'groq', family: 'gemma', isReasoning: false }),
  makeModel({ modelId: 'phi-4', source: 'nim', family: 'phi', isReasoning: false }),
];

// Deterministic seeded RNG (Park-Miller LCG, seed must be > 0)
function seededRng(seed: number = 42): () => number {
  let s = Math.max(seed, 1); // Ensure seed is never 0
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

describe('ModelSelector', () => {
  describe('sampleBeta', () => {
    it('should return values between 0 and 1', () => {
      const rng = seededRng();
      for (let i = 0; i < 100; i++) {
        const sample = sampleBeta(2, 3, rng);
        expect(sample).toBeGreaterThanOrEqual(0);
        expect(sample).toBeLessThanOrEqual(1);
      }
    });

    it('should return deterministic results with same RNG', () => {
      const rng1 = seededRng(123);
      const rng2 = seededRng(123);
      expect(sampleBeta(2, 2, rng1)).toBe(sampleBeta(2, 2, rng2));
    });
  });

  describe('selectModels', () => {
    it('should select requested count of models', () => {
      const result = selectModels({
        count: 5,
        availableModels: DIVERSE_MODELS,
        banditState: createBanditState(),
        rng: seededRng(),
      });

      expect(result.selections.length).toBe(5);
    });

    it('should not select more than available models', () => {
      const result = selectModels({
        count: 20,
        availableModels: DIVERSE_MODELS,
        banditState: createBanditState(),
        rng: seededRng(),
      });

      expect(result.selections.length).toBe(DIVERSE_MODELS.length);
    });

    it('should return empty selection for empty pool', () => {
      const result = selectModels({
        count: 5,
        availableModels: [],
        banditState: createBanditState(),
        rng: seededRng(),
      });

      expect(result.selections.length).toBe(0);
    });

    it('should ensure minimum family diversity', () => {
      const result = selectModels({
        count: 5,
        availableModels: DIVERSE_MODELS,
        banditState: createBanditState(),
        constraints: { familyDiversity: true, minFamilies: 3 },
        rng: seededRng(),
      });

      const families = new Set(result.selections.map((s) => s.family));
      expect(families.size).toBeGreaterThanOrEqual(3);
      expect(result.metadata.familyCount).toBeGreaterThanOrEqual(3);
    });

    it('should include reasoning models within bounds', () => {
      const result = selectModels({
        count: 5,
        availableModels: DIVERSE_MODELS,
        banditState: createBanditState(),
        constraints: { reasoningMin: 1, reasoningMax: 2 },
        rng: seededRng(),
      });

      expect(result.metadata.reasoningCount).toBeGreaterThanOrEqual(1);
      expect(result.metadata.reasoningCount).toBeLessThanOrEqual(2);
    });

    it('should allocate exploration slots', () => {
      const result = selectModels({
        count: 10,
        availableModels: DIVERSE_MODELS,
        banditState: createBanditState(),
        explorationRate: 0.3,
        rng: seededRng(),
      });

      const explorations = result.selections.filter(
        (s) => s.selectionReason === 'exploration'
      );
      // 8 models total, 10 requested → 8 selected. 0.3 * 8 = 2.4 → 2 exploration
      expect(explorations.length).toBeGreaterThanOrEqual(1);
      expect(result.metadata.explorationSlots).toBeGreaterThanOrEqual(1);
    });

    it('should prefer models with higher bandit scores', () => {
      const banditState = createBanditState();
      // Give one model a very strong arm
      banditState.set('nim/deepseek-r1', { alpha: 50, beta: 2, reviewCount: 52, lastUsed: 0 });
      // Give another a weak arm
      banditState.set('groq/gemma2-9b', { alpha: 1, beta: 50, reviewCount: 51, lastUsed: 0 });

      // Run multiple times to check tendency
      let deepseekSelected = 0;
      for (let i = 0; i < 20; i++) {
        const result = selectModels({
          count: 3,
          availableModels: DIVERSE_MODELS,
          banditState,
          constraints: { familyDiversity: false },
          explorationRate: 0,
          rng: seededRng(i * 37),
        });

        if (result.selections.some((s) => s.modelId === 'deepseek-r1')) {
          deepseekSelected++;
        }
      }

      // Strong arm should be selected most of the time
      expect(deepseekSelected).toBeGreaterThan(10);
    });

    it('should select zero reasoning from non-reasoning pool (pre-filtered by index)', () => {
      // index.ts filters out reasoning models before calling selectModels
      const nonReasoningOnly = DIVERSE_MODELS.filter((m) => !m.isReasoning);

      const result = selectModels({
        count: 5,
        availableModels: nonReasoningOnly,
        banditState: createBanditState(),
        constraints: { includeReasoning: false, familyDiversity: false },
        rng: seededRng(),
      });

      expect(result.metadata.reasoningCount).toBe(0);
      expect(result.selections.every((s) => !s.isReasoning)).toBe(true);
    });

    it('should enforce reasoning bounds when includeReasoning is true (default)', () => {
      const result = selectModels({
        count: 5,
        availableModels: DIVERSE_MODELS,
        banditState: createBanditState(),
        constraints: { includeReasoning: true, reasoningMin: 1, reasoningMax: 2 },
        rng: seededRng(),
      });

      expect(result.metadata.reasoningCount).toBeGreaterThanOrEqual(1);
      expect(result.metadata.reasoningCount).toBeLessThanOrEqual(2);
    });

    it('should not force reasoning models via diversity when includeReasoning is false', () => {
      // 6 non-reasoning models across 3 families, 1 reasoning model
      const models = [
        makeModel({ modelId: 'llama-3.3-70b', source: 'groq', family: 'llama', isReasoning: false }),
        makeModel({ modelId: 'llama-3.1-8b', source: 'groq', family: 'llama', isReasoning: false }),
        makeModel({ modelId: 'mistral-large', source: 'openrouter', family: 'mistral', isReasoning: false }),
        makeModel({ modelId: 'mistral-small', source: 'openrouter', family: 'mistral', isReasoning: false }),
        makeModel({ modelId: 'qwen3-235b', source: 'nim', family: 'qwen', isReasoning: false }),
        makeModel({ modelId: 'qwen3-32b', source: 'nim', family: 'qwen', isReasoning: false }),
        makeModel({ modelId: 'deepseek-r1', source: 'nim', family: 'deepseek', isReasoning: true }),
      ];

      const result = selectModels({
        count: 3,
        availableModels: models,
        banditState: createBanditState(),
        constraints: { includeReasoning: false, familyDiversity: true, minFamilies: 3, reasoningMin: 1 },
        explorationRate: 0,
        rng: seededRng(),
      });

      // reasoningMin=1 overridden to 0 — diversity should not force reasoning model
      const reasoningSelected = result.selections.filter((s) => s.isReasoning);
      expect(reasoningSelected.length).toBe(0);
    });

    it('should use cold start (optimistic) when no bandit state', () => {
      const result = selectModels({
        count: 3,
        availableModels: DIVERSE_MODELS,
        banditState: createBanditState(), // empty
        rng: seededRng(),
      });

      // Should still select 3 models even with no history
      expect(result.selections.length).toBe(3);
    });
  });

  describe('updateBandit', () => {
    it('should increment alpha on reward=1', () => {
      const state = createBanditState();
      updateBandit(state, 'groq/model-a', 1);

      const arm = state.get('groq/model-a')!;
      expect(arm.alpha).toBe(2);
      expect(arm.beta).toBe(1);
      expect(arm.reviewCount).toBe(1);
    });

    it('should increment beta on reward=0', () => {
      const state = createBanditState();
      updateBandit(state, 'groq/model-a', 0);

      const arm = state.get('groq/model-a')!;
      expect(arm.alpha).toBe(1);
      expect(arm.beta).toBe(2);
      expect(arm.reviewCount).toBe(1);
    });

    it('should accumulate updates', () => {
      const state = createBanditState();
      updateBandit(state, 'groq/model-a', 1);
      updateBandit(state, 'groq/model-a', 1);
      updateBandit(state, 'groq/model-a', 0);

      const arm = state.get('groq/model-a')!;
      expect(arm.alpha).toBe(3);
      expect(arm.beta).toBe(2);
      expect(arm.reviewCount).toBe(3);
    });
  });
});
