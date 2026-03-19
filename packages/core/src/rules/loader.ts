/**
 * Custom Review Rules Loader
 * Reads and compiles .reviewrules YAML files from project root.
 */

import fs from 'fs/promises';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import { ReviewRulesSchema } from './types.js';
import type { CompiledRule } from './types.js';

const CANDIDATE_FILENAMES = ['.reviewrules', '.reviewrules.yml', '.reviewrules.yaml'];

/**
 * Load and compile review rules from project root.
 * Returns compiled rules or null if no rules file found.
 */
export async function loadReviewRules(projectRoot: string): Promise<CompiledRule[] | null> {
  let rawContent: string | null = null;

  for (const filename of CANDIDATE_FILENAMES) {
    const filePath = path.join(projectRoot, filename);
    try {
      rawContent = await fs.readFile(filePath, 'utf-8');
      break;
    } catch {
      // File not found — try next candidate
    }
  }

  if (rawContent === null) {
    return null;
  }

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = parseYaml(rawContent);
  } catch (err) {
    throw new Error(
      `Failed to parse .reviewrules file: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Validate with Zod
  const result = ReviewRulesSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid .reviewrules schema: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }

  // Compile regex patterns — warn and skip invalid ones
  const compiled: CompiledRule[] = [];
  for (const rule of result.data.rules) {
    let regex: RegExp;
    try {
      regex = new RegExp(rule.pattern);
    } catch (err) {
      console.warn(
        `[reviewrules] Skipping rule "${rule.id}": invalid regex pattern "${rule.pattern}" — ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
    compiled.push({ ...rule, regex });
  }

  return compiled;
}
