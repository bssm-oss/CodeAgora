/**
 * Learned Patterns Store
 * Persists dismissed review patterns to .ca/learned-patterns.json
 */

import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { SeveritySchema } from '../types/core.js';

export const DismissedPatternSchema = z.object({
  pattern: z.string(),
  severity: SeveritySchema,
  dismissCount: z.number().int().positive(),
  lastDismissed: z.string(), // ISO date
  action: z.enum(['downgrade', 'suppress']),
});
export type DismissedPattern = z.infer<typeof DismissedPatternSchema>;

export const LearnedPatternsSchema = z.object({
  version: z.literal(1),
  dismissedPatterns: z.array(DismissedPatternSchema),
});
export type LearnedPatterns = z.infer<typeof LearnedPatternsSchema>;

/**
 * Load learned patterns from .ca/learned-patterns.json
 * Returns null if file doesn't exist or is unparseable.
 */
export async function loadLearnedPatterns(projectRoot: string): Promise<LearnedPatterns | null> {
  const filePath = path.join(projectRoot, '.ca', 'learned-patterns.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return LearnedPatternsSchema.parse(JSON.parse(content));
  } catch {
    return null;
  }
}

/**
 * Save learned patterns to .ca/learned-patterns.json
 */
export async function saveLearnedPatterns(
  projectRoot: string,
  data: LearnedPatterns,
): Promise<void> {
  const filePath = path.join(projectRoot, '.ca', 'learned-patterns.json');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Merge new patterns into existing ones.
 * Increments dismissCount for existing patterns, adds new ones.
 */
export function mergePatterns(
  existing: DismissedPattern[],
  incoming: DismissedPattern[],
): DismissedPattern[] {
  const merged = [...existing];
  for (const inc of incoming) {
    const idx = merged.findIndex((p) => p.pattern === inc.pattern);
    if (idx >= 0) {
      merged[idx] = {
        ...merged[idx]!,
        dismissCount: merged[idx]!.dismissCount + inc.dismissCount,
        lastDismissed: inc.lastDismissed,
      };
    } else {
      merged.push(inc);
    }
  }
  return merged;
}
