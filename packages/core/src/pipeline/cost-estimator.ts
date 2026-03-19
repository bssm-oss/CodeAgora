/**
 * Cost Estimator
 * Estimates LLM API call costs based on token usage and provider/model pricing.
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import type { TokenUsage } from './telemetry.js';

export type { TokenUsage };

export interface PricingEntry {
  input: number;  // cost per 1K input tokens
  output: number; // cost per 1K output tokens
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  model: string;
  provider: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lazy-loaded pricing cache (avoids blocking readFileSync at module level)
let _pricingCache: Record<string, PricingEntry> | null = null;

async function getPricing(): Promise<Record<string, PricingEntry>> {
  if (!_pricingCache) {
    const raw = await readFile(path.join(__dirname, '../../../shared/src/data/pricing.json'), 'utf-8');
    _pricingCache = JSON.parse(raw);
  }
  return _pricingCache!;
}

// Load pricing table from data/pricing.json
export async function loadPricing(): Promise<Record<string, PricingEntry>> {
  return getPricing();
}

// Estimate cost for a single call
export async function estimateCost(
  usage: TokenUsage,
  provider: string,
  model: string
): Promise<CostEstimate> {
  const pricing = await getPricing();
  const key = `${provider}/${model}`;
  const entry = pricing[key];

  if (!entry) {
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: -1,
      model,
      provider,
    };
  }

  const inputCost = (usage.promptTokens / 1000) * entry.input;
  const outputCost = (usage.completionTokens / 1000) * entry.output;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    model,
    provider,
  };
}

// Format cost to string ($X.XXXX)
export function formatCost(cost: CostEstimate): string {
  if (cost.totalCost < 0) {
    return 'N/A';
  }
  return `$${cost.totalCost.toFixed(4)}`;
}
