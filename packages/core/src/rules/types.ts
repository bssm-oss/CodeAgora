/**
 * Custom Review Rules Types
 */

import { z } from 'zod';
import { SeveritySchema } from '../types/core.js';

export const RuleSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  severity: SeveritySchema,
  message: z.string(),
  filePatterns: z.array(z.string()).optional(),
});
export type Rule = z.infer<typeof RuleSchema>;

export const ReviewRulesSchema = z.object({
  rules: z.array(RuleSchema).min(1),
});
export type ReviewRules = z.infer<typeof ReviewRulesSchema>;

export interface CompiledRule extends Rule {
  regex: RegExp;
}
