/**
 * Pipeline Cost Estimator — loadPricing failure path and unknown model
 */

import { describe, it, expect } from 'vitest';
import { estimateCost, formatCost, loadPricing } from '../pipeline/cost-estimator.js';
import type { TokenUsage } from '../pipeline/cost-estimator.js';

const usage: TokenUsage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };

describe('estimateCost', () => {
  it('returns totalCost=-1 for an unknown provider/model', async () => {
    const result = await estimateCost(usage, 'unknown-provider', 'no-such-model');
    expect(result.totalCost).toBe(-1);
    expect(result.model).toBe('no-such-model');
    expect(result.provider).toBe('unknown-provider');
  });

  it('calculates correct cost for a known model', async () => {
    // groq/llama-3.3-70b-versatile: input=0.00059, output=0.00079 per 1K tokens
    const result = await estimateCost(usage, 'groq', 'llama-3.3-70b-versatile');
    expect(result.totalCost).toBeGreaterThan(0);
    // 1000 tokens * 0.00059/1K = 0.00059; 500 * 0.00079/1K = 0.000395
    expect(result.inputCost).toBeCloseTo(0.00059, 5);
    expect(result.outputCost).toBeCloseTo(0.000395, 5);
    expect(result.totalCost).toBeCloseTo(0.000985, 5);
  });

  it('returns correct provider and model fields', async () => {
    const result = await estimateCost(usage, 'groq', 'llama-3.3-70b-versatile');
    expect(result.provider).toBe('groq');
    expect(result.model).toBe('llama-3.3-70b-versatile');
  });

  it('uses OpenRouter base pricing for variant-suffixed model ids', async () => {
    const result = await estimateCost(usage, 'openrouter', 'nvidia/nemotron-3-nano-30b-a3b:nitro');
    expect(result.totalCost).toBeCloseTo(0.00015, 8);
  });
});

describe('formatCost', () => {
  it('formats a known cost as $X.XXXX', async () => {
    const result = await estimateCost(usage, 'groq', 'llama-3.3-70b-versatile');
    const formatted = formatCost(result);
    expect(formatted).toMatch(/^\$[\d.]+$/);
  });

  it('returns "N/A" for totalCost=-1', () => {
    const estimate = { inputCost: 0, outputCost: 0, totalCost: -1, model: 'm', provider: 'p' };
    expect(formatCost(estimate)).toBe('N/A');
  });
});

describe('loadPricing', () => {
  it('loads and returns a non-empty pricing table', async () => {
    const pricing = await loadPricing();
    expect(typeof pricing).toBe('object');
    expect(Object.keys(pricing).length).toBeGreaterThan(0);
  });

  it('entries have numeric input and output fields', async () => {
    const pricing = await loadPricing();
    for (const entry of Object.values(pricing)) {
      expect(typeof entry.input).toBe('number');
      expect(typeof entry.output).toBe('number');
    }
  });

  it('pricing table contains expected providers', async () => {
    const pricing = await loadPricing();
    // Verify at least one well-known entry exists
    const keys = Object.keys(pricing);
    const hasGroq = keys.some((k) => k.startsWith('groq/'));
    expect(hasGroq).toBe(true);
  });
});
