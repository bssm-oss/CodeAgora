/**
 * Config Loader
 * Load and validate .ca/config.json (or .ca/config.yaml / .ca/config.yml)
 */

import fs from 'fs/promises';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import { Config, validateConfig, type AgentConfig, type ReviewerEntry, type DeclarativeReviewers } from '../types/config.js';
import { readJson, CA_ROOT } from '@codeagora/shared/utils/fs.js';

// ============================================================================
// Config Loader
// ============================================================================

/**
 * Load config from an explicit base directory.
 * Priority: .ca/config.json > .ca/config.yaml > .ca/config.yml
 * If both JSON and YAML exist, JSON wins and a warning is emitted.
 */
export async function loadConfigFrom(baseDir: string): Promise<Config> {
  const jsonPath = path.join(baseDir, CA_ROOT, 'config.json');
  const yamlPath = path.join(baseDir, CA_ROOT, 'config.yaml');
  const ymlPath  = path.join(baseDir, CA_ROOT, 'config.yml');

  const [jsonExists, yamlExists, ymlExists] = await Promise.all([
    fileExists(jsonPath),
    fileExists(yamlPath),
    fileExists(ymlPath),
  ]);

  const yamlFilePath = yamlExists ? yamlPath : ymlExists ? ymlPath : null;

  if (jsonExists) {
    if (yamlFilePath) {
      console.warn(
        `Both config.json and ${path.basename(yamlFilePath)} found in ${path.join(baseDir, CA_ROOT)}. ` +
        `config.json takes precedence; config.yaml is ignored.`
      );
    }
    const data = await readJson(jsonPath);
    return validateConfig(data);
  }

  if (yamlFilePath) {
    return loadYamlConfig(yamlFilePath);
  }

  // Neither exists — suggest running init
  throw new Error(
    `Config file not found. Run \`agora init\` to create one.`
  );
}

/**
 * Load config using process.cwd() as the base directory (default behaviour).
 */
export async function loadConfig(): Promise<Config> {
  return loadConfigFrom(process.cwd());
}

// ============================================================================
// Internal helpers
// ============================================================================

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadYamlConfig(filePath: string): Promise<Config> {
  const content = await fs.readFile(filePath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`YAML parse error in ${filePath}: ${msg}`);
  }

  return validateConfig(parsed);
}

/**
 * Validate config without loading from file
 */
export function validateConfigData(data: unknown): Config {
  return validateConfig(data);
}

/**
 * Check if a reviewer entry is a static (non-auto) reviewer.
 */
function isStaticReviewer(entry: ReviewerEntry): entry is AgentConfig {
  return !('auto' in entry && entry.auto === true);
}

/**
 * Get enabled static reviewers (excludes auto: true reviewers).
 * Auto reviewers are resolved by L0 in resolveReviewers().
 * Note: config must be normalized first if using declarative format.
 */
export function getEnabledReviewers(config: Config): AgentConfig[] {
  if (!Array.isArray(config.reviewers)) {
    // Declarative format — no static reviewers available without normalization
    return (config.reviewers.static ?? []).filter(
      (r): r is AgentConfig => isStaticReviewer(r) && r.enabled
    );
  }
  return config.reviewers.filter(
    (r): r is AgentConfig => isStaticReviewer(r) && r.enabled
  );
}

/**
 * Get all enabled reviewer entries (including auto).
 * Note: config must be normalized first if using declarative format.
 */
export function getEnabledReviewerEntries(config: Config): ReviewerEntry[] {
  if (!Array.isArray(config.reviewers)) {
    // Declarative format — normalize first
    return expandDeclarativeReviewers(config.reviewers).filter((r) => r.enabled);
  }
  return config.reviewers.filter((r) => r.enabled);
}

/**
 * Get enabled supporters from pool
 */
export function getEnabledSupporters(config: Config) {
  return config.supporters.pool.filter((s) => s.enabled);
}

/**
 * Get Devil's Advocate if enabled
 */
export function getDevilsAdvocate(config: Config) {
  return config.supporters.devilsAdvocate.enabled
    ? config.supporters.devilsAdvocate
    : null;
}

/**
 * Check minimum reviewers requirement
 */
export function checkMinReviewers(
  config: Config,
  minRequired: number = 3
): { valid: boolean; message?: string } {
  const enabled = getEnabledReviewers(config);

  if (enabled.length < minRequired) {
    return {
      valid: false,
      message: `Insufficient reviewers: ${enabled.length} enabled, ${minRequired} required`,
    };
  }

  return { valid: true };
}

// ============================================================================
// Declarative Config Support (Phase 4)
// ============================================================================

/**
 * Check if the reviewers field uses declarative format.
 */
export function isDeclarativeReviewers(
  reviewers: Config['reviewers']
): reviewers is DeclarativeReviewers {
  return !Array.isArray(reviewers) && typeof reviewers === 'object' && 'count' in reviewers;
}

/**
 * Expand declarative reviewers config into ReviewerEntry array.
 * Static reviewers are kept as-is, remaining slots become auto reviewers.
 */
export function expandDeclarativeReviewers(
  decl: DeclarativeReviewers
): ReviewerEntry[] {
  const entries: ReviewerEntry[] = [];

  // Add static reviewers if present, truncated to count (C-2)
  const staticReviewers = (decl.static ?? []).slice(0, decl.count);
  entries.push(...staticReviewers);

  // Fill remaining slots with auto reviewers
  const remaining = decl.count - staticReviewers.length;
  for (let i = 0; i < remaining; i++) {
    entries.push({
      id: `auto-${i + 1}`,
      auto: true as const,
      enabled: true,
    });
  }

  return entries;
}

/**
 * Normalize config: if reviewers is declarative, expand to array.
 * Returns a config with reviewers always as ReviewerEntry[].
 */
export function normalizeConfig(config: Config): Config & { reviewers: ReviewerEntry[] } {
  if (isDeclarativeReviewers(config.reviewers)) {
    return {
      ...config,
      reviewers: expandDeclarativeReviewers(config.reviewers),
    };
  }
  return config as Config & { reviewers: ReviewerEntry[] };
}
