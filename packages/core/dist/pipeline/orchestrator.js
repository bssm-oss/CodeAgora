import { SessionManager, recoverStaleSessions } from "../session/manager.js";
import { loadConfig, normalizeConfig } from "../config/loader.js";
import { writeAllReviews } from "../l1/writer.js";
import { applyThreshold } from "../l2/threshold.js";
import { writeModeratorReport, writeSuggestions } from "../l2/writer.js";
import { parseDiffFileRanges, readSurroundingContext } from "@codeagora/shared/utils/diff.js";
import { estimateTokens } from "./chunker.js";
import { createLogger } from "@codeagora/shared/utils/logger.js";
import { writeHeadVerdict } from "../l3/writer.js";
import { QualityTracker } from "../l0/quality-tracker.js";
import { SEVERITY_ORDER } from "../types/core.js";
import { chunkDiff } from "./chunker.js";
import { analyzeTrivialDiff } from "./auto-approve.js";
import { computeL1Confidence } from "./confidence.js";
import { loadLearnedPatterns } from "../learning/store.js";
import { applyLearnedPatterns } from "../learning/filter.js";
import { loadReviewRules } from "../rules/loader.js";
import { matchRules } from "../rules/matcher.js";
import { DiscussionEmitter } from "../l2/event-emitter.js";
import { estimateDiffComplexity } from "./diff-complexity.js";
import { PipelineTelemetry } from "./telemetry.js";
import { computeCacheKey, checkAndLoadCache, persistResultCache } from "./cache-manager.js";
import { detectProjectContext } from "./session-recovery.js";
import { buildReviewerMap, buildReviewerOpinions, buildSupporterModelMap, mergeReviewOutputsByReviewer, trackDA, generatePerformanceText } from "./pipeline-helpers.js";
import { executeL1Reviews, executeL2Discussions, executeL3Verdict, recordTelemetry } from "./stage-executors.js";
import fs from "fs/promises";
async function runPipeline(input, progress) {
  let session;
  const telemetry = new PipelineTelemetry();
  try {
    await recoverStaleSessions().catch(() => {
    });
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
    session.registerCleanup();
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
    const cacheKey = computeCacheKey(diffContent, config);
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
    if (chunks.length > 1) {
      progress?.stageUpdate("init", 50, `Large diff split into ${chunks.length} chunks for parallel review`);
    }
    if (chunks.length === 0) {
      await session.setStatus("completed");
      return {
        sessionId,
        date,
        status: "success",
        summary: {
          decision: "ACCEPT",
          reasoning: "No code changes detected in diff. Nothing to review.",
          severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
          topIssues: [],
          totalDiscussions: 0,
          resolved: 0,
          escalated: 0,
          totalReviewers: 0,
          forfeitedReviewers: 0
        },
        evidenceDocs: [],
        discussions: []
      };
    }
    const projectContext = input.repoPath ? await detectProjectContext(input.repoPath, config.reviewContext).catch(() => void 0) : void 0;
    let enrichedContext;
    if (input.repoPath) {
      try {
        const { analyzeBeforeReview } = await import("./pre-analysis.js");
        const { extractFileListFromDiff: extractFiles } = await import("@codeagora/shared/utils/diff.js");
        enrichedContext = await analyzeBeforeReview(
          input.repoPath,
          diffContent,
          config,
          extractFiles(diffContent)
        );
      } catch {
      }
    }
    progress?.stageStart("review", `Running reviewers across ${chunks.length} chunk(s)...`);
    const l1Start = Date.now();
    const { allReviewResults, allReviewerInputs } = await executeL1Reviews(config, chunks, surroundingContext, projectContext, enrichedContext, progress);
    const l1Elapsed = Date.now() - l1Start;
    for (const r of allReviewResults) {
      telemetry.record({
        reviewerId: r.reviewerId,
        provider: allReviewerInputs.find((i) => i.config.id === r.reviewerId)?.config.provider ?? "unknown",
        model: r.model,
        latencyMs: Math.round(l1Elapsed / allReviewResults.length),
        success: r.status === "success",
        error: r.error
      });
    }
    progress?.stageComplete("review", `${allReviewResults.length} reviewer results collected`);
    if (allReviewResults.length === 0) {
      await session.setStatus("failed");
      return {
        sessionId,
        date,
        status: "error",
        error: `All reviewers failed (forfeited or errored). Check API keys with 'agora doctor --live' or review session logs at .ca/sessions/${date}/${sessionId}/`
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
    const { filterHallucinations } = await import("./hallucination-filter.js");
    const hallucinationResult = filterHallucinations(allEvidenceDocs, filteredDiffContent);
    if (hallucinationResult.removed.length > 0) {
      console.log(`[Hallucination Filter] Removed ${hallucinationResult.removed.length} finding(s) referencing non-existent code`);
    }
    if (hallucinationResult.uncertain.length > 0) {
      console.log(`[Hallucination Filter] ${hallucinationResult.uncertain.length} finding(s) flagged as uncertain (low confidence after penalty)`);
    }
    allEvidenceDocs = [...hallucinationResult.filtered, ...hallucinationResult.uncertain];
    const totalReviewers = allReviewerInputs.length;
    const totalDiffLines = filteredDiffContent.split("\n").length;
    for (const doc of allEvidenceDocs) {
      if (doc.source !== "rule") {
        doc.confidence = computeL1Confidence(doc, allEvidenceDocs, totalReviewers, totalDiffLines);
      }
    }
    if (input.repoPath && config.reviewContext?.verifySuggestions !== false) {
      try {
        const { verifySuggestions } = await import("./suggestion-verifier.js");
        await verifySuggestions(input.repoPath, allEvidenceDocs);
      } catch {
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
      const l2Start = Date.now();
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
        logger,
        enrichedContext
      );
      telemetry.record({
        reviewerId: "l2-moderator",
        provider: config.moderator?.provider ?? "unknown",
        model: config.moderator?.model ?? "unknown",
        latencyMs: Date.now() - l2Start,
        success: true
      });
      progress?.stageComplete("discuss", "Discussions complete");
    }
    await writeSuggestions(date, sessionId, thresholdResult.suggestions);
    if (input.skipHead) {
      await writeModeratorReport(date, sessionId, moderatorReport);
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
    const l3Start = Date.now();
    const headVerdict = await executeL3Verdict(config, moderatorReport);
    telemetry.record({
      reviewerId: "l3-head",
      provider: config.head?.provider ?? "unknown",
      model: config.head?.model ?? "unknown",
      latencyMs: Date.now() - l3Start,
      success: true
    });
    await writeModeratorReport(date, sessionId, moderatorReport);
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
    await persistResultCache(date, sessionId, cacheKey, pipelineResult, !!input.noCache);
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
import { mergeReviewOutputsByReviewer as mergeReviewOutputsByReviewer2 } from "./pipeline-helpers.js";
export {
  mergeReviewOutputsByReviewer2 as mergeReviewOutputsByReviewer,
  runPipeline
};
