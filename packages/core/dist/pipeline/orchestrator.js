import { SessionManager } from "../session/manager.js";
import { loadConfig, normalizeConfig } from "../config/loader.js";
import { groupDiff } from "../l3/grouping.js";
import { executeReviewers, checkForfeitThreshold } from "../l1/reviewer.js";
import { writeAllReviews } from "../l1/writer.js";
import { applyThreshold } from "../l2/threshold.js";
import { runModerator } from "../l2/moderator.js";
import { writeModeratorReport, writeSuggestions } from "../l2/writer.js";
import { deduplicateDiscussions } from "../l2/deduplication.js";
import { extractMultipleSnippets, parseDiffFileRanges, readSurroundingContext } from "@codeagora/shared/utils/diff.js";
import { estimateTokens } from "./chunker.js";
import { createLogger } from "@codeagora/shared/utils/logger.js";
import { makeHeadVerdict, scanUnconfirmedQueue } from "../l3/verdict.js";
import { writeHeadVerdict } from "../l3/writer.js";
import { QualityTracker } from "../l0/quality-tracker.js";
import { resolveReviewers, getBanditStore } from "../l0/index.js";
import { SEVERITY_ORDER } from "../types/core.js";
import { chunkDiff } from "./chunker.js";
import { pLimit } from "@codeagora/shared/utils/concurrency.js";
import { analyzeTrivialDiff } from "./auto-approve.js";
import { computeL1Confidence, adjustConfidenceFromDiscussion } from "./confidence.js";
import { loadLearnedPatterns } from "../learning/store.js";
import { applyLearnedPatterns } from "../learning/filter.js";
import { loadReviewRules } from "../rules/loader.js";
import { matchRules } from "../rules/matcher.js";
import { DiscussionEmitter } from "../l2/event-emitter.js";
import { estimateDiffComplexity } from "./diff-complexity.js";
import { generateReport, formatReportText } from "./report.js";
import { trackDevilsAdvocate } from "../l2/devils-advocate-tracker.js";
import { PipelineTelemetry } from "./telemetry.js";
import { computeHash } from "@codeagora/shared/utils/hash.js";
import { lookupCache, addToCache } from "@codeagora/shared/utils/cache.js";
import { CA_ROOT } from "@codeagora/shared/utils/fs.js";
import fs from "fs/promises";
import path from "path";
async function detectProjectContext(repoPath, userContext) {
  try {
    const lines = [];
    if (userContext?.deploymentType) {
      const deployDescriptions = {
        "github-action": "Deployment: GitHub Action \u2014 dist/ is a SELF-CONTAINED BUNDLE. All dependencies MUST be inlined. Do NOT flag bundled dependencies as external or missing.",
        "cli": "Deployment: CLI tool \u2014 distributed as a standalone executable or npm package.",
        "library": "Deployment: Library \u2014 published to a package registry. Public API surface matters.",
        "web-app": "Deployment: Web application \u2014 bundled for browser delivery.",
        "api-server": "Deployment: API server \u2014 runs as a long-lived process.",
        "lambda": "Deployment: Serverless function (Lambda/Cloud Function) \u2014 cold-start and bundle size matter.",
        "docker": "Deployment: Docker container \u2014 multi-stage builds and image size matter.",
        "edge-function": "Deployment: Edge function \u2014 strict runtime constraints, limited APIs.",
        "monorepo": "Architecture: monorepo (workspace:* dependencies are STANDARD and correct \u2014 do NOT flag them)."
      };
      lines.push(deployDescriptions[userContext.deploymentType] ?? `Deployment: ${userContext.deploymentType}`);
    }
    const markerFiles = [
      [["action.yml", "action.yaml"], "Deployment: GitHub Action \u2014 dist/ is a SELF-CONTAINED BUNDLE. All dependencies MUST be inlined. Do NOT flag bundled dependencies as external or missing."],
      [["Dockerfile"], "Build: Docker container detected."],
      [["serverless.yml", "serverless.yaml"], "Deployment: Serverless Framework detected."],
      [["vercel.json"], "Deployment: Vercel detected."],
      [["netlify.toml"], "Deployment: Netlify detected."],
      [["fly.toml"], "Deployment: Fly.io detected."],
      [["wrangler.toml"], "Deployment: Cloudflare Workers detected."]
    ];
    for (const [files, label] of markerFiles) {
      for (const f of files) {
        const exists = await fs.access(path.join(repoPath, f)).then(() => true).catch(() => false);
        if (exists) {
          lines.push(label);
          break;
        }
      }
    }
    if (userContext?.bundledOutputs && userContext.bundledOutputs.length > 0) {
      lines.push(`Bundled outputs: ${userContext.bundledOutputs.join(", ")} \u2014 all deps inlined, do NOT flag external/missing dependency issues in these paths.`);
    }
    const pkgPath = path.join(repoPath, "package.json");
    const pkgRaw = await fs.readFile(pkgPath, "utf-8").catch(() => null);
    if (pkgRaw) {
      const pkg = JSON.parse(pkgRaw);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const depNames = Object.keys(allDeps);
      if (pkg.name) lines.push(`Project: ${pkg.name}`);
      const isMonorepo = await fs.access(path.join(repoPath, "pnpm-workspace.yaml")).then(() => true).catch(() => false) || await fs.access(path.join(repoPath, "lerna.json")).then(() => true).catch(() => false) || await fs.access(path.join(repoPath, "nx.json")).then(() => true).catch(() => false);
      if (isMonorepo) {
        lines.push("Architecture: monorepo (workspace:* dependencies are STANDARD and correct \u2014 do NOT flag them)");
      }
      if (pkg.packageManager?.startsWith("pnpm") || depNames.includes("pnpm")) {
        lines.push("Package manager: pnpm");
      }
      const knownLibs = [
        [["zod"], "Validation: zod (do NOT suggest joi, yup, or other validation libraries)"],
        [["joi"], "Validation: joi"],
        [["express"], "Framework: Express"],
        [["fastify"], "Framework: Fastify"],
        [["hono"], "Framework: Hono"],
        [["next"], "Framework: Next.js"],
        [["nuxt"], "Framework: Nuxt"],
        [["react"], "UI: React"],
        [["vue"], "UI: Vue"],
        [["prisma", "@prisma/client"], "ORM: Prisma"],
        [["typeorm"], "ORM: TypeORM"],
        [["drizzle-orm"], "ORM: Drizzle"],
        [["vitest"], "Test: vitest"],
        [["jest"], "Test: jest"],
        [["typescript"], "Language: TypeScript (strict mode expected)"]
      ];
      for (const [keys, label] of knownLibs) {
        if (keys.some((k) => depNames.includes(k))) {
          lines.push(label);
        }
      }
    }
    if (userContext?.notes && userContext.notes.length > 0) {
      for (const note of userContext.notes) {
        lines.push(note);
      }
    }
    if (lines.length === 0) return void 0;
    return `## Project Context
${lines.map((l) => `- ${l}`).join("\n")}

Do NOT flag items that conform to the above context as issues.`;
  } catch {
    return void 0;
  }
}
async function checkAndLoadCache(cacheKey, session) {
  try {
    const cachedSessionPath = await lookupCache(CA_ROOT, cacheKey);
    if (cachedSessionPath) {
      const [cachedDate, cachedId] = cachedSessionPath.split("/");
      if (cachedDate && cachedId) {
        const cachedResultPath = `${CA_ROOT}/sessions/${cachedDate}/${cachedId}/result.json`;
        const cachedRaw = await fs.readFile(cachedResultPath, "utf-8");
        const cachedResult = JSON.parse(cachedRaw);
        await session.setStatus("completed");
        return { ...cachedResult, cached: true };
      }
    }
  } catch {
  }
  return null;
}
async function executeL1Reviews(config, chunks, surroundingContext, projectContext) {
  const allReviewResults = [];
  const allReviewerInputs = [];
  const processChunk = async (chunk) => {
    const fileGroups = groupDiff(chunk.diffContent);
    if (fileGroups.length === 0) return null;
    const { reviewerInputs } = await resolveReviewers(
      config.reviewers,
      fileGroups,
      config.modelRouter
    );
    if (surroundingContext) {
      for (const ri of reviewerInputs) {
        ri.surroundingContext = surroundingContext;
      }
    }
    if (config.prompts?.reviewer) {
      for (const ri of reviewerInputs) {
        ri.customPromptPath = config.prompts.reviewer;
      }
    }
    if (projectContext) {
      for (const ri of reviewerInputs) {
        ri.projectContext = projectContext;
      }
    }
    const reviewResults = await executeReviewers(
      reviewerInputs,
      config.errorHandling.maxRetries
    );
    const forfeitCheck = checkForfeitThreshold(
      reviewResults,
      config.errorHandling.forfeitThreshold
    );
    if (!forfeitCheck.passed) return null;
    if (chunks.length > 1) {
      for (const result of reviewResults) {
        result.chunkIndex = chunk.index;
      }
    }
    return { reviewResults, reviewerInputs };
  };
  const CHUNK_PARALLEL_THRESHOLD = 2;
  const CHUNK_CONCURRENCY = 3;
  if (chunks.length <= CHUNK_PARALLEL_THRESHOLD) {
    for (const chunk of chunks) {
      const out = await processChunk(chunk);
      if (out) {
        allReviewResults.push(...out.reviewResults);
        allReviewerInputs.push(...out.reviewerInputs);
      }
    }
  } else {
    const limit = pLimit(CHUNK_CONCURRENCY);
    const settled = await Promise.allSettled(
      chunks.map((chunk) => limit(() => processChunk(chunk)))
    );
    for (const result of settled) {
      if (result.status === "fulfilled" && result.value) {
        allReviewResults.push(...result.value.reviewResults);
        allReviewerInputs.push(...result.value.reviewerInputs);
      }
    }
  }
  return { allReviewResults, allReviewerInputs };
}
async function executeL2Discussions(config, diffContent, thresholdResult, date, sessionId, discussionEmitter, allEvidenceDocs, qualityTracker, logger) {
  const { deduplicated, mergedCount } = deduplicateDiscussions(thresholdResult.discussions);
  logger.info(`Deduplicated discussions: ${mergedCount} merged`);
  if (deduplicated.length === 0) {
    logger.warn("No discussions registered \u2014 all issues below threshold or in unconfirmed queue");
  }
  const snippets = extractMultipleSnippets(
    diffContent,
    deduplicated.map((d) => ({
      filePath: d.filePath,
      lineRange: d.lineRange
    })),
    config.discussion.codeSnippetRange
  );
  for (const discussion of deduplicated) {
    const key = `${discussion.filePath}:${discussion.lineRange[0]}-${discussion.lineRange[1]}`;
    const snippet = snippets.get(key);
    if (snippet) {
      discussion.codeSnippet = snippet.code;
    } else {
      logger.warn(`Failed to extract code snippet for ${key}`);
      discussion.codeSnippet = `[Code snippet not available - file ${discussion.filePath} may not be in diff]`;
    }
  }
  const moderatorReport = await runModerator({
    config: config.moderator,
    supporterPoolConfig: config.supporters,
    discussions: deduplicated,
    settings: config.discussion,
    date,
    sessionId,
    emitter: discussionEmitter
  });
  qualityTracker.recordDiscussionResults(deduplicated, moderatorReport.discussions);
  moderatorReport.unconfirmedIssues = thresholdResult.unconfirmed;
  moderatorReport.suggestions = thresholdResult.suggestions;
  for (const verdict of moderatorReport.discussions) {
    const matchingDocs = allEvidenceDocs.filter(
      (d) => d.filePath === verdict.filePath && Math.abs(d.lineRange[0] - verdict.lineRange[0]) <= 5
    );
    for (const doc of matchingDocs) {
      doc.confidence = adjustConfidenceFromDiscussion(doc.confidence ?? 50, verdict);
    }
    const scoredDocs = matchingDocs.filter((d) => d.confidence != null);
    if (scoredDocs.length > 0) {
      verdict.avgConfidence = Math.round(
        scoredDocs.reduce((sum, d) => sum + d.confidence, 0) / scoredDocs.length
      );
    }
  }
  return moderatorReport;
}
async function executeL3Verdict(config, moderatorReport) {
  const { promoted, dismissed: _dismissed } = scanUnconfirmedQueue(
    moderatorReport.unconfirmedIssues
  );
  if (promoted.length > 0) {
    for (const doc of promoted) {
      moderatorReport.discussions.push({
        discussionId: `promoted-${doc.filePath}:${doc.lineRange[0]}`,
        filePath: doc.filePath,
        lineRange: doc.lineRange,
        finalSeverity: doc.severity,
        reasoning: `Promoted from unconfirmed queue: ${doc.issueTitle}`,
        consensusReached: false,
        rounds: 0
      });
    }
    moderatorReport.summary.escalated += promoted.length;
    moderatorReport.summary.totalDiscussions += promoted.length;
  }
  return makeHeadVerdict(moderatorReport, config.head, config.mode, config.language);
}
async function recordTelemetry(qualityTracker, sessionId, logger) {
  const rewards = qualityTracker.finalizeRewards();
  if (rewards.size === 0) return;
  let banditStoreInstance = getBanditStore();
  if (!banditStoreInstance) {
    const { BanditStore } = await import("../l0/bandit-store.js");
    banditStoreInstance = new BanditStore();
    await banditStoreInstance.load();
  }
  for (const [, { modelId, provider, reward }] of rewards) {
    banditStoreInstance.updateArm(`${provider}/${modelId}`, reward);
  }
  for (const record of qualityTracker.getRecords()) {
    banditStoreInstance.addHistory(record);
  }
  await banditStoreInstance.save();
  logger.info(
    `Quality feedback: ${rewards.size} reviewers scored, ${[...rewards.values()].filter((r) => r.reward === 1).length} rewarded`
  );
}
async function runPipeline(input, progress) {
  let session;
  const telemetry = new PipelineTelemetry();
  try {
    const { loadCredentials } = await import("../config/credentials.js");
    await loadCredentials();
    progress?.stageStart("init", "Loading config...");
    const rawConfig = await loadConfig();
    const config = normalizeConfig(rawConfig);
    if (Array.isArray(config.reviewers)) {
      for (const r of config.reviewers) {
        if ("auto" in r) continue;
        if (input.providerOverride) r.provider = input.providerOverride;
        if (input.modelOverride) r.model = input.modelOverride;
        if (input.reviewerTimeoutMs) r.timeout = Math.round(input.reviewerTimeoutMs / 1e3);
      }
    }
    if (input.timeoutMs) {
      config.errorHandling.maxRetries = Math.min(config.errorHandling.maxRetries, 1);
    }
    session = await SessionManager.create(input.diffPath);
    const date = session.getDate();
    const sessionId = session.getSessionId();
    const diffContent = await fs.readFile(input.diffPath, "utf-8");
    const diffComplexity = estimateDiffComplexity(diffContent);
    let surroundingContext;
    const contextLinesCount = input.contextLines ?? 20;
    if (input.repoPath && contextLinesCount > 0) {
      try {
        const fileRanges = parseDiffFileRanges(diffContent);
        const maxTokens = config.chunking?.maxTokens ?? 8e3;
        const contextBudget = Math.floor(maxTokens * 0.3);
        let currentContextLines = contextLinesCount;
        while (currentContextLines > 0) {
          const contextParts = [];
          for (const { file, ranges } of fileRanges) {
            const ctx = await readSurroundingContext(
              input.repoPath,
              file,
              ranges,
              currentContextLines
            );
            if (ctx) contextParts.push(ctx);
          }
          const combined = contextParts.join("\n\n");
          if (estimateTokens(combined) <= contextBudget || currentContextLines <= 2) {
            if (combined) surroundingContext = combined;
            break;
          }
          currentContextLines = Math.floor(currentContextLines / 2);
        }
      } catch {
      }
    }
    progress?.stageComplete("init", "Config loaded");
    const cacheKey = computeHash(diffContent + JSON.stringify(config.reviewers));
    if (!input.noCache) {
      const cached = await checkAndLoadCache(cacheKey, session);
      if (cached) return cached;
    }
    if (config.autoApprove?.enabled) {
      const trivialResult = analyzeTrivialDiff(diffContent, config.autoApprove);
      if (trivialResult.isTrivial) {
        const reason = trivialResult.reason ?? "trivial-diff";
        await session.setStatus("completed");
        return {
          sessionId,
          date,
          status: "success",
          summary: {
            decision: "ACCEPT",
            reasoning: `Auto-approved: ${reason}`,
            totalReviewers: 0,
            forfeitedReviewers: 0,
            severityCounts: {},
            topIssues: [],
            totalDiscussions: 0,
            resolved: 0,
            escalated: 0
          }
        };
      }
    }
    const chunks = await chunkDiff(diffContent, { maxTokens: config.chunking?.maxTokens ?? 8e3 });
    if (chunks.length === 0) {
      await session.setStatus("completed");
      return {
        sessionId,
        date,
        status: "success"
      };
    }
    const projectContext = input.repoPath ? await detectProjectContext(input.repoPath, config.reviewContext).catch(() => void 0) : void 0;
    progress?.stageStart("review", `Running reviewers across ${chunks.length} chunk(s)...`);
    const { allReviewResults, allReviewerInputs } = await executeL1Reviews(config, chunks, surroundingContext, projectContext);
    progress?.stageComplete("review", `${allReviewResults.length} reviewer results collected`);
    if (allReviewResults.length === 0) {
      await session.setStatus("failed");
      return {
        sessionId,
        date,
        status: "error",
        error: "All review chunks failed (forfeited or errored)"
      };
    }
    await writeAllReviews(date, sessionId, allReviewResults);
    const mergedForTracking = mergeReviewOutputsByReviewer(allReviewResults);
    const qualityTracker = new QualityTracker();
    for (const result of mergedForTracking) {
      const reviewerInput = allReviewerInputs.find((r) => r.config.id === result.reviewerId);
      qualityTracker.recordReviewerOutput(
        result,
        reviewerInput?.config.provider ?? reviewerInput?.config.backend ?? "unknown",
        sessionId
      );
    }
    let allEvidenceDocs = allReviewResults.flatMap(
      (r) => r.evidenceDocs
    );
    const filteredDiffContent = chunks.map((c) => c.diffContent).join("\n");
    const compiledRules = await loadReviewRules(input.repoPath ?? process.cwd());
    if (compiledRules && compiledRules.length > 0) {
      const ruleEvidence = matchRules(filteredDiffContent, compiledRules);
      if (ruleEvidence.length > 0) {
        console.log(`[Rules] Matched ${ruleEvidence.length} rule-based issue(s)`);
        allEvidenceDocs.push(...ruleEvidence);
      }
    }
    const learnedPatterns = await loadLearnedPatterns(input.repoPath ?? process.cwd());
    if (learnedPatterns && learnedPatterns.dismissedPatterns.length > 0) {
      const { filtered, suppressed } = applyLearnedPatterns(
        allEvidenceDocs,
        learnedPatterns.dismissedPatterns
      );
      if (suppressed.length > 0) {
        console.log(`[Learning] Suppressed ${suppressed.length} previously dismissed issue(s)`);
      }
      allEvidenceDocs = filtered;
    }
    const totalReviewers = allReviewerInputs.length;
    for (const doc of allEvidenceDocs) {
      if (doc.source !== "rule") {
        doc.confidence = computeL1Confidence(doc, allEvidenceDocs, totalReviewers);
      }
    }
    const thresholdResult = applyThreshold(allEvidenceDocs, config.discussion);
    const logger = createLogger(date, sessionId, "pipeline");
    let moderatorReport;
    if (input.skipDiscussion || config.discussion?.enabled === false) {
      logger.info(input.skipDiscussion ? "Discussion skipped (--no-discussion)" : "Discussion skipped (enabled: false)");
      moderatorReport = {
        discussions: [],
        roundsPerDiscussion: {},
        unconfirmedIssues: thresholdResult.unconfirmed,
        suggestions: thresholdResult.suggestions,
        summary: { totalDiscussions: 0, resolved: 0, escalated: 0 }
      };
    } else {
      progress?.stageStart("discuss", "Moderating discussions...");
      const discussionEmitter = input.discussionEmitter ?? new DiscussionEmitter();
      moderatorReport = await executeL2Discussions(
        config,
        diffContent,
        thresholdResult,
        date,
        sessionId,
        discussionEmitter,
        allEvidenceDocs,
        qualityTracker,
        logger
      );
      progress?.stageComplete("discuss", "Discussions complete");
    }
    await writeModeratorReport(date, sessionId, moderatorReport);
    await writeSuggestions(date, sessionId, thresholdResult.suggestions);
    if (input.skipHead) {
      await session.setStatus("completed");
      progress?.stageComplete("verdict", "Skipped (lightweight mode)");
      const severityCounts2 = {};
      for (const doc of allEvidenceDocs) {
        severityCounts2[doc.severity] = (severityCounts2[doc.severity] ?? 0) + 1;
      }
      return {
        sessionId,
        date,
        status: "success",
        summary: {
          decision: "NEEDS_HUMAN",
          reasoning: "Lightweight mode \u2014 no head verdict",
          totalReviewers: allReviewerInputs.length,
          forfeitedReviewers: allReviewResults.filter((r) => r.status === "forfeit").length,
          severityCounts: severityCounts2,
          topIssues: allEvidenceDocs.slice(0, 5).map((d) => ({ severity: d.severity, filePath: d.filePath, lineRange: d.lineRange, title: d.issueTitle })),
          totalDiscussions: moderatorReport.summary.totalDiscussions,
          resolved: moderatorReport.summary.resolved,
          escalated: moderatorReport.summary.escalated
        },
        evidenceDocs: allEvidenceDocs,
        discussions: moderatorReport.discussions,
        roundsPerDiscussion: moderatorReport.roundsPerDiscussion,
        performanceText: await generatePerformanceText(telemetry),
        diffComplexity,
        reviewerMap: buildReviewerMap(allReviewResults),
        reviewerOpinions: buildReviewerOpinions(allReviewResults),
        devilsAdvocateId: config.supporters?.devilsAdvocate?.enabled ? config.supporters.devilsAdvocate.id : void 0,
        supporterModelMap: config.supporters ? buildSupporterModelMap(config.supporters) : void 0
      };
    }
    progress?.stageStart("verdict", "Generating verdict...");
    const headVerdict = await executeL3Verdict(config, moderatorReport);
    await writeHeadVerdict(date, sessionId, headVerdict);
    progress?.stageComplete("verdict", "Verdict complete");
    await recordTelemetry(qualityTracker, sessionId, logger);
    await logger.flush();
    await session.setStatus("completed");
    const severityCounts = {};
    for (const doc of allEvidenceDocs) {
      severityCounts[doc.severity] = (severityCounts[doc.severity] ?? 0) + 1;
    }
    const topIssues = [...allEvidenceDocs].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)).slice(0, 5).map((d) => ({
      severity: d.severity,
      filePath: d.filePath,
      lineRange: d.lineRange,
      title: d.issueTitle
    }));
    progress?.pipelineComplete("Done!");
    const pipelineResult = {
      sessionId,
      date,
      status: "success",
      summary: {
        decision: headVerdict.decision,
        reasoning: headVerdict.reasoning,
        totalReviewers: allReviewerInputs.length,
        forfeitedReviewers: allReviewResults.filter((r) => r.status === "forfeit").length,
        severityCounts,
        topIssues,
        totalDiscussions: moderatorReport.summary.totalDiscussions,
        resolved: moderatorReport.summary.resolved,
        escalated: moderatorReport.summary.escalated
      },
      evidenceDocs: allEvidenceDocs,
      discussions: moderatorReport.discussions,
      roundsPerDiscussion: moderatorReport.roundsPerDiscussion,
      performanceText: await generatePerformanceText(telemetry),
      diffComplexity,
      devilsAdvocateStats: trackDA(config, moderatorReport),
      reviewerMap: buildReviewerMap(allReviewResults),
      reviewerOpinions: buildReviewerOpinions(allReviewResults),
      devilsAdvocateId: config.supporters?.devilsAdvocate?.enabled ? config.supporters.devilsAdvocate.id : void 0,
      supporterModelMap: config.supporters ? buildSupporterModelMap(config.supporters) : void 0
    };
    try {
      const resultJsonPath = `${CA_ROOT}/sessions/${date}/${sessionId}/result.json`;
      await fs.writeFile(resultJsonPath, JSON.stringify(pipelineResult, null, 2), "utf-8");
      if (!input.noCache) {
        await addToCache(CA_ROOT, cacheKey, `${date}/${sessionId}`);
      }
    } catch {
    }
    return pipelineResult;
  } catch (error) {
    if (session) {
      await session.setStatus("failed").catch(() => {
      });
    }
    return {
      sessionId: session?.getSessionId() ?? "unknown",
      date: session?.getDate() ?? "unknown",
      status: "error",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
function buildReviewerMap(results) {
  const map = {};
  for (const r of results) {
    for (const doc of r.evidenceDocs) {
      const key = `${doc.filePath}:${doc.lineRange[0]}`;
      if (!map[key]) map[key] = [];
      if (!map[key].includes(r.reviewerId)) {
        map[key].push(r.reviewerId);
      }
    }
  }
  return map;
}
function buildReviewerOpinions(results) {
  const map = {};
  for (const r of results) {
    if (r.status !== "success") continue;
    for (const doc of r.evidenceDocs) {
      const key = `${doc.filePath}:${doc.lineRange[0]}`;
      if (!map[key]) map[key] = [];
      map[key].push({
        reviewerId: r.reviewerId,
        model: r.model,
        severity: doc.severity,
        problem: doc.problem,
        evidence: doc.evidence,
        suggestion: doc.suggestion
      });
    }
  }
  return map;
}
function buildSupporterModelMap(supporters) {
  const map = {};
  for (const s of supporters.pool) {
    map[s.id] = s.model;
  }
  if (supporters.devilsAdvocate?.enabled) {
    map[supporters.devilsAdvocate.id] = supporters.devilsAdvocate.model;
  }
  return map;
}
function mergeReviewOutputsByReviewer(results) {
  const map = /* @__PURE__ */ new Map();
  for (const r of results) {
    const existing = map.get(r.reviewerId);
    if (!existing) {
      map.set(r.reviewerId, { ...r, evidenceDocs: [...r.evidenceDocs] });
    } else {
      existing.evidenceDocs.push(...r.evidenceDocs);
      if (r.status === "success") existing.status = "success";
    }
  }
  return [...map.values()];
}
function trackDA(config, report) {
  const da = config.supporters?.devilsAdvocate;
  if (!da?.enabled) return void 0;
  return trackDevilsAdvocate(da.id, report.roundsPerDiscussion, report.discussions);
}
async function generatePerformanceText(telemetry) {
  try {
    const report = await generateReport(telemetry);
    if (report.summary.totalCalls === 0) return "";
    return formatReportText(report);
  } catch {
    return "";
  }
}
export {
  mergeReviewOutputsByReviewer,
  runPipeline
};
