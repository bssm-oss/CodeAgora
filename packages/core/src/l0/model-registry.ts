/**
 * Model Registry
 * Loads frouter model-rankings.json + groq-models.json and provides
 * a unified model catalog with family and reasoning classification.
 */

import { z } from 'zod';
import { extractFamily, isReasoningModel } from './family-classifier.js';
import type { ModelMetadata } from '../types/l0.js';

// ============================================================================
// Raw Data Types (frouter JSON schema)
// ============================================================================

interface RawRankingsData {
  source: string;
  models: Array<{
    source: string;
    model_id: string;
    name: string;
    swe_bench?: string;
    tier?: string;
    context?: string;
    aa_intelligence?: number;
    aa_speed_tps?: number;
    [key: string]: unknown;
  }>;
}

interface RawGroqData {
  source: string;
  models: Array<{
    model_id: string;
    name: string;
    context?: string;
  }>;
}

const RawRankingsDataSchema = z.object({
  source: z.string(),
  models: z.array(z.object({
    source: z.string(),
    model_id: z.string(),
    name: z.string(),
    swe_bench: z.string().optional(),
    tier: z.string().optional(),
    context: z.string().optional(),
    aa_intelligence: z.number().optional(),
    aa_speed_tps: z.number().optional(),
  }).passthrough()),
});

const RawGroqDataSchema = z.object({
  source: z.string(),
  models: z.array(z.object({
    model_id: z.string(),
    name: z.string(),
    context: z.string().optional(),
  })),
});

// ============================================================================
// Registry
// ============================================================================

const VALID_TIERS = new Set(['S+', 'S', 'A+', 'A', 'A-', 'B+', 'B', 'C']);

let registry: Map<string, ModelMetadata> | null = null;

function buildKey(source: string, modelId: string): string {
  return `${source}/${modelId}`;
}

/**
 * Initialize registry from raw data.
 * Exported for testing — in production, call loadRegistry().
 */
export function initFromData(
  rankingsData: RawRankingsData,
  groqData: RawGroqData
): Map<string, ModelMetadata> {
  const map = new Map<string, ModelMetadata>();

  // Load rankings models (NIM + OpenRouter)
  for (const raw of rankingsData.models) {
    const modelId = raw.model_id;
    const tier = VALID_TIERS.has(raw.tier ?? '') ? raw.tier as ModelMetadata['tier'] : undefined;

    const meta: ModelMetadata = {
      source: raw.source,
      modelId,
      name: raw.name,
      tier,
      context: raw.context ?? 'unknown',
      family: extractFamily(modelId),
      isReasoning: isReasoningModel(modelId),
      sweBench: raw.swe_bench,
      aaIntelligence: raw.aa_intelligence,
      aaSpeedTps: raw.aa_speed_tps,
    };

    map.set(buildKey(raw.source, modelId), meta);
  }

  // Load Groq models
  for (const raw of groqData.models) {
    const meta: ModelMetadata = {
      source: 'groq',
      modelId: raw.model_id,
      name: raw.name,
      context: raw.context ?? 'unknown',
      family: extractFamily(raw.model_id),
      isReasoning: isReasoningModel(raw.model_id),
    };

    map.set(buildKey('groq', raw.model_id), meta);
  }

  return map;
}

/**
 * Load registry from data files.
 */
export async function loadRegistry(): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const dataDir = path.resolve(
    new URL('.', import.meta.url).pathname,
    '../../../shared/src/data'
  );

  const [rankingsRaw, groqRaw] = await Promise.all([
    fs.readFile(path.join(dataDir, 'model-rankings.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'groq-models.json'), 'utf-8'),
  ]);

  registry = initFromData(
    RawRankingsDataSchema.parse(JSON.parse(rankingsRaw)),
    RawGroqDataSchema.parse(JSON.parse(groqRaw))
  );
}

/**
 * Set registry directly (for testing).
 */
export function setRegistry(map: Map<string, ModelMetadata>): void {
  registry = map;
}

function getRegistry(): Map<string, ModelMetadata> {
  if (!registry) {
    throw new Error('Model registry not initialized. Call loadRegistry() first.');
  }
  return registry;
}

// ============================================================================
// Query API
// ============================================================================

export function getModel(source: string, modelId: string): ModelMetadata | undefined {
  return getRegistry().get(buildKey(source, modelId));
}

export function getModelsByProvider(source: string): ModelMetadata[] {
  return Array.from(getRegistry().values()).filter((m) => m.source === source);
}

export function getModelsByFamily(family: string): ModelMetadata[] {
  return Array.from(getRegistry().values()).filter((m) => m.family === family);
}

export function getReasoningModels(): ModelMetadata[] {
  return Array.from(getRegistry().values()).filter((m) => m.isReasoning);
}

export function getAvailableModels(providerNames: string[]): ModelMetadata[] {
  const sources = new Set(providerNames);
  return Array.from(getRegistry().values()).filter((m) => sources.has(m.source));
}

export function getAllModels(): ModelMetadata[] {
  return Array.from(getRegistry().values());
}

export function getModelCount(): number {
  return getRegistry().size;
}
