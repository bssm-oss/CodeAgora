// src/server/index.ts
import { Hono as Hono6 } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

// src/server/routes/sessions.ts
import { Hono } from "hono";
import path2 from "path";

// src/server/utils/fs-helpers.ts
import { readdir, readFile } from "fs/promises";
async function readdirSafe(dirPath) {
  try {
    return await readdir(dirPath);
  } catch {
    return [];
  }
}
async function readFileSafe(filePath) {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}
async function readJsonSafe(filePath) {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// ../shared/src/utils/path-validation.ts
import path from "path";

// ../shared/src/types/result.ts
function ok(data) {
  return { success: true, data };
}
function err(error) {
  return { success: false, error };
}

// ../shared/src/utils/path-validation.ts
function validateDiffPath(diffPath, options) {
  if (diffPath === "") {
    return err("Path must not be empty");
  }
  if (diffPath.includes("\0")) {
    return err("Path must not contain null bytes");
  }
  const parts = diffPath.split(/[\\/]/);
  if (parts.includes("..")) {
    return err(`Path traversal detected: "${diffPath}" contains ".." segments`);
  }
  const resolved = path.resolve(diffPath);
  if (options?.allowedRoots !== void 0) {
    const roots = options.allowedRoots;
    if (roots.length === 0) {
      return err("No allowed roots configured; all paths are rejected");
    }
    const isUnderAllowedRoot = roots.some((root) => {
      const normalizedRoot = path.resolve(root);
      return resolved === normalizedRoot || resolved.startsWith(normalizedRoot + path.sep);
    });
    if (!isUnderAllowedRoot) {
      return err(
        `Path "${resolved}" is not under any allowed root: ${roots.join(", ")}`
      );
    }
  }
  return ok(resolved);
}

// src/server/routes/sessions.ts
var CA_ROOT = ".ca";
var sessionRoutes = new Hono();
sessionRoutes.get("/", async (c) => {
  const sessionsDir = path2.join(CA_ROOT, "sessions");
  const dateDirs = await readdirSafe(sessionsDir);
  const sessions = [];
  for (const dateDir of dateDirs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDir)) continue;
    const datePath = path2.join(sessionsDir, dateDir);
    const sessionIds = await readdirSafe(datePath);
    for (const sessionId of sessionIds) {
      if (!/^\d{3}$/.test(sessionId)) continue;
      const metadataPath = path2.join(datePath, sessionId, "metadata.json");
      const metadata = await readJsonSafe(metadataPath);
      if (metadata) {
        sessions.push(metadata);
      }
    }
  }
  return c.json(sessions);
});
sessionRoutes.get("/:date/:id", async (c) => {
  const { date, id } = c.req.param();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{3}$/.test(id)) {
    return c.json({ error: "Invalid session identifier" }, 400);
  }
  const sessionDir = path2.join(CA_ROOT, "sessions", date, id);
  const metadata = await readJsonSafe(path2.join(sessionDir, "metadata.json"));
  if (!metadata) {
    return c.json({ error: "Session not found" }, 404);
  }
  const reviews = await loadSessionReviews(sessionDir);
  const discussions = await loadSessionDiscussions(sessionDir);
  const rounds = await loadSessionRounds(sessionDir);
  const verdict = await readJsonSafe(path2.join(sessionDir, "head-verdict.json")) ?? await readJsonSafe(path2.join(sessionDir, "verdict.json"));
  let diff = "";
  if (metadata.diffPath) {
    const validation = validateDiffPath(metadata.diffPath, {
      allowedRoots: [path2.resolve(CA_ROOT), path2.resolve(process.cwd())]
    });
    if (validation.success) {
      diff = await readFileSafe(validation.data) ?? "";
    }
  }
  return c.json({ metadata, reviews, discussions, rounds, verdict, diff });
});
sessionRoutes.get("/:date/:id/reviews", async (c) => {
  const { date, id } = c.req.param();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{3}$/.test(id)) {
    return c.json({ error: "Invalid session identifier" }, 400);
  }
  const sessionDir = path2.join(CA_ROOT, "sessions", date, id);
  const reviews = await loadSessionReviews(sessionDir);
  return c.json(reviews);
});
sessionRoutes.get("/:date/:id/discussions", async (c) => {
  const { date, id } = c.req.param();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{3}$/.test(id)) {
    return c.json({ error: "Invalid session identifier" }, 400);
  }
  const sessionDir = path2.join(CA_ROOT, "sessions", date, id);
  const discussions = await loadSessionDiscussions(sessionDir);
  return c.json(discussions);
});
sessionRoutes.get("/:date/:id/verdict", async (c) => {
  const { date, id } = c.req.param();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{3}$/.test(id)) {
    return c.json({ error: "Invalid session identifier" }, 400);
  }
  const sessionDir = path2.join(CA_ROOT, "sessions", date, id);
  const verdict = await readJsonSafe(path2.join(sessionDir, "head-verdict.json")) ?? await readJsonSafe(path2.join(sessionDir, "verdict.json"));
  if (!verdict) {
    return c.json({ error: "Verdict not found" }, 404);
  }
  return c.json(verdict);
});
async function loadSessionReviews(sessionDir) {
  const reviewsDir = path2.join(sessionDir, "reviews");
  const files = await readdirSafe(reviewsDir);
  const reviews = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const data = await readJsonSafe(path2.join(reviewsDir, file));
    if (data) reviews.push(data);
  }
  return reviews;
}
async function loadSessionDiscussions(sessionDir) {
  const discussionsDir = path2.join(sessionDir, "discussions");
  const entries = await readdirSafe(discussionsDir);
  const discussions = [];
  for (const entry of entries) {
    const entryPath = path2.join(discussionsDir, entry);
    if (entry.endsWith(".json")) {
      const data = await readJsonSafe(entryPath);
      if (data) discussions.push(data);
      continue;
    }
    if (entry.includes(".")) continue;
    const subFiles = await readdirSafe(entryPath);
    if (subFiles.length === 0) continue;
    const disc = { discussionId: entry };
    if (subFiles.includes("verdict.md")) {
      const content = await readFileSafe(path2.join(entryPath, "verdict.md"));
      if (content) {
        const severity = content.match(/\*\*Final Severity:\*\*\s*(\w+)/)?.[1] ?? "WARNING";
        const consensus = content.match(/\*\*Consensus Reached:\*\*\s*(Yes|No)/)?.[1] === "Yes";
        const rounds = parseInt(content.match(/\*\*Rounds:\*\*\s*(\d+)/)?.[1] ?? "0", 10);
        const reasoning = content.match(/## Reasoning\n([\s\S]*?)$/)?.[1]?.trim() ?? "";
        Object.assign(disc, { finalSeverity: severity, consensusReached: consensus, rounds, reasoning });
      }
    } else {
      const roundFiles = subFiles.filter((f) => /^round-\d+\.md$/.test(f));
      Object.assign(disc, { finalSeverity: "WARNING", consensusReached: false, rounds: roundFiles.length });
    }
    discussions.push(disc);
  }
  return discussions;
}
function parseRoundMarkdown(content) {
  const roundMatch = content.match(/^# Round (\d+)/m);
  const round = roundMatch ? parseInt(roundMatch[1], 10) : 0;
  const promptMatch = content.match(/## Moderator Prompt\n([\s\S]*?)(?=\n## |$)/);
  const moderatorPrompt = promptMatch?.[1]?.trim() ?? "";
  const supporterResponses = [];
  const supporterRegex = /### (\S+) \((\w+)\)\n([\s\S]*?)(?=\n### |\n## |$)/g;
  let m;
  while ((m = supporterRegex.exec(content)) !== null) {
    const stance = m[2].toLowerCase();
    supporterResponses.push({
      supporterId: m[1],
      stance: ["agree", "disagree"].includes(stance) ? stance : "neutral",
      response: m[3].trim()
    });
  }
  return { round, moderatorPrompt, supporterResponses };
}
async function loadSessionRounds(sessionDir) {
  const discussionsDir = path2.join(sessionDir, "discussions");
  const entries = await readdirSafe(discussionsDir);
  const rounds = {};
  for (const entry of entries) {
    if (entry.includes(".")) continue;
    const entryPath = path2.join(discussionsDir, entry);
    const subFiles = await readdirSafe(entryPath);
    const roundFiles = subFiles.filter((f) => /^round-\d+\.md$/.test(f)).sort();
    if (roundFiles.length === 0) continue;
    const parsed = [];
    for (const rf of roundFiles) {
      const content = await readFileSafe(path2.join(entryPath, rf));
      if (content) parsed.push(parseRoundMarkdown(content));
    }
    rounds[entry] = parsed;
  }
  return rounds;
}

// src/server/routes/models.ts
import { Hono as Hono2 } from "hono";
import { readFile as readFile2 } from "fs/promises";
import path3 from "path";
var CA_ROOT2 = ".ca";
var MODEL_QUALITY_PATH = path3.join(CA_ROOT2, "model-quality.json");
var modelRoutes = new Hono2();
modelRoutes.get("/", async (c) => {
  const data = await loadBanditData();
  if (!data) {
    return c.json({ arms: [], historySummary: { totalReviews: 0 }, status: "no_data" });
  }
  const arms = Object.entries(data.arms).map(([modelId, arm]) => ({
    modelId,
    ...arm,
    winRate: arm.alpha / (arm.alpha + arm.beta)
  }));
  return c.json({
    arms,
    historySummary: {
      totalReviews: data.history.length,
      lastUpdated: data.lastUpdated
    },
    status: "ok"
  });
});
modelRoutes.get("/history", async (c) => {
  const data = await loadBanditData();
  if (!data) {
    return c.json({ history: [] });
  }
  return c.json({ history: data.history });
});
async function loadBanditData() {
  try {
    const content = await readFile2(MODEL_QUALITY_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// src/server/routes/config.ts
import { Hono as Hono3 } from "hono";
import { readFile as readFile3, writeFile } from "fs/promises";
import path4 from "path";

// ../core/src/types/config.ts
import { z as z2 } from "zod";

// ../core/src/types/l0.ts
import { z } from "zod";
var ModelMetadataSchema = z.object({
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
var ModelRouterConfigSchema = z.object({
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

// ../core/src/types/config.ts
var BackendSchema = z2.enum([
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
var FallbackSchema = z2.object({
  model: z2.string(),
  backend: BackendSchema,
  provider: z2.string().optional()
});
var AgentConfigSchema = z2.object({
  id: z2.string(),
  label: z2.string().optional(),
  model: z2.string(),
  backend: BackendSchema,
  provider: z2.string().optional(),
  persona: z2.string().optional(),
  temperature: z2.number().min(0).max(2).optional(),
  timeout: z2.number().default(120),
  enabled: z2.boolean().default(true),
  fallback: z2.union([FallbackSchema, z2.array(FallbackSchema)]).optional()
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
var AutoReviewerConfigSchema = z2.object({
  id: z2.string(),
  auto: z2.literal(true),
  label: z2.string().optional(),
  persona: z2.string().optional(),
  enabled: z2.boolean().default(true)
});
var ReviewerEntrySchema = z2.union([
  AgentConfigSchema,
  AutoReviewerConfigSchema
]);
var ModeratorConfigSchema = z2.object({
  backend: BackendSchema,
  model: z2.string(),
  provider: z2.string().optional(),
  timeout: z2.number().default(120)
});
var SupporterPoolConfigSchema = z2.object({
  pool: z2.array(AgentConfigSchema).min(1),
  pickCount: z2.number().int().positive().default(2),
  pickStrategy: z2.literal("random").default("random"),
  devilsAdvocate: AgentConfigSchema,
  personaPool: z2.array(z2.string()).min(1),
  personaAssignment: z2.literal("random").default("random")
});
var DiscussionSettingsSchema = z2.object({
  enabled: z2.boolean().default(true),
  maxRounds: z2.number().int().min(1).default(3),
  registrationThreshold: z2.object({
    HARSHLY_CRITICAL: z2.number().default(1),
    // 1명 → 즉시 등록
    CRITICAL: z2.number().default(1),
    // 1명 + 서포터 1명
    WARNING: z2.number().default(2),
    // 2명+
    SUGGESTION: z2.null()
    // Discussion 미등록
  }),
  codeSnippetRange: z2.number().default(10),
  // ±N lines
  objectionTimeout: z2.number().default(60),
  maxObjectionRounds: z2.number().int().min(0).default(1)
});
var ErrorHandlingSchema = z2.object({
  maxRetries: z2.number().default(2),
  forfeitThreshold: z2.number().default(0.7)
  // 70%+ forfeit → error
});
var DeclarativeReviewersSchema = z2.object({
  count: z2.number().int().min(1).max(10),
  constraints: z2.object({
    minFamilies: z2.number().default(3),
    reasoning: z2.object({
      min: z2.number().default(1),
      max: z2.number().default(2)
    }).optional(),
    contextMin: z2.string().default("32k"),
    preferProviders: z2.array(z2.string()).optional()
  }).optional(),
  static: z2.array(AgentConfigSchema).optional()
});
var ReviewersFieldSchema = z2.union([
  z2.array(ReviewerEntrySchema).min(1),
  DeclarativeReviewersSchema
]);
var NotificationsConfigSchema = z2.object({
  discord: z2.object({ webhookUrl: z2.string().url() }).optional(),
  slack: z2.object({ webhookUrl: z2.string().url() }).optional(),
  autoNotify: z2.boolean().optional()
});
var GitHubIntegrationSchema = z2.object({
  humanReviewers: z2.array(z2.string()).default([]),
  humanTeams: z2.array(z2.string()).default([]),
  needsHumanLabel: z2.string().default("needs-human-review"),
  postSuggestions: z2.boolean().default(false),
  collapseDiscussions: z2.boolean().default(true),
  minConfidence: z2.number().min(0).max(1).optional(),
  sarifOutputPath: z2.string().optional()
});
var ChunkingConfigSchema = z2.object({
  maxTokens: z2.number().int().positive().default(8e3)
});
var HeadConfigSchema = z2.object({
  backend: BackendSchema,
  model: z2.string(),
  provider: z2.string().optional(),
  timeout: z2.number().default(120),
  enabled: z2.boolean().default(true)
});
var ReviewModeSchema = z2.enum(["strict", "pragmatic"]).default("pragmatic");
var LanguageSchema = z2.enum(["en", "ko"]).default("en");
var AutoApproveConfigSchema = z2.object({
  enabled: z2.boolean().default(false),
  maxLines: z2.number().int().positive().default(5),
  allowedFilePatterns: z2.array(z2.string()).default(["*.md", "*.txt", "*.rst", "docs/**"])
}).optional();
var PromptsConfigSchema = z2.object({
  reviewer: z2.string().optional(),
  supporter: z2.string().optional(),
  head: z2.string().optional()
}).optional();
var ConfigSchema = z2.object({
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
  plugins: z2.array(z2.string()).optional()
});

// src/server/routes/config.ts
var CA_ROOT3 = ".ca";
var configRoutes = new Hono3();
configRoutes.get("/", async (c) => {
  const config = await loadConfig();
  if (!config) {
    return c.json({ error: "No configuration file found" }, 404);
  }
  if (typeof config === "object" && "_format" in config && config["_format"] === "yaml") {
    return c.json(
      { error: "YAML config editing is not yet supported in the dashboard. Use .ca/config.json instead." },
      501
    );
  }
  return c.json(config);
});
configRoutes.put("/", async (c) => {
  const body = await c.req.json();
  const result = ConfigSchema.safeParse(body);
  if (!result.success) {
    return c.json(
      { error: "Invalid configuration", details: result.error.issues },
      400
    );
  }
  const configPath = await getExistingConfigPath();
  if (configPath?.endsWith(".yaml") || configPath?.endsWith(".yml")) {
    return c.json(
      { error: "YAML config editing is not yet supported. Use .ca/config.json instead." },
      501
    );
  }
  const targetPath = configPath ?? path4.join(CA_ROOT3, "config.json");
  await writeFile(targetPath, JSON.stringify(result.data, null, 2), "utf-8");
  return c.json({ status: "saved" });
});
async function getExistingConfigPath() {
  const jsonPath = path4.join(CA_ROOT3, "config.json");
  const yamlPath = path4.join(CA_ROOT3, "config.yaml");
  try {
    await readFile3(jsonPath, "utf-8");
    return jsonPath;
  } catch {
  }
  try {
    await readFile3(yamlPath, "utf-8");
    return yamlPath;
  } catch {
  }
  return null;
}
async function loadConfig() {
  const jsonPath = path4.join(CA_ROOT3, "config.json");
  const yamlPath = path4.join(CA_ROOT3, "config.yaml");
  try {
    const content = await readFile3(jsonPath, "utf-8");
    return JSON.parse(content);
  } catch {
  }
  try {
    await readFile3(yamlPath, "utf-8");
    return { _format: "yaml" };
  } catch {
    return null;
  }
}

// src/server/routes/costs.ts
import { Hono as Hono4 } from "hono";
import { readFile as readFile4 } from "fs/promises";
import path5 from "path";
var CA_ROOT4 = ".ca";
var costRoutes = new Hono4();
costRoutes.get("/", async (c) => {
  const sessionsDir = path5.join(CA_ROOT4, "sessions");
  const dateDirs = await readdirSafe(sessionsDir);
  const sessionCosts = [];
  let totalCost = 0;
  const perReviewerCosts = {};
  const perLayerCosts = {};
  for (const dateDir of dateDirs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDir)) continue;
    const datePath = path5.join(sessionsDir, dateDir);
    const sessionIds = await readdirSafe(datePath);
    for (const sessionId of sessionIds) {
      if (!/^\d{3}$/.test(sessionId)) continue;
      const reportPath = path5.join(datePath, sessionId, "report.json");
      const report = await readJsonSafe(reportPath);
      if (!report) continue;
      const cost = extractCosts(report, dateDir, sessionId);
      sessionCosts.push(cost);
      totalCost += cost.totalCost;
      for (const [reviewer, amount] of Object.entries(cost.reviewerCosts)) {
        perReviewerCosts[reviewer] = (perReviewerCosts[reviewer] ?? 0) + amount;
      }
      for (const [layer, amount] of Object.entries(cost.layerCosts)) {
        perLayerCosts[layer] = (perLayerCosts[layer] ?? 0) + amount;
      }
    }
  }
  return c.json({
    totalCost,
    sessionCount: sessionCosts.length,
    sessions: sessionCosts,
    perReviewerCosts,
    perLayerCosts
  });
});
costRoutes.get("/pricing", async (c) => {
  try {
    const pricingPath = path5.join(process.cwd(), "packages", "shared", "src", "data", "pricing.json");
    const content = await readFile4(pricingPath, "utf-8");
    return c.json(JSON.parse(content));
  } catch {
    return c.json({ error: "Pricing data not found" }, 404);
  }
});
function extractCosts(report, date, sessionId) {
  const costs = report["costs"];
  const reviewerCosts = {};
  const layerCosts = {};
  let totalCost = 0;
  if (costs && typeof costs === "object") {
    const total = costs["total"];
    if (typeof total === "number") {
      totalCost = total;
    }
    const byReviewer = costs["byReviewer"];
    if (byReviewer && typeof byReviewer === "object") {
      for (const [key, value] of Object.entries(byReviewer)) {
        if (typeof value === "number") {
          reviewerCosts[key] = value;
        }
      }
    }
    const byLayer = costs["byLayer"];
    if (byLayer && typeof byLayer === "object") {
      for (const [key, value] of Object.entries(byLayer)) {
        if (typeof value === "number") {
          layerCosts[key] = value;
        }
      }
    }
  }
  return { date, sessionId, totalCost, reviewerCosts, layerCosts };
}

// src/server/routes/health.ts
import { Hono as Hono5 } from "hono";
var startTime = Date.now();
var healthRoutes = new Hono5();
healthRoutes.get("/", (c) => {
  return c.json({
    status: "ok",
    version: "2.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1e3)
  });
});

// src/server/middleware.ts
import crypto from "crypto";
var DASHBOARD_TOKEN = process.env["CODEAGORA_DASHBOARD_TOKEN"] ?? crypto.randomBytes(32).toString("hex");
function getAuthToken() {
  return DASHBOARD_TOKEN;
}
function compareTokens(received, expected) {
  if (!received) return false;
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
async function authMiddleware(c, next) {
  if (c.req.path === "/api/health") {
    await next();
    return;
  }
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return c.json({ error: "Authentication required" }, 401);
  }
  if (!compareTokens(token, DASHBOARD_TOKEN)) {
    return c.json({ error: "Invalid token" }, 403);
  }
  await next();
}
async function securityHeaders(c, next) {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "0");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
  );
  await next();
}
var requestCounts = /* @__PURE__ */ new Map();
async function rateLimiter(c, next) {
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "local";
  const now = Date.now();
  const entry = requestCounts.get(ip);
  const isWrite = c.req.method === "PUT" || c.req.method === "POST" || c.req.method === "DELETE";
  const limit = isWrite ? 10 : 100;
  const windowMs = 6e4;
  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count++;
    if (entry.count > limit) {
      return c.json({ error: "Rate limit exceeded" }, 429);
    }
  }
  await next();
}
async function corsMiddleware(c, next) {
  const origin = c.req.header("Origin") ?? "";
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (isLocalhost) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    c.header("Access-Control-Max-Age", "86400");
  }
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  await next();
  return c.res;
}
async function errorHandler(c, next) {
  try {
    await next();
    return c.res;
  } catch (error) {
    const isDev = process.env["NODE_ENV"] === "development";
    const message = isDev && error instanceof Error ? error.message : "Internal server error";
    const status = error.status ?? 500;
    return c.json({ error: message }, status);
  }
}

// src/server/ws.ts
import { createNodeWebSocket } from "@hono/node-ws";
var MAX_CONNECTIONS = 50;
var activeConnections = 0;
var progressEmitter = null;
var discussionEmitter = null;
function setEmitters(progress, discussion) {
  progressEmitter = progress;
  discussionEmitter = discussion;
}
function setupWebSocket(app) {
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
  app.get("/ws", (c, next) => {
    const origin = c.req.header("Origin") ?? "";
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (origin && !isLocalhost) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const queryToken = c.req.query("token");
    const authHeader = c.req.header("Authorization");
    const headerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const token = queryToken ?? headerToken;
    if (!compareTokens(token, getAuthToken())) {
      return c.json({ error: "Authentication required" }, 401);
    }
    if (activeConnections >= MAX_CONNECTIONS) {
      return c.json({ error: "Too many connections" }, 503);
    }
    return next();
  });
  app.get(
    "/ws",
    upgradeWebSocket(() => {
      let progressListener = null;
      let discussionListener = null;
      return {
        onOpen(_event, ws) {
          activeConnections++;
          if (progressEmitter) {
            progressListener = (event) => {
              try {
                ws.send(JSON.stringify({ type: "progress", data: event }));
              } catch {
              }
            };
            progressEmitter.onProgress(progressListener);
          }
          if (discussionEmitter) {
            discussionListener = (event) => {
              try {
                ws.send(JSON.stringify({ type: "discussion", data: event }));
              } catch {
              }
            };
            discussionEmitter.on("*", discussionListener);
          }
        },
        onClose() {
          activeConnections = Math.max(0, activeConnections - 1);
          if (progressEmitter && progressListener) {
            progressEmitter.removeListener("progress", progressListener);
          }
          if (discussionEmitter && discussionListener) {
            discussionEmitter.removeListener("*", discussionListener);
          }
          progressListener = null;
          discussionListener = null;
        },
        onError() {
          activeConnections = Math.max(0, activeConnections - 1);
          if (progressEmitter && progressListener) {
            progressEmitter.removeListener("progress", progressListener);
          }
          if (discussionEmitter && discussionListener) {
            discussionEmitter.removeListener("*", discussionListener);
          }
          progressListener = null;
          discussionListener = null;
        }
      };
    })
  );
  return { injectWebSocket };
}

// src/server/index.ts
function createApp() {
  const app = new Hono6();
  app.use("*", securityHeaders);
  app.use("*", corsMiddleware);
  app.use("*", errorHandler);
  app.use("/api/*", rateLimiter);
  app.use("/api/*", authMiddleware);
  app.route("/api/health", healthRoutes);
  app.route("/api/sessions", sessionRoutes);
  app.route("/api/models", modelRoutes);
  app.route("/api/config", configRoutes);
  app.route("/api/costs", costRoutes);
  app.use(
    "/*",
    serveStatic({ root: "./dist/frontend" })
  );
  app.get("*", serveStatic({ path: "./dist/frontend/index.html" }));
  return app;
}
function startServer(options = {}) {
  const port = options.port ?? (Number(process.env["PORT"]) || 6274);
  const hostname = options.hostname ?? "127.0.0.1";
  const app = createApp();
  const { injectWebSocket } = setupWebSocket(app);
  const server = serve(
    { fetch: app.fetch, port, hostname },
    (info) => {
      console.log(`CodeAgora dashboard running at http://${hostname}:${info.port}`);
      console.log(`Dashboard token: ${getAuthToken()}`);
    }
  );
  injectWebSocket(server);
  return {
    close: () => {
      server.close();
    }
  };
}
var isDirectRun = typeof process !== "undefined" && process.argv[1] && (process.argv[1].endsWith("/server/index.ts") || process.argv[1].endsWith("/server/index.js"));
if (isDirectRun) {
  startServer();
}
export {
  configRoutes,
  costRoutes,
  createApp,
  healthRoutes,
  modelRoutes,
  sessionRoutes,
  setEmitters,
  setupWebSocket,
  startServer
};
