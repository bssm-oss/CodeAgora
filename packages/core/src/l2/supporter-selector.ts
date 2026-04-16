/**
 * L2 Supporter Selection
 * Handles supporter pool selection, random persona assignment, and persona loading.
 */

import type { SupporterPoolConfig, AgentConfig } from '../types/config.js';
import { readFile } from 'fs/promises';
import path from 'path';
import { validateDiffPath } from '@codeagora/shared/utils/path-validation.js';

// ============================================================================
// Supporter Selection
// ============================================================================

export interface SelectedSupporter extends AgentConfig {
  assignedPersona?: string;
}

/**
 * Select supporters from pool with random persona assignment
 */
export function selectSupporters(
  poolConfig: SupporterPoolConfig
): SelectedSupporter[] {
  const { pool, pickCount, devilsAdvocate, personaPool } = poolConfig;

  // Filter enabled supporters from pool
  const enabledPool = pool.filter((s) => s.enabled);

  if (enabledPool.length < pickCount) {
    throw new Error(
      `Insufficient enabled supporters: ${enabledPool.length} available, ${pickCount} required`
    );
  }

  // Random pick without duplicates
  const selectedFromPool = randomPick(enabledPool, pickCount);

  // Assign random personas to selected supporters
  const withPersonas = selectedFromPool.map((supporter) => ({
    ...supporter,
    assignedPersona: randomElement(personaPool),
  }));

  // Add Devil's Advocate (with its fixed persona if set)
  const supporters: SelectedSupporter[] = [];

  if (devilsAdvocate.enabled) {
    supporters.push({
      ...devilsAdvocate,
      assignedPersona: devilsAdvocate.persona,
    });
  }

  supporters.push(...withPersonas);

  return supporters;
}

/**
 * Random pick N elements from array without duplicates (Fisher-Yates)
 */
function randomPick<T>(array: T[], count: number): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

/**
 * Random pick one element from array
 */
function randomElement<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[Math.floor(Math.random() * array.length)];
}

// ============================================================================
// Persona Loading
// ============================================================================

/**
 * Load persona file content.
 * Uses validateDiffPath for robust path traversal prevention
 * (null byte check, ".." segment detection, allowed-root containment).
 */
export async function loadPersona(personaPath: string): Promise<string> {
  try {
    // Built-in persona: "builtin:security", "builtin:logic", etc.
    if (personaPath.startsWith('builtin:')) {
      const { getBuiltinPersona } = await import('../l1/builtin-personas.js');
      const content = getBuiltinPersona(personaPath.slice(8));
      if (content) return content;
      console.warn(`[Persona] Unknown built-in persona: ${personaPath.slice(8)}`);
      return '';
    }

    // Inline text: if it doesn't look like a file path, use it directly
    if (!personaPath.includes('/') && !personaPath.includes('\\') && !personaPath.endsWith('.md') && !personaPath.endsWith('.txt')) {
      return personaPath.trim();
    }

    // Block absolute paths explicitly before validation
    if (path.isAbsolute(personaPath)) {
      console.warn(`[Persona] Absolute path blocked: ${personaPath}`);
      return '';
    }

    // Validate using shared utility — checks null bytes, "..", and containment
    const projectRoot = process.cwd();
    const result = validateDiffPath(personaPath, { allowedRoots: [projectRoot] });
    if (!result.success) {
      console.warn(`[Persona] Path validation failed: ${result.error}`);
      return '';
    }

    const content = await readFile(result.data, 'utf-8');
    return content.trim();
  } catch (error) {
    console.warn(`[Persona] Failed to load ${personaPath}:`, error instanceof Error ? error.message : error);
    return '';
  }
}
