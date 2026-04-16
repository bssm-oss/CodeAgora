import { z } from "zod";
const ModelMetadataSchema = z.object({
  source: z.string(),
  modelId: z.string(),
  name: z.string(),
  tier: z.enum(["S+", "S", "A+", "A", "A-", "B+", "B", "C"]).optional(),
  context: z.string(),
  family: z.string(),
  isReasoning: z.boolean(),
  sweBench: z.string().optional(),
  aaIntelligence: z.number().optional(),
  aaSpeedTps: z.number().optional()
});
const ModelRouterConfigSchema = z.object({
  enabled: z.boolean().default(false),
  strategy: z.enum(["thompson-sampling"]).default("thompson-sampling"),
  providers: z.record(z.string(), z.object({
    enabled: z.boolean().default(true)
  })).optional(),
  constraints: z.object({
    familyDiversity: z.boolean().default(true),
    includeReasoning: z.boolean().default(true),
    minFamilies: z.number().default(3),
    reasoningMin: z.number().default(1),
    reasoningMax: z.number().default(2),
    contextMin: z.string().default("32k")
  }).optional(),
  circuitBreaker: z.object({
    failureThreshold: z.number().default(3),
    cooldownMs: z.number().default(6e4),
    maxCooldownMs: z.number().default(3e5)
  }).optional(),
  dailyBudget: z.record(z.string(), z.number()).optional(),
  explorationRate: z.number().default(0.1)
});
export {
  ModelMetadataSchema,
  ModelRouterConfigSchema
};
