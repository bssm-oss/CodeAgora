/**
 * Model Registry Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initFromData, setRegistry, getModel, getModelsByProvider, getModelsByFamily, getReasoningModels, getAvailableModels, getAllModels, getModelCount } from '@codeagora/core/l0/model-registry.js';

const FIXTURE_RANKINGS = {
  source: 'https://artificialanalysis.ai',
  models: [
    { source: 'nim', model_id: 'deepseek-r1', name: 'DeepSeek R1', tier: 'S+', context: '128k', aa_intelligence: 48, aa_speed_tps: 196 },
    { source: 'nim', model_id: 'qwen/qwen3-235b-a22b', name: 'Qwen3 235B', tier: 'S', context: '128k', aa_intelligence: 45 },
    { source: 'nim', model_id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', tier: 'A+', context: '128k' },
    { source: 'openrouter', model_id: 'mistral-large-latest', name: 'Mistral Large', tier: 'A', context: '128k' },
    { source: 'nim', model_id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B', tier: 'A', context: '128k' },
  ],
};

const FIXTURE_GROQ = {
  source: 'groq',
  models: [
    { model_id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', context: '128k' },
    { model_id: 'qwen-qwq-32b', name: 'QwQ 32B', context: '128k' },
    { model_id: 'gemma2-9b-it', name: 'Gemma 2 9B', context: '8k' },
  ],
};

describe('ModelRegistry', () => {
  beforeEach(() => {
    const map = initFromData(FIXTURE_RANKINGS, FIXTURE_GROQ);
    setRegistry(map);
  });

  it('should load all models from both sources', () => {
    expect(getModelCount()).toBe(8); // 5 rankings + 3 groq
  });

  it('should get a model by source and modelId', () => {
    const model = getModel('nim', 'deepseek-r1');
    expect(model).toBeDefined();
    expect(model!.name).toBe('DeepSeek R1');
    expect(model!.tier).toBe('S+');
    expect(model!.family).toBe('deepseek');
    expect(model!.isReasoning).toBe(true);
  });

  it('should get models by provider', () => {
    const nimModels = getModelsByProvider('nim');
    expect(nimModels.length).toBe(4);

    const groqModels = getModelsByProvider('groq');
    expect(groqModels.length).toBe(3);
  });

  it('should get models by family', () => {
    // llama: nim/llama-3.3, groq/llama-3.3, nim/distill-llama
    const llamaModels = getModelsByFamily('llama');
    expect(llamaModels.length).toBe(3);
  });

  it('should get reasoning models', () => {
    const reasoning = getReasoningModels();
    // deepseek-r1, deepseek-r1-distill-llama, qwen-qwq
    expect(reasoning.length).toBe(3);
  });

  it('should get available models filtered by providers', () => {
    const groqOnly = getAvailableModels(['groq']);
    expect(groqOnly.length).toBe(3);

    const nimAndGroq = getAvailableModels(['nim', 'groq']);
    expect(nimAndGroq.length).toBe(7);
  });

  it('should classify distilled models by base family', () => {
    const model = getModel('nim', 'deepseek-r1-distill-llama-70b');
    expect(model).toBeDefined();
    expect(model!.family).toBe('llama'); // base family, not deepseek
    expect(model!.isReasoning).toBe(true); // still reasoning (R1 distill)
  });

  it('should handle missing tier gracefully', () => {
    const model = getModel('nim', 'meta/llama-3.3-70b-instruct');
    expect(model).toBeDefined();
    expect(model!.tier).toBe('A+');
  });

  it('should return all models', () => {
    const all = getAllModels();
    expect(all.length).toBe(8);
  });
});
