import { groupDiff } from "../l3/grouping.js";
import { executeReviewers, checkForfeitThreshold } from "../l1/reviewer.js";
import { runModerator } from "../l2/moderator.js";
import { deduplicateDiscussions } from "../l2/deduplication.js";
import { extractMultipleSnippets } from "@codeagora/shared/utils/diff.js";
import { makeHeadVerdict, scanUnconfirmedQueue } from "../l3/verdict.js";
import { resolveReviewers, getBanditStore } from "../l0/index.js";
import { pLimit } from "@codeagora/shared/utils/concurrency.js";
import { adjustConfidenceFromDiscussion } from "./confidence.js";
async function executeL1Reviews(config, chunks, surroundingContext, projectContext, enrichedContext, progress) {
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
    if (enrichedContext) {
      for (const ri of reviewerInputs) {
        ri.enrichedContext = enrichedContext;
      }
    }
    const reviewResults = await executeReviewers(
      reviewerInputs,
      config.errorHandling.maxRetries,
      void 0,
      // concurrency (default 5)
      void 0,
      // options (default)
      (reviewerId, issueCount, _elapsed, total, completed) => {
        progress?.stageUpdate(
          "review",
          Math.round(completed / total * 80),
          `${reviewerId}: ${issueCount} issue(s) found (${completed}/${total})`,
          { reviewerId, completed, total }
        );
      }
    );
    const successCount = reviewResults.filter((r) => r.status === "success").length;
    progress?.stageUpdate(
      "review",
      Math.round((chunk.index + 1) / chunks.length * 90),
      `Chunk ${chunk.index + 1}/${chunks.length}: ${successCount}/${reviewResults.length} reviewers succeeded`,
      { completed: chunk.index + 1, total: chunks.length }
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
async function executeL2Discussions(config, diffContent, thresholdResult, date, sessionId, discussionEmitter, allEvidenceDocs, qualityTracker, logger, enrichedContext) {
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
    emitter: discussionEmitter,
    enrichedContext
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
export {
  executeL1Reviews,
  executeL2Discussions,
  executeL3Verdict,
  recordTelemetry
};
