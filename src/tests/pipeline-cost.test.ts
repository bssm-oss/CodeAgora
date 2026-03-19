/**
 * Cost Estimator Tests
 */

import { describe, it, expect } from 'vitest';
import {
  loadPricing,
  estimateCost,
  formatCost,
} from '@codeagora/core/pipeline/cost-estimator.js';
import type { TokenUsage, CostEstimate } from '@codeagora/core/pipeline/cost-estimator.js';

describe('Cost Estimator', () => {
  // Test 1: groq/llama-3.3-70b — pricing lookup 성공, 비용 계산 정확
  it('groq/llama-3.3-70b pricing lookup 성공 및 비용 계산 정확', async () => {
    const usage: TokenUsage = {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    };
    const result = await estimateCost(usage, 'groq', 'llama-3.3-70b-versatile');
    expect(result.provider).toBe('groq');
    expect(result.model).toBe('llama-3.3-70b-versatile');
    expect(result.inputCost).toBeCloseTo((1000 / 1000) * 0.00059, 8);
    expect(result.outputCost).toBeCloseTo((500 / 1000) * 0.00079, 8);
    expect(result.totalCost).toBeCloseTo(0.00059 + 0.000395, 8);
    expect(result.totalCost).toBeGreaterThan(0);
  });

  // Test 2: 알 수 없는 모델 — totalCost = -1
  it('알 수 없는 모델은 totalCost = -1 반환', async () => {
    const usage: TokenUsage = {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    };
    const result = await estimateCost(usage, 'unknown-provider', 'unknown-model');
    expect(result.totalCost).toBe(-1);
  });

  // Test 3: token usage → 비용 계산 공식
  it('비용 계산 공식: inputTokens * inputPrice / 1000 + outputTokens * outputPrice / 1000', async () => {
    const usage: TokenUsage = {
      promptTokens: 2000,
      completionTokens: 1000,
      totalTokens: 3000,
    };
    const result = await estimateCost(usage, 'groq', 'llama-3.1-8b-instant');
    const expectedInput = (2000 / 1000) * 0.00005;
    const expectedOutput = (1000 / 1000) * 0.00008;
    expect(result.inputCost).toBeCloseTo(expectedInput, 8);
    expect(result.outputCost).toBeCloseTo(expectedOutput, 8);
    expect(result.totalCost).toBeCloseTo(expectedInput + expectedOutput, 8);
  });

  // Test 4: 여러 provider 혼합 비용 합산
  it('여러 provider 혼합 비용 합산', async () => {
    const usage1: TokenUsage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
    const usage2: TokenUsage = { promptTokens: 2000, completionTokens: 1000, totalTokens: 3000 };

    const cost1 = await estimateCost(usage1, 'google', 'gemini-2.5-flash');
    const cost2 = await estimateCost(usage2, 'mistral', 'mistral-large-latest');

    expect(cost1.totalCost).toBeGreaterThanOrEqual(0);
    expect(cost2.totalCost).toBeGreaterThanOrEqual(0);

    const combined = cost1.totalCost + cost2.totalCost;
    const expectedCost1 = (1000 / 1000) * 0.00015 + (500 / 1000) * 0.0006;
    const expectedCost2 = (2000 / 1000) * 0.002 + (1000 / 1000) * 0.006;
    expect(combined).toBeCloseTo(expectedCost1 + expectedCost2, 8);
  });

  // Test 5: 무료 tier 모델 (cerebras) — $0.0000
  it('무료 tier 모델 (cerebras) — totalCost = 0', async () => {
    const usage: TokenUsage = {
      promptTokens: 5000,
      completionTokens: 2000,
      totalTokens: 7000,
    };
    const result = await estimateCost(usage, 'cerebras', 'llama-3.3-70b');
    expect(result.totalCost).toBe(0);
    expect(formatCost(result)).toBe('$0.0000');
  });

  // Test 6: formatCost — $X.XXXX 형식
  it('formatCost — $X.XXXX 형식 반환', () => {
    const cost: CostEstimate = {
      inputCost: 0.00059,
      outputCost: 0.000395,
      totalCost: 0.000985,
      model: 'llama-3.3-70b-versatile',
      provider: 'groq',
    };
    const formatted = formatCost(cost);
    expect(formatted).toMatch(/^\$\d+\.\d{4}$/);
    expect(formatted).toBe('$0.0010');
  });

  // Test 7: formatCost — unknown은 'N/A'
  it('formatCost — unknown 모델 비용은 N/A 반환', () => {
    const cost: CostEstimate = {
      inputCost: 0,
      outputCost: 0,
      totalCost: -1,
      model: 'unknown-model',
      provider: 'unknown-provider',
    };
    expect(formatCost(cost)).toBe('N/A');
  });

  // Test 8: loadPricing — pricing table에 key가 존재하는지
  it('loadPricing — pricing table에 기대하는 key들이 존재', async () => {
    const pricing = await loadPricing();
    expect(pricing).toHaveProperty('groq/llama-3.3-70b-versatile');
    expect(pricing).toHaveProperty('groq/llama-3.1-8b-instant');
    expect(pricing).toHaveProperty('groq/deepseek-r1-distill-llama-70b');
    expect(pricing).toHaveProperty('openrouter/anthropic/claude-3.5-sonnet');
    expect(pricing).toHaveProperty('openrouter/google/gemini-2.5-flash');
    expect(pricing).toHaveProperty('google/gemini-2.5-flash');
    expect(pricing).toHaveProperty('google/gemini-2.5-pro');
    expect(pricing).toHaveProperty('mistral/mistral-large-latest');
    expect(pricing).toHaveProperty('nvidia-nim/deepseek-r1');
    expect(pricing).toHaveProperty('cerebras/llama-3.3-70b');

    const entry = pricing['groq/llama-3.3-70b-versatile'];
    expect(entry.input).toBe(0.00059);
    expect(entry.output).toBe(0.00079);
  });
});
