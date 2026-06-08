#!/usr/bin/env npx tsx
/**
 * Fetch the models.dev API and update the bundled snapshot.
 *
 * Usage:
 *   npx tsx scripts/update-models-snapshot.ts
 *
 * This fetches https://models.dev/api.json, filters to CodeAgora's supported
 * providers, and writes the result to packages/shared/src/data/models-dev-snapshot.json.
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(__dirname, '../packages/shared/src/data/models-dev-snapshot.json');
const API_URL = 'https://models.dev/api.json';

/** CodeAgora provider IDs from PROVIDER_ENV_VARS */
const CA_PROVIDERS = [
  'anthropic',
  'openai',
  'openrouter',
  'opencode-go',
  'opencode-zen',
  'groq',
];

/** Maps CodeAgora provider IDs to models.dev IDs (only where they differ) */
const PROVIDER_ID_MAP: Record<string, string> = {
};

function toModelsDevId(caId: string): string {
  return PROVIDER_ID_MAP[caId] ?? caId;
}

async function main(): Promise<void> {
  console.log(`Fetching ${API_URL}...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(API_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const raw = (await response.json()) as Record<string, unknown>;
    clearTimeout(timeout);

    const mdIds = new Set(CA_PROVIDERS.map(toModelsDevId));
    const filtered: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(raw)) {
      if (mdIds.has(key)) {
        filtered[key] = value;
      }
    }

    const foundProviders = Object.keys(filtered);
    const missing = CA_PROVIDERS.filter((p) => !filtered[toModelsDevId(p)]);

    console.log(`Found ${foundProviders.length}/${CA_PROVIDERS.length} providers`);
    if (missing.length > 0) {
      console.warn(`Missing providers: ${missing.join(', ')}`);
    }

    let totalModels = 0;
    for (const provider of Object.values(filtered) as Array<{ models: Record<string, unknown> }>) {
      totalModels += Object.keys(provider.models).length;
    }
    console.log(`Total models: ${totalModels}`);

    const json = JSON.stringify(filtered, null, 2);
    writeFileSync(SNAPSHOT_PATH, json + '\n', 'utf-8');
    console.log(`Snapshot written to ${SNAPSHOT_PATH} (${(json.length / 1024).toFixed(1)} KB)`);
  } catch (error) {
    clearTimeout(timeout);
    console.error('Failed to update snapshot:', error);
    process.exit(1);
  }
}

main();
