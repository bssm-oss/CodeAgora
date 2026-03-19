/**
 * Config API Routes
 * Load and update CodeAgora configuration.
 */

import { Hono } from 'hono';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { ConfigSchema } from '@codeagora/core/types/config.js';

const CA_ROOT = '.ca';

export const configRoutes = new Hono();

/**
 * GET /api/config — Load and return current config.
 */
configRoutes.get('/', async (c) => {
  const config = await loadConfig();

  if (!config) {
    return c.json({ error: 'No configuration file found' }, 404);
  }

  if (
    typeof config === 'object' &&
    '_format' in config &&
    (config as Record<string, unknown>)['_format'] === 'yaml'
  ) {
    return c.json(
      { error: 'YAML config editing is not yet supported in the dashboard. Use .ca/config.json instead.' },
      501,
    );
  }

  return c.json(config);
});

/**
 * PUT /api/config — Validate with ConfigSchema (zod) and write to config file.
 */
configRoutes.put('/', async (c) => {
  const body = await c.req.json();
  const result = ConfigSchema.safeParse(body);

  if (!result.success) {
    return c.json(
      { error: 'Invalid configuration', details: result.error.issues },
      400,
    );
  }

  const configPath = await getExistingConfigPath();

  if (configPath?.endsWith('.yaml') || configPath?.endsWith('.yml')) {
    return c.json(
      { error: 'YAML config editing is not yet supported. Use .ca/config.json instead.' },
      501,
    );
  }

  const targetPath = configPath ?? path.join(CA_ROOT, 'config.json');

  await writeFile(targetPath, JSON.stringify(result.data, null, 2), 'utf-8');

  return c.json({ status: 'saved' });
});

/**
 * Try to find an existing config file (JSON or YAML).
 */
async function getExistingConfigPath(): Promise<string | null> {
  const jsonPath = path.join(CA_ROOT, 'config.json');
  const yamlPath = path.join(CA_ROOT, 'config.yaml');

  try {
    await readFile(jsonPath, 'utf-8');
    return jsonPath;
  } catch {
    // Try YAML
  }

  try {
    await readFile(yamlPath, 'utf-8');
    return yamlPath;
  } catch {
    // No config file exists
  }

  return null;
}

/**
 * Load config from JSON or YAML file.
 */
async function loadConfig(): Promise<unknown | null> {
  const jsonPath = path.join(CA_ROOT, 'config.json');
  const yamlPath = path.join(CA_ROOT, 'config.yaml');

  try {
    const content = await readFile(jsonPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Try YAML
  }

  try {
    await readFile(yamlPath, 'utf-8');
    // YAML config detected — return sentinel so caller can respond with 501
    return { _format: 'yaml' } as { _format: string };
  } catch {
    return null;
  }
}
