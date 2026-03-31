/**
 * Config Set / Config Edit Commands
 * Set config values via dot notation or open config in $EDITOR.
 */

import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import { t } from '@codeagora/shared/i18n/index.js';

// Allowlist prevents arbitrary command execution via $VISUAL/$EDITOR env injection
const SAFE_EDITORS = new Set([
  'vi', 'vim', 'nvim', 'nano', 'emacs', 'pico', 'joe', 'jed',
  'code', 'code-insiders', 'subl', 'atom', 'gedit', 'kate', 'kwrite',
  'notepad', 'notepad++', 'wordpad',
]);

function resolveEditor(raw: string): string {
  // Extract just the binary name (no args, no path traversal)
  const binaryName = path.basename(raw.split(/\s+/)[0]!);
  if (SAFE_EDITORS.has(binaryName)) return binaryName;
  process.stderr.write(
    `[codeagora] Editor "${binaryName}" is not in the allowlist. Falling back to vi.\n`,
  );
  return 'vi';
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve the config file path. Prefers JSON, falls back to YAML.
 */
async function resolveConfigPath(baseDir: string): Promise<string | null> {
  const jsonPath = path.join(baseDir, '.ca', 'config.json');
  const yamlPath = path.join(baseDir, '.ca', 'config.yaml');

  for (const p of [jsonPath, yamlPath]) {
    try {
      await fs.access(p);
      return p;
    } catch { /* continue */ }
  }
  return null;
}

/**
 * Parse a raw CLI value string into a typed value.
 * Detects booleans, numbers, and falls back to string.
 */
function parseValue(raw: string): string | number | boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  // Only accept strict decimal numbers (optional negative, integer or float)
  if (/^-?\d+(\.\d+)?$/.test(raw.trim())) {
    return Number(raw);
  }
  return raw;
}

/**
 * Set a nested key on an object using dot notation.
 * E.g. setNestedKey(obj, 'discussion.maxRounds', 5)
 */
function setNestedKey(
  obj: Record<string, unknown>,
  dotKey: string,
  value: unknown,
): void {
  const parts = dotKey.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastKey = parts[parts.length - 1]!;
  current[lastKey] = value;
}

// ============================================================================
// Public API
// ============================================================================

export async function setConfigValue(
  baseDir: string,
  key: string,
  rawValue: string,
): Promise<void> {
  const configPath = await resolveConfigPath(baseDir);
  if (!configPath) {
    throw new Error(t('cli.config.notFound', { cmd: 'agora' }));
  }

  if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
    throw new Error('YAML config editing is not yet supported. Use .ca/config.json.');
  }

  const raw = await fs.readFile(configPath, 'utf-8');
  const config = JSON.parse(raw) as Record<string, unknown>;

  const typedValue = parseValue(rawValue);
  setNestedKey(config, key, typedValue);

  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export async function editConfig(baseDir: string): Promise<void> {
  const configPath = await resolveConfigPath(baseDir);
  if (!configPath) {
    throw new Error(t('cli.config.notFound', { cmd: 'agora' }));
  }

  const rawEditor = process.env['VISUAL'] || process.env['EDITOR'] || 'vi';
  const editor = resolveEditor(rawEditor);
  const result = spawnSync(editor, [configPath], { stdio: 'inherit' });

  if (result.error) {
    throw new Error(`Failed to open editor: ${result.error.message}`);
  }
}
