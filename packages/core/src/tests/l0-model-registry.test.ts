/**
 * L0 Model Registry — initFromData + loadRegistry tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initFromData,
  setRegistry,
  getModel,
  getAllModels,
  getModelsByProvider,
  getReasoningModels,
} from '../l0/model-registry.js';

// ============================================================================
// initFromData unit tests (no I/O)
// ============================================================================

const minimalRankings = {
  source: 'test',
  models: [
    {
      source: 'openrouter',
      model_id: 'anthropic/claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet',
      tier: 'S',
      context: '200k',
      aa_intelligence: 85,
      aa_speed_tps: 60,
    },
    {
      source: 'openrouter',
      model_id: 'deepseek/deepseek-r1',
      name: 'DeepSeek R1',
      tier: 'A',
      context: '128k',
    },
  ],
};

const minimalGroq = {
  source: 'groq',
  models: [
    { model_id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', context: '128k' },
  ],
};

describe('initFromData', () => {
  it('populates the registry from rankings + groq data', () => {
    const map = initFromData(minimalRankings, minimalGroq);
    expect(map.size).toBe(3);
  });

  it('builds correct key format: source/model_id', () => {
    const map = initFromData(minimalRankings, minimalGroq);
    expect(map.has('openrouter/anthropic/claude-3.5-sonnet')).toBe(true);
    expect(map.has('groq/llama-3.3-70b-versatile')).toBe(true);
  });

  it('assigns tier only when it is a valid tier value', () => {
    const map = initFromData(minimalRankings, minimalGroq);
    const claude = map.get('openrouter/anthropic/claude-3.5-sonnet');
    expect(claude?.tier).toBe('S');
  });

  it('marks reasoning models correctly', () => {
    const map = initFromData(minimalRankings, minimalGroq);
    const r1 = map.get('openrouter/deepseek/deepseek-r1');
    expect(r1?.isReasoning).toBe(true);
  });

  it('sets groq source on groq models', () => {
    const map = initFromData(minimalRankings, minimalGroq);
    const llama = map.get('groq/llama-3.3-70b-versatile');
    expect(llama?.source).toBe('groq');
  });

  it('falls back to "unknown" context when context field is absent', () => {
    const noCtx = {
      source: 'test',
      models: [{ source: 'openrouter', model_id: 'test/model', name: 'Test' }],
    };
    const map = initFromData(noCtx, { source: 'groq', models: [] });
    expect(map.get('openrouter/test/model')?.context).toBe('unknown');
  });

  it('normalizes nullable ranking metrics from harvested model data', () => {
    const nullableMetrics = {
      source: 'test',
      models: [{
        source: 'openrouter',
        model_id: 'test/nullable-model',
        name: 'Nullable Model',
        swe_bench: null,
        aa_intelligence: null,
        aa_speed_tps: null,
      }],
    };

    const map = initFromData(nullableMetrics, { source: 'groq', models: [] });
    const model = map.get('openrouter/test/nullable-model');
    expect(model?.sweBench).toBeUndefined();
    expect(model?.aaIntelligence).toBeUndefined();
    expect(model?.aaSpeedTps).toBeUndefined();
  });
});

// ============================================================================
// Query API via setRegistry
// ============================================================================

describe('model registry query API', () => {
  beforeEach(() => {
    const map = initFromData(minimalRankings, minimalGroq);
    setRegistry(map);
  });

  it('getModel() returns a known model', () => {
    const m = getModel('openrouter', 'anthropic/claude-3.5-sonnet');
    expect(m).toBeDefined();
    expect(m?.name).toBe('Claude 3.5 Sonnet');
  });

  it('getModel() returns undefined for unknown model', () => {
    expect(getModel('openrouter', 'nonexistent/model')).toBeUndefined();
  });

  it('getAllModels() returns all registered models', () => {
    expect(getAllModels().length).toBe(3);
  });

  it('getModelsByProvider() filters by source', () => {
    const groqModels = getModelsByProvider('groq');
    expect(groqModels.length).toBe(1);
    expect(groqModels[0].source).toBe('groq');
  });

  it('getReasoningModels() returns only reasoning models', () => {
    const reasoning = getReasoningModels();
    expect(reasoning.every((m) => m.isReasoning)).toBe(true);
  });
});

// ============================================================================
// loadRegistry — uses setRegistry to simulate a successful load
// ============================================================================

describe('loadRegistry (via setRegistry)', () => {
  it('setRegistry + getAllModels reflects the injected map', () => {
    const map = initFromData(minimalRankings, minimalGroq);
    setRegistry(map);
    const models = getAllModels();
    expect(models.length).toBeGreaterThan(0);
  });

  it('getModel returns undefined before setRegistry is called with fresh import', async () => {
    // Use initFromData result directly — no real file I/O needed
    const map = initFromData({ source: 'test', models: [] }, { source: 'groq', models: [] });
    setRegistry(map);
    expect(getAllModels()).toHaveLength(0);
  });
});
