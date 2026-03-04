/**
 * V3 Configuration Schema
 * Based on V3_DESIGN.md config structure
 */

import { z } from 'zod';

// ============================================================================
// Backend Types
// ============================================================================

export const BackendSchema = z.enum(['opencode', 'codex', 'gemini', 'claude', 'api']);
export type Backend = z.infer<typeof BackendSchema>;

// ============================================================================
// Agent Config (Unified for Reviewers, Supporters, Moderator)
// ============================================================================

export const AgentConfigSchema = z
  .object({
    id: z.string(),
    label: z.string().optional(),
    model: z.string(),
    backend: BackendSchema,
    provider: z.string().optional(),
    persona: z.string().optional(),
    timeout: z.number().default(120),
    enabled: z.boolean().default(true),
  })
  .refine(
    (data) => data.backend !== 'opencode' || data.provider !== undefined,
    {
      message: "provider is required when backend is 'opencode'",
      path: ['provider'],
    }
  )
  .refine(
    (data) => data.backend !== 'api' || data.provider !== undefined,
    {
      message: "provider is required when backend is 'api'",
      path: ['provider'],
    }
  );
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ============================================================================
// Legacy Schemas (for backward compatibility during migration)
// ============================================================================

export const ReviewerConfigSchema = AgentConfigSchema;
export type ReviewerConfig = AgentConfig;

export const SupporterConfigSchema = AgentConfigSchema;
export type SupporterConfig = AgentConfig;

export const ModeratorConfigSchema = z.object({
  backend: BackendSchema,
  model: z.string(),
});
export type ModeratorConfig = z.infer<typeof ModeratorConfigSchema>;

// ============================================================================
// Supporter Pool Config
// ============================================================================

export const SupporterPoolConfigSchema = z.object({
  pool: z.array(AgentConfigSchema).min(1),
  pickCount: z.number().int().positive().default(2),
  pickStrategy: z.enum(['random', 'round-robin']).default('random'),
  devilsAdvocate: AgentConfigSchema,
  personaPool: z.array(z.string()).min(1),
  personaAssignment: z.enum(['random', 'fixed']).default('random'),
});
export type SupporterPoolConfig = z.infer<typeof SupporterPoolConfigSchema>;

// ============================================================================
// Discussion Settings
// ============================================================================

export const DiscussionSettingsSchema = z.object({
  maxRounds: z.number().default(3),
  registrationThreshold: z.object({
    HARSHLY_CRITICAL: z.number().default(1), // 1명 → 즉시 등록
    CRITICAL: z.number().default(1), // 1명 + 서포터 1명
    WARNING: z.number().default(2), // 2명+
    SUGGESTION: z.null(), // Discussion 미등록
  }),
  codeSnippetRange: z.number().default(10), // ±N lines
});
export type DiscussionSettings = z.infer<typeof DiscussionSettingsSchema>;

// ============================================================================
// Error Handling Settings
// ============================================================================

export const ErrorHandlingSchema = z.object({
  maxRetries: z.number().default(2),
  forfeitThreshold: z.number().default(0.7), // 70%+ forfeit → error
});
export type ErrorHandling = z.infer<typeof ErrorHandlingSchema>;

// ============================================================================
// Full Config Schema
// ============================================================================

export const ConfigSchema = z.object({
  reviewers: z.array(AgentConfigSchema).min(1),
  supporters: SupporterPoolConfigSchema,
  moderator: ModeratorConfigSchema,
  discussion: DiscussionSettingsSchema,
  errorHandling: ErrorHandlingSchema,
});
export type Config = z.infer<typeof ConfigSchema>;

// ============================================================================
// Config Loader
// ============================================================================

export function validateConfig(configJson: unknown): Config {
  return ConfigSchema.parse(configJson);
}
