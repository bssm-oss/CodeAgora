import { z } from "zod";
import { SeveritySchema } from "../types/core.js";
const RuleSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  severity: SeveritySchema,
  message: z.string(),
  suggestion: z.string().optional(),
  filePatterns: z.array(z.string()).optional()
});
const ReviewRulesSchema = z.object({
  rules: z.array(RuleSchema).min(1)
});
export {
  ReviewRulesSchema,
  RuleSchema
};
