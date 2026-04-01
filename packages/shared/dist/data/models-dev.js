/**
 * models.dev Integration Layer
 *
 * Fetches, caches, and queries the models.dev catalog for CodeAgora's
 * supported providers. Provides a 3-tier loading strategy:
 *   1. Local cache (~/.config/codeagora/models-dev-cache.json) if < 60 min old
 *   2. Live fetch from https://models.dev/api.json (filtered to supported providers)
 *   3. Bundled snapshot fallback (packages/shared/src/data/models-dev-snapshot.json)
 */
import { z } from 'zod';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PROVIDER_ENV_VARS } from '../providers/env-vars.js';
// ---------------------------------------------------------------------------
// Zod Schemas (with .passthrough() for forward compatibility)
// ---------------------------------------------------------------------------
export const ModelEntrySchema = z
    .object({
    id: z.string(),
    name: z.string(),
    family: z.string().optional(),
    reasoning: z.boolean(),
    tool_call: z.boolean(),
    cost: z
        .object({
        input: z.number(),
        output: z.number(),
    })
        .optional(),
    limit: z.object({
        context: z.number(),
        output: z.number(),
    }),
    release_date: z.string(),
    modalities: z.object({
        input: z.array(z.string()),
        output: z.array(z.string()),
    }),
    open_weights: z.boolean(),
})
    .passthrough();
export const ProviderEntrySchema = z
    .object({
    id: z.string(),
    name: z.string(),
    env: z.array(z.string()),
    npm: z.string(),
    api: z.string().optional(),
    doc: z.string(),
    models: z.record(z.string(), ModelEntrySchema),
})
    .passthrough();
export const ModelsCatalogSchema = z.record(z.string(), ProviderEntrySchema);
// ---------------------------------------------------------------------------
// Provider ID Mapping (CodeAgora ID ↔ models.dev ID)
// ---------------------------------------------------------------------------
/** Maps CodeAgora provider IDs to models.dev provider IDs (only where they differ). */
export const PROVIDER_ID_MAP = {
    'nvidia-nim': 'nvidia',
    together: 'togetherai',
    qwen: 'alibaba',
    fireworks: 'fireworks-ai',
    moonshot: 'moonshotai',
    novita: 'novita-ai',
};
/** Reverse map: models.dev ID → CodeAgora ID */
const REVERSE_PROVIDER_ID_MAP = Object.fromEntries(Object.entries(PROVIDER_ID_MAP).map(([ca, md]) => [md, ca]));
/** Convert a CodeAgora provider ID to its models.dev equivalent. */
export function toModelsDevId(caId) {
    return PROVIDER_ID_MAP[caId] ?? caId;
}
/** Convert a models.dev provider ID to its CodeAgora equivalent. */
export function fromModelsDevId(mdId) {
    return REVERSE_PROVIDER_ID_MAP[mdId] ?? mdId;
}
// ---------------------------------------------------------------------------
// Supported Provider IDs (derived from PROVIDER_ENV_VARS)
// ---------------------------------------------------------------------------
/** All CodeAgora provider IDs (from the env-vars source of truth). */
export const SUPPORTED_PROVIDER_IDS = Object.keys(PROVIDER_ENV_VARS);
/** The corresponding models.dev IDs for all supported providers. */
export const SUPPORTED_MODELS_DEV_IDS = SUPPORTED_PROVIDER_IDS.map(toModelsDevId);
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const API_URL = 'https://models.dev/api.json';
const CACHE_DIR = join(homedir(), '.config', 'codeagora');
const CACHE_PATH = join(CACHE_DIR, 'models-dev-cache.json');
const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 60 minutes
const FETCH_TIMEOUT_MS = 10_000; // 10 seconds
// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------
/** Filter a raw catalog to only include CodeAgora's supported providers. */
function filterToSupported(raw) {
    const filtered = {};
    const mdIds = new Set(SUPPORTED_MODELS_DEV_IDS);
    for (const [key, value] of Object.entries(raw)) {
        if (mdIds.has(key)) {
            const parsed = ProviderEntrySchema.safeParse(value);
            if (parsed.success) {
                filtered[key] = parsed.data;
            }
        }
    }
    return filtered;
}
/** Read the local cache file. Returns null if missing or unreadable. */
async function readCache() {
    try {
        const [content, fileStat] = await Promise.all([
            readFile(CACHE_PATH, 'utf-8'),
            stat(CACHE_PATH),
        ]);
        const data = ModelsCatalogSchema.parse(JSON.parse(content));
        const ageMs = Date.now() - fileStat.mtimeMs;
        return { data, ageMs };
    }
    catch {
        return null;
    }
}
/** Write the catalog to the local cache file. */
async function writeCache(catalog) {
    try {
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(CACHE_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
    }
    catch {
        // Cache write failure is non-fatal
    }
}
/** Fetch the catalog from the models.dev API with timeout. */
async function fetchFromApi() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(API_URL, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const raw = (await response.json());
        return filterToSupported(raw);
    }
    finally {
        clearTimeout(timeout);
    }
}
/** Load the bundled snapshot as a fallback. */
async function loadSnapshot() {
    const snapshotPath = new URL('./models-dev-snapshot.json', import.meta.url);
    const content = await readFile(snapshotPath, 'utf-8');
    return ModelsCatalogSchema.parse(JSON.parse(content));
}
// ---------------------------------------------------------------------------
// Public API: Catalog Loader (3-tier)
// ---------------------------------------------------------------------------
/**
 * Load the models.dev catalog with a 3-tier strategy:
 *   1. Local cache if fresh (< 60 min)
 *   2. Live API fetch → save to cache
 *   3. Expired cache or bundled snapshot as fallback
 */
export async function loadModelsCatalog() {
    // Tier 1: Fresh cache
    const cached = await readCache();
    if (cached && cached.ageMs < CACHE_MAX_AGE_MS) {
        return cached.data;
    }
    // Tier 2: Live fetch
    try {
        const catalog = await fetchFromApi();
        await writeCache(catalog);
        return catalog;
    }
    catch {
        // Fetch failed — fall through
    }
    // Tier 3a: Expired cache
    if (cached) {
        return cached.data;
    }
    // Tier 3b: Bundled snapshot
    return loadSnapshot();
}
// ---------------------------------------------------------------------------
// Model Filtering Utilities
// ---------------------------------------------------------------------------
/**
 * Filter models capable of performing code review:
 *   - tool_call === true
 *   - context window >= 16,000 tokens
 *   - accepts text input
 */
export function filterReviewCapable(models) {
    return models.filter((m) => m.tool_call === true &&
        m.limit.context >= 16_000 &&
        m.modalities.input.includes('text'));
}
/** Filter models with zero cost (free tier). */
export function filterFree(models) {
    return models.filter((m) => m.cost?.input === 0 && m.cost?.output === 0);
}
/** Sort models by total cost (input + output) ascending. Models without cost come first. */
export function sortByCost(models) {
    return [...models].sort((a, b) => {
        const costA = (a.cost?.input ?? 0) + (a.cost?.output ?? 0);
        const costB = (b.cost?.input ?? 0) + (b.cost?.output ?? 0);
        return costA - costB;
    });
}
/**
 * Get the top N review-capable models from a provider, sorted by cost.
 * @param catalog - The loaded models catalog
 * @param providerId - CodeAgora provider ID (e.g. "groq", "nvidia-nim")
 * @param n - Maximum number of models to return
 */
export function getTopModels(catalog, providerId, n) {
    const mdId = toModelsDevId(providerId);
    const provider = catalog[mdId];
    if (!provider)
        return [];
    const allModels = Object.values(provider.models);
    const capable = filterReviewCapable(allModels);
    const sorted = sortByCost(capable);
    return sorted.slice(0, n);
}
/**
 * Get statistics about a provider's models.
 * @param catalog - The loaded models catalog
 * @param providerId - CodeAgora provider ID (e.g. "groq", "nvidia-nim")
 */
export function getProviderStats(catalog, providerId) {
    const mdId = toModelsDevId(providerId);
    const provider = catalog[mdId];
    if (!provider)
        return { total: 0, free: 0, reviewCapable: 0 };
    const allModels = Object.values(provider.models);
    return {
        total: allModels.length,
        free: filterFree(allModels).length,
        reviewCapable: filterReviewCapable(allModels).length,
    };
}
