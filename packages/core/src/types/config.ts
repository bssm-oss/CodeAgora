/**
 * V3 Configuration Schema
 * Based on V3_DESIGN.md config structure
 */

import { z } from 'zod';
import { ModelRouterConfigSchema } from './l0.js';

// ============================================================================
// Backend Types
// ============================================================================

export const BackendSchema = z.enum(['opencode', 'codex', 'gemini', 'claude', 'copilot', 'api']);
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
    fallback: z
      .object({
        model: z.string(),
        backend: BackendSchema,
        provider: z.string().optional(),
      })
      .optional(),
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

// ============================================================================
// Auto Reviewer Config (L0 dynamically assigns model)
// ============================================================================

export const AutoReviewerConfigSchema = z.object({
  id: z.string(),
  auto: z.literal(true),
  label: z.string().optional(),
  persona: z.string().optional(),
  enabled: z.boolean().default(true),
});
export type AutoReviewerConfig = z.infer<typeof AutoReviewerConfigSchema>;

export const ReviewerEntrySchema = z.union([
  AgentConfigSchema,
  AutoReviewerConfigSchema,
]);
export type ReviewerEntry = z.infer<typeof ReviewerEntrySchema>;

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
  provider: z.string().optional(),
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
// Declarative Reviewers Config (Phase 4)
// ============================================================================

export const DeclarativeReviewersSchema = z.object({
  count: z.number().int().min(1).max(10),
  constraints: z
    .object({
      minFamilies: z.number().default(3),
      reasoning: z
        .object({
          min: z.number().default(1),
          max: z.number().default(2),
        })
        .optional(),
      contextMin: z.string().default('32k'),
      tierMin: z.string().default('B'),
      preferProviders: z.array(z.string()).optional(),
    })
    .optional(),
  static: z.array(AgentConfigSchema).optional(),
});
export type DeclarativeReviewers = z.infer<typeof DeclarativeReviewersSchema>;

export const ReviewersFieldSchema = z.union([
  z.array(ReviewerEntrySchema).min(1),
  DeclarativeReviewersSchema,
]);
export type ReviewersField = z.infer<typeof ReviewersFieldSchema>;

// ============================================================================
// Full Config Schema
// ============================================================================

export const NotificationsConfigSchema = z.object({
  discord: z.object({ webhookUrl: z.string().url() }).optional(),
  slack: z.object({ webhookUrl: z.string().url() }).optional(),
  autoNotify: z.boolean().optional(),
});
export type NotificationsConfig = z.infer<typeof NotificationsConfigSchema>;

export const GitHubIntegrationSchema = z.object({
  humanReviewers: z.array(z.string()).default([]),
  humanTeams: z.array(z.string()).default([]),
  needsHumanLabel: z.string().default('needs-human-review'),
  postSuggestions: z.boolean().default(false),
  collapseDiscussions: z.boolean().default(true),
  sarifOutputPath: z.string().optional(),
});
export type GitHubIntegrationConfig = z.infer<typeof GitHubIntegrationSchema>;

export const ChunkingConfigSchema = z.object({
  maxTokens: z.number().int().positive().default(8000),
});
export type ChunkingConfig = z.infer<typeof ChunkingConfigSchema>;

export const HeadConfigSchema = z.object({
  backend: BackendSchema,
  model: z.string(),
  provider: z.string().optional(),
  enabled: z.boolean().default(true),
});
export type HeadConfig = z.infer<typeof HeadConfigSchema>;

export const ReviewModeSchema = z.enum(['strict', 'pragmatic']).default('pragmatic');
export type ReviewMode = z.infer<typeof ReviewModeSchema>;

export const LanguageSchema = z.enum(['en', 'ko']).default('en');
export type Language = z.infer<typeof LanguageSchema>;

export const AutoApproveConfigSchema = z.object({
  enabled: z.boolean().default(false),
  maxLines: z.number().int().positive().default(5),
  allowedFilePatterns: z.array(z.string()).default(['*.md', '*.txt', '*.rst', 'docs/**']),
}).optional();
export type AutoApproveConfig = z.infer<typeof AutoApproveConfigSchema>;

export const ConfigSchema = z.object({
  mode: ReviewModeSchema.optional(),
  language: LanguageSchema.optional(),
  reviewers: ReviewersFieldSchema,
  supporters: SupporterPoolConfigSchema,
  moderator: ModeratorConfigSchema,
  head: HeadConfigSchema.optional(),
  discussion: DiscussionSettingsSchema,
  errorHandling: ErrorHandlingSchema,
  chunking: ChunkingConfigSchema.optional(),
  modelRouter: ModelRouterConfigSchema.optional(),
  notifications: NotificationsConfigSchema.optional(),
  github: GitHubIntegrationSchema.optional(),
  autoApprove: AutoApproveConfigSchema,
  plugins: z.array(z.string()).optional(),
});
export type Config = z.infer<typeof ConfigSchema>;

// ============================================================================
// Config Loader
// ============================================================================

export function validateConfig(configJson: unknown): Config {
  return ConfigSchema.parse(configJson);
}
