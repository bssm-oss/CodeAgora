/**
 * Tests for packages/shared/src/data/models-dev.ts
 *
 * Covers: Zod schemas, provider ID mapping, model filtering utilities,
 * and the 3-tier loadModelsCatalog() loader.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ModelEntrySchema,
  ProviderEntrySchema,
  ModelsCatalogSchema,
  PROVIDER_ID_MAP,
  toModelsDevId,
  fromModelsDevId,
  filterReviewCapable,
  filterFree,
  sortByCost,
  getTopModels,
  getProviderStats,
  loadModelsCatalog,
  SUPPORTED_PROVIDER_IDS,
  SUPPORTED_MODELS_DEV_IDS,
} from '@codeagora/shared/data/models-dev.js';
import type { ModelEntry, ProviderEntry, ModelsCatalog } from '@codeagora/shared/data/models-dev.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeModel(overrides: Partial<ModelEntry> = {}): ModelEntry {
  return {
    id: 'test-model',
    name: 'Test Model',
    reasoning: false,
    tool_call: true,
    cost: { input: 1.0, output: 2.0 },
    limit: { context: 32000, output: 4096 },
    release_date: '2025-01-01',
    modalities: { input: ['text'], output: ['text'] },
    open_weights: false,
    ...overrides,
  };
}

function makeProvider(overrides: Partial<ProviderEntry> = {}): ProviderEntry {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    env: ['TEST_API_KEY'],
    npm: '@ai-sdk/test',
    doc: 'https://test.example.com',
    models: {
      'test-model': makeModel(),
    },
    ...overrides,
  };
}

function makeCatalog(providers?: Record<string, ProviderEntry>): ModelsCatalog {
  return providers ?? { 'test-provider': makeProvider() };
}

// ---------------------------------------------------------------------------
// Zod Schema Tests
// ---------------------------------------------------------------------------

describe('ModelEntrySchema', () => {
  it('should parse a valid model entry', () => {
    const model = makeModel();
    const result = ModelEntrySchema.safeParse(model);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('test-model');
      expect(result.data.tool_call).toBe(true);
      expect(result.data.cost?.input).toBe(1.0);
    }
  });

  it('should allow missing cost (optional)', () => {
    const model = makeModel({ cost: undefined });
    const result = ModelEntrySchema.safeParse(model);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cost).toBeUndefined();
    }
  });

  it('should allow missing family (optional)', () => {
    const model = makeModel({ family: undefined });
    const result = ModelEntrySchema.safeParse(model);
    expect(result.success).toBe(true);
  });

  it('should preserve extra fields via passthrough', () => {
    const model = { ...makeModel(), custom_field: 'hello' };
    const result = ModelEntrySchema.safeParse(model);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>)['custom_field']).toBe('hello');
    }
  });

  it('should reject model with missing required fields', () => {
    const result = ModelEntrySchema.safeParse({ id: 'x' });
    expect(result.success).toBe(false);
  });

  it('should parse real snapshot data correctly', async () => {
    // Load a small portion of the actual snapshot to validate schema compatibility
    const snapshotPath = new URL(
      '../../packages/shared/src/data/models-dev-snapshot.json',
      import.meta.url,
    );
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(snapshotPath, 'utf-8');
    const raw = JSON.parse(content) as Record<string, unknown>;

    // Parse the entire catalog
    const catalogResult = ModelsCatalogSchema.safeParse(raw);
    expect(catalogResult.success).toBe(true);

    if (catalogResult.success) {
      // Ensure we have providers with models
      const providers = Object.values(catalogResult.data);
      expect(providers.length).toBeGreaterThan(0);

      // Validate at least one model from each provider
      for (const provider of providers) {
        const models = Object.values(provider.models);
        expect(models.length).toBeGreaterThan(0);
        const firstModel = models[0];
        expect(firstModel.id).toBeDefined();
        expect(typeof firstModel.reasoning).toBe('boolean');
        expect(typeof firstModel.tool_call).toBe('boolean');
      }
    }
  });
});

describe('ProviderEntrySchema', () => {
  it('should parse a valid provider entry', () => {
    const provider = makeProvider();
    const result = ProviderEntrySchema.safeParse(provider);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('test-provider');
      expect(result.data.env).toEqual(['TEST_API_KEY']);
    }
  });

  it('should allow optional api field', () => {
    const provider = makeProvider({ api: undefined });
    const result = ProviderEntrySchema.safeParse(provider);
    expect(result.success).toBe(true);
  });

  it('should preserve extra fields via passthrough', () => {
    const provider = { ...makeProvider(), extra: true };
    const result = ProviderEntrySchema.safeParse(provider);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>)['extra']).toBe(true);
    }
  });
});

describe('ModelsCatalogSchema', () => {
  it('should parse a catalog with multiple providers', () => {
    const catalog = {
      groq: makeProvider({ id: 'groq', name: 'Groq' }),
      openai: makeProvider({ id: 'openai', name: 'OpenAI' }),
    };
    const result = ModelsCatalogSchema.safeParse(catalog);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data)).toHaveLength(2);
    }
  });

  it('should parse an empty catalog', () => {
    const result = ModelsCatalogSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Provider ID Mapping Tests
// ---------------------------------------------------------------------------

describe('PROVIDER_ID_MAP', () => {
  it('should not require aliases for the curated provider IDs', () => {
    expect(PROVIDER_ID_MAP).toEqual({});
  });
});

describe('toModelsDevId', () => {
  it('should pass through unmapped provider IDs', () => {
    expect(toModelsDevId('groq')).toBe('groq');
    expect(toModelsDevId('openai')).toBe('openai');
    expect(toModelsDevId('anthropic')).toBe('anthropic');
    expect(toModelsDevId('openrouter')).toBe('openrouter');
    expect(toModelsDevId('opencode-go')).toBe('opencode-go');
  });

  it('should pass through unknown provider IDs', () => {
    expect(toModelsDevId('unknown-provider')).toBe('unknown-provider');
  });
});

describe('fromModelsDevId', () => {
  it('should pass through unmapped models.dev IDs', () => {
    expect(fromModelsDevId('groq')).toBe('groq');
    expect(fromModelsDevId('openai')).toBe('openai');
    expect(fromModelsDevId('anthropic')).toBe('anthropic');
  });

  it('should pass through unknown models.dev IDs', () => {
    expect(fromModelsDevId('unknown')).toBe('unknown');
  });

  it('should be the inverse of toModelsDevId for mapped providers', () => {
    for (const caId of Object.keys(PROVIDER_ID_MAP)) {
      const mdId = toModelsDevId(caId);
      expect(fromModelsDevId(mdId)).toBe(caId);
    }
  });
});

describe('SUPPORTED_PROVIDER_IDS', () => {
  it('should include all CodeAgora providers', () => {
    expect(SUPPORTED_PROVIDER_IDS).toContain('groq');
    expect(SUPPORTED_PROVIDER_IDS).toContain('openai');
    expect(SUPPORTED_PROVIDER_IDS).toContain('anthropic');
    expect(SUPPORTED_PROVIDER_IDS).toContain('opencode-go');
    expect(SUPPORTED_PROVIDER_IDS).toContain('opencode-zen');
  });

  it('should have correct length matching PROVIDER_ENV_VARS', () => {
    expect(SUPPORTED_PROVIDER_IDS.length).toBe(6);
  });
});

describe('SUPPORTED_MODELS_DEV_IDS', () => {
  it('should pass through unmapped IDs', () => {
    expect(SUPPORTED_MODELS_DEV_IDS).toContain('groq');
    expect(SUPPORTED_MODELS_DEV_IDS).toContain('openai');
  });
});

// ---------------------------------------------------------------------------
// Model Filtering Tests
// ---------------------------------------------------------------------------

describe('filterReviewCapable', () => {
  it('should keep models with tool_call, sufficient context, and text input', () => {
    const models = [
      makeModel({ id: 'capable', tool_call: true, limit: { context: 32000, output: 4096 }, modalities: { input: ['text'], output: ['text'] } }),
    ];
    expect(filterReviewCapable(models)).toHaveLength(1);
  });

  it('should filter out models without tool_call', () => {
    const models = [
      makeModel({ id: 'no-tool', tool_call: false }),
    ];
    expect(filterReviewCapable(models)).toHaveLength(0);
  });

  it('should filter out models with context < 16000', () => {
    const models = [
      makeModel({ id: 'small-ctx', limit: { context: 8000, output: 4096 } }),
    ];
    expect(filterReviewCapable(models)).toHaveLength(0);
  });

  it('should keep models with context exactly 16000', () => {
    const models = [
      makeModel({ id: 'exact-ctx', limit: { context: 16000, output: 4096 } }),
    ];
    expect(filterReviewCapable(models)).toHaveLength(1);
  });

  it('should filter out models without text input modality', () => {
    const models = [
      makeModel({ id: 'image-only', modalities: { input: ['image'], output: ['text'] } }),
    ];
    expect(filterReviewCapable(models)).toHaveLength(0);
  });

  it('should handle mixed capable and non-capable models', () => {
    const models = [
      makeModel({ id: 'capable-1', tool_call: true, limit: { context: 32000, output: 4096 } }),
      makeModel({ id: 'no-tool', tool_call: false }),
      makeModel({ id: 'small-ctx', limit: { context: 4000, output: 1024 } }),
      makeModel({ id: 'capable-2', tool_call: true, limit: { context: 128000, output: 8192 } }),
    ];
    const result = filterReviewCapable(models);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(['capable-1', 'capable-2']);
  });

  it('should return empty array for empty input', () => {
    expect(filterReviewCapable([])).toHaveLength(0);
  });
});

describe('filterFree', () => {
  it('should keep models with zero cost', () => {
    const models = [
      makeModel({ id: 'free', cost: { input: 0, output: 0 } }),
    ];
    expect(filterFree(models)).toHaveLength(1);
  });

  it('should filter out models with non-zero input cost', () => {
    const models = [
      makeModel({ id: 'paid-in', cost: { input: 0.5, output: 0 } }),
    ];
    expect(filterFree(models)).toHaveLength(0);
  });

  it('should filter out models with non-zero output cost', () => {
    const models = [
      makeModel({ id: 'paid-out', cost: { input: 0, output: 0.5 } }),
    ];
    expect(filterFree(models)).toHaveLength(0);
  });

  it('should filter out models without cost info', () => {
    const models = [
      makeModel({ id: 'no-cost', cost: undefined }),
    ];
    expect(filterFree(models)).toHaveLength(0);
  });

  it('should handle mixed free and paid models', () => {
    const models = [
      makeModel({ id: 'free', cost: { input: 0, output: 0 } }),
      makeModel({ id: 'paid', cost: { input: 1.0, output: 2.0 } }),
      makeModel({ id: 'no-cost', cost: undefined }),
    ];
    const result = filterFree(models);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('free');
  });
});

describe('sortByCost', () => {
  it('should sort models by total cost ascending', () => {
    const models = [
      makeModel({ id: 'expensive', cost: { input: 5.0, output: 10.0 } }),
      makeModel({ id: 'cheap', cost: { input: 0.1, output: 0.2 } }),
      makeModel({ id: 'medium', cost: { input: 1.0, output: 2.0 } }),
    ];
    const sorted = sortByCost(models);
    expect(sorted.map((m) => m.id)).toEqual(['cheap', 'medium', 'expensive']);
  });

  it('should put models without cost first (treated as 0)', () => {
    const models = [
      makeModel({ id: 'paid', cost: { input: 1.0, output: 1.0 } }),
      makeModel({ id: 'no-cost', cost: undefined }),
    ];
    const sorted = sortByCost(models);
    expect(sorted[0].id).toBe('no-cost');
    expect(sorted[1].id).toBe('paid');
  });

  it('should not mutate the original array', () => {
    const models = [
      makeModel({ id: 'b', cost: { input: 2.0, output: 0 } }),
      makeModel({ id: 'a', cost: { input: 1.0, output: 0 } }),
    ];
    const sorted = sortByCost(models);
    expect(models[0].id).toBe('b'); // original unchanged
    expect(sorted[0].id).toBe('a');
  });

  it('should handle empty array', () => {
    expect(sortByCost([])).toEqual([]);
  });

  it('should handle single-element array', () => {
    const models = [makeModel({ id: 'only' })];
    expect(sortByCost(models)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getTopModels Tests
// ---------------------------------------------------------------------------

describe('getTopModels', () => {
  it('should return top N review-capable models from a provider', () => {
    const catalog = makeCatalog({
      groq: makeProvider({
        id: 'groq',
        name: 'Groq',
        models: {
          'model-a': makeModel({ id: 'model-a', cost: { input: 5, output: 5 }, tool_call: true }),
          'model-b': makeModel({ id: 'model-b', cost: { input: 1, output: 1 }, tool_call: true }),
          'model-c': makeModel({ id: 'model-c', cost: { input: 3, output: 3 }, tool_call: true }),
          'model-no-tool': makeModel({ id: 'model-no-tool', tool_call: false }),
        },
      }),
    });

    const result = getTopModels(catalog, 'groq', 2);
    expect(result).toHaveLength(2);
    // Should be sorted by cost: model-b (2), model-c (6)
    expect(result[0].id).toBe('model-b');
    expect(result[1].id).toBe('model-c');
  });

  it('should use provider ID for provider lookup', () => {
    const catalog = makeCatalog({
      openrouter: makeProvider({
        id: 'openrouter',
        name: 'OpenRouter',
        models: {
          'model-1': makeModel({ id: 'model-1', tool_call: true }),
        },
      }),
    });

    const result = getTopModels(catalog, 'openrouter', 5);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('model-1');
  });

  it('should return empty array for unknown provider', () => {
    const catalog = makeCatalog();
    expect(getTopModels(catalog, 'nonexistent', 5)).toEqual([]);
  });

  it('should return fewer than N if not enough capable models', () => {
    const catalog = makeCatalog({
      groq: makeProvider({
        id: 'groq',
        name: 'Groq',
        models: {
          'capable': makeModel({ id: 'capable', tool_call: true }),
          'not-capable': makeModel({ id: 'not-capable', tool_call: false }),
        },
      }),
    });

    const result = getTopModels(catalog, 'groq', 10);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getProviderStats Tests
// ---------------------------------------------------------------------------

describe('getProviderStats', () => {
  it('should return correct counts', () => {
    const catalog = makeCatalog({
      groq: makeProvider({
        id: 'groq',
        name: 'Groq',
        models: {
          'free-capable': makeModel({ id: 'free-capable', tool_call: true, cost: { input: 0, output: 0 } }),
          'paid-capable': makeModel({ id: 'paid-capable', tool_call: true, cost: { input: 1, output: 1 } }),
          'free-no-tool': makeModel({ id: 'free-no-tool', tool_call: false, cost: { input: 0, output: 0 } }),
          'small-ctx': makeModel({ id: 'small-ctx', tool_call: true, limit: { context: 4000, output: 1024 } }),
        },
      }),
    });

    const stats = getProviderStats(catalog, 'groq');
    expect(stats.total).toBe(4);
    expect(stats.free).toBe(2); // free-capable + free-no-tool
    expect(stats.reviewCapable).toBe(2); // free-capable + paid-capable
  });

  it('should use provider ID for stats lookup', () => {
    const catalog = makeCatalog({
      openrouter: makeProvider({
        id: 'openrouter',
        name: 'OpenRouter',
        models: {
          'model-1': makeModel({ id: 'model-1' }),
        },
      }),
    });

    const stats = getProviderStats(catalog, 'openrouter');
    expect(stats.total).toBe(1);
  });

  it('should return zeros for unknown provider', () => {
    const catalog = makeCatalog();
    const stats = getProviderStats(catalog, 'nonexistent');
    expect(stats).toEqual({ total: 0, free: 0, reviewCapable: 0 });
  });
});

// ---------------------------------------------------------------------------
// loadModelsCatalog Tests (with mocks)
// ---------------------------------------------------------------------------

describe('loadModelsCatalog', () => {
  const mockCatalog: ModelsCatalog = {
    groq: makeProvider({ id: 'groq', name: 'Groq' }),
  };

  // We need to mock fs and fetch for these tests
  let mockReadFile: ReturnType<typeof vi.fn>;
  let mockWriteFile: ReturnType<typeof vi.fn>;
  let mockMkdir: ReturnType<typeof vi.fn>;
  let mockStat: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockReadFile = vi.fn();
    mockWriteFile = vi.fn().mockResolvedValue(undefined);
    mockMkdir = vi.fn().mockResolvedValue(undefined);
    mockStat = vi.fn();

    vi.doMock('node:fs/promises', () => ({
      readFile: mockReadFile,
      writeFile: mockWriteFile,
      mkdir: mockMkdir,
      stat: mockStat,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return fresh cache when available and not expired', async () => {
    const cacheContent = JSON.stringify(mockCatalog);
    mockReadFile.mockResolvedValue(cacheContent);
    mockStat.mockResolvedValue({ mtimeMs: Date.now() - 10_000 }); // 10 seconds ago

    const { loadModelsCatalog: loader } = await import('@codeagora/shared/data/models-dev.js');
    const result = await loader();
    expect(result).toEqual(mockCatalog);
    // Should not have tried to fetch
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('should fetch from API when cache is expired', async () => {
    const cacheContent = JSON.stringify(mockCatalog);
    // First readFile call is for cache (expired), second is for snapshot (shouldn't be needed)
    mockReadFile.mockResolvedValue(cacheContent);
    mockStat.mockResolvedValue({ mtimeMs: Date.now() - 2 * 60 * 60 * 1000 }); // 2 hours ago

    const freshCatalog: ModelsCatalog = {
      groq: makeProvider({ id: 'groq', name: 'Groq Fresh' }),
    };

    // Mock global fetch
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => freshCatalog,
    } as Response);

    const { loadModelsCatalog: loader } = await import('@codeagora/shared/data/models-dev.js');
    const result = await loader();

    expect(fetchSpy).toHaveBeenCalled();
    // The result will be filtered through filterToSupported which requires
    // providers to be in the supported list - groq is supported
    fetchSpy.mockRestore();
  });

  it('should fall back to expired cache when fetch fails', async () => {
    const cacheContent = JSON.stringify(mockCatalog);
    mockReadFile.mockResolvedValue(cacheContent);
    mockStat.mockResolvedValue({ mtimeMs: Date.now() - 2 * 60 * 60 * 1000 }); // expired

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const { loadModelsCatalog: loader } = await import('@codeagora/shared/data/models-dev.js');
    const result = await loader();
    expect(result).toEqual(mockCatalog);

    fetchSpy.mockRestore();
  });

  it('should fall back to snapshot when no cache and fetch fails', async () => {
    // First call (cache read) fails, subsequent calls serve the snapshot
    let callCount = 0;
    mockReadFile.mockImplementation(async (path: string | URL) => {
      callCount++;
      // First two calls are for cache (readFile + stat called via Promise.all)
      // If path looks like a URL (snapshot), serve the snapshot
      if (path instanceof URL || String(path).includes('snapshot')) {
        const { readFile: realRead } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
        const snapshotPath = new URL(
          '../../packages/shared/src/data/models-dev-snapshot.json',
          import.meta.url,
        );
        return realRead(snapshotPath, 'utf-8');
      }
      throw new Error('ENOENT: no such file');
    });
    mockStat.mockRejectedValue(new Error('ENOENT'));

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const { loadModelsCatalog: loader } = await import('@codeagora/shared/data/models-dev.js');
    const result = await loader();

    // Should have some providers from the snapshot
    expect(Object.keys(result).length).toBeGreaterThan(0);

    fetchSpy.mockRestore();
  });
});
