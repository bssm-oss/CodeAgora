import { z } from "zod";
import { ModelRouterConfigSchema } from "./l0.js";
const BackendSchema = z.enum([
  "opencode",
  "codex",
  "gemini",
  "claude",
  "copilot",
  "aider",
  "goose",
  "cline",
  "qwen-code",
  "vibe",
  "kiro",
  "cursor",
  "api"
]);
const FallbackSchema = z.object({
  model: z.string(),
  backend: BackendSchema,
  provider: z.string().optional()
});
const AgentConfigSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  model: z.string(),
  backend: BackendSchema,
  provider: z.string().optional(),
  persona: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  timeout: z.number().default(120),
  enabled: z.boolean().default(true),
  fallback: z.union([FallbackSchema, z.array(FallbackSchema)]).optional()
}).refine(
  (data) => data.backend !== "opencode" || data.provider !== void 0,
  {
    message: "provider is required when backend is 'opencode'",
    path: ["provider"]
  }
).refine(
  (data) => data.backend !== "api" || data.provider !== void 0,
  {
    message: "provider is required when backend is 'api'",
    path: ["provider"]
  }
);
const AutoReviewerConfigSchema = z.object({
  id: z.string(),
  auto: z.literal(true),
  label: z.string().optional(),
  persona: z.string().optional(),
  enabled: z.boolean().default(true)
});
const ReviewerEntrySchema = z.union([
  AgentConfigSchema,
  AutoReviewerConfigSchema
]);
const ReviewerConfigSchema = AgentConfigSchema;
const SupporterConfigSchema = AgentConfigSchema;
const ModeratorConfigSchema = z.object({
  backend: BackendSchema,
  model: z.string(),
  provider: z.string().optional(),
  timeout: z.number().default(120)
});
const SupporterPoolConfigSchema = z.object({
  pool: z.array(AgentConfigSchema).min(1),
  pickCount: z.number().int().positive().default(2),
  pickStrategy: z.literal("random").default("random"),
  devilsAdvocate: AgentConfigSchema,
  personaPool: z.array(z.string()).min(1),
  personaAssignment: z.literal("random").default("random")
});
const DiscussionSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  maxRounds: z.number().int().min(1).default(3),
  registrationThreshold: z.object({
    HARSHLY_CRITICAL: z.number().default(1),
    // 1명 → 즉시 등록
    CRITICAL: z.number().default(1),
    // 1명 + 서포터 1명
    WARNING: z.number().default(2),
    // 2명+
    SUGGESTION: z.null()
    // Discussion 미등록
  }),
  codeSnippetRange: z.number().default(10),
  // ±N lines
  objectionTimeout: z.number().default(60),
  maxObjectionRounds: z.number().int().min(0).default(1)
});
const ErrorHandlingSchema = z.object({
  maxRetries: z.number().default(2),
  forfeitThreshold: z.number().default(0.7)
  // 70%+ forfeit → error
});
const DeclarativeReviewersSchema = z.object({
  count: z.number().int().min(1).max(10),
  constraints: z.object({
    minFamilies: z.number().default(3),
    reasoning: z.object({
      min: z.number().default(1),
      max: z.number().default(2)
    }).optional(),
    contextMin: z.string().default("32k"),
    preferProviders: z.array(z.string()).optional()
  }).optional(),
  static: z.array(AgentConfigSchema).optional()
});
const ReviewersFieldSchema = z.union([
  z.array(ReviewerEntrySchema).min(1),
  DeclarativeReviewersSchema
]);
const NotificationsConfigSchema = z.object({
  discord: z.object({ webhookUrl: z.string().url() }).optional(),
  slack: z.object({ webhookUrl: z.string().url() }).optional(),
  autoNotify: z.boolean().optional()
});
const GitHubIntegrationSchema = z.object({
  humanReviewers: z.array(z.string()).default([]),
  humanTeams: z.array(z.string()).default([]),
  needsHumanLabel: z.string().default("needs-human-review"),
  postSuggestions: z.boolean().default(false),
  collapseDiscussions: z.boolean().default(true),
  minConfidence: z.number().min(0).max(1).optional(),
  sarifOutputPath: z.string().optional()
});
const ChunkingConfigSchema = z.object({
  maxTokens: z.number().int().positive().default(8e3)
});
const HeadConfigSchema = z.object({
  backend: BackendSchema,
  model: z.string(),
  provider: z.string().optional(),
  timeout: z.number().default(120),
  enabled: z.boolean().default(true)
});
const ReviewModeSchema = z.enum(["strict", "pragmatic"]).default("pragmatic");
const LanguageSchema = z.enum(["en", "ko"]).default("en");
const AutoApproveConfigSchema = z.object({
  enabled: z.boolean().default(false),
  maxLines: z.number().int().positive().default(5),
  allowedFilePatterns: z.array(z.string()).default(["*.md", "*.txt", "*.rst", "docs/**"])
}).optional();
const PromptsConfigSchema = z.object({
  reviewer: z.string().optional(),
  supporter: z.string().optional(),
  head: z.string().optional()
}).optional();
const ReviewContextSchema = z.object({
  /** Deployment type — tells reviewers how the project is built and deployed */
  deploymentType: z.enum([
    "github-action",
    "cli",
    "library",
    "web-app",
    "api-server",
    "lambda",
    "docker",
    "edge-function",
    "monorepo"
  ]).optional(),
  /** Free-form context lines injected into reviewer prompt */
  notes: z.array(z.string()).optional(),
  /** Files/patterns that are bundled outputs (all deps inlined, do NOT flag external issues) */
  bundledOutputs: z.array(z.string()).optional()
}).optional();
const ConfigSchema = z.object({
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
  prompts: PromptsConfigSchema,
  reviewContext: ReviewContextSchema,
  plugins: z.array(z.string()).optional()
});
function validateConfig(configJson) {
  return ConfigSchema.parse(configJson);
}
export {
  AgentConfigSchema,
  AutoApproveConfigSchema,
  AutoReviewerConfigSchema,
  BackendSchema,
  ChunkingConfigSchema,
  ConfigSchema,
  DeclarativeReviewersSchema,
  DiscussionSettingsSchema,
  ErrorHandlingSchema,
  FallbackSchema,
  GitHubIntegrationSchema,
  HeadConfigSchema,
  LanguageSchema,
  ModeratorConfigSchema,
  NotificationsConfigSchema,
  PromptsConfigSchema,
  ReviewContextSchema,
  ReviewModeSchema,
  ReviewerConfigSchema,
  ReviewerEntrySchema,
  ReviewersFieldSchema,
  SupporterConfigSchema,
  SupporterPoolConfigSchema,
  validateConfig
};
