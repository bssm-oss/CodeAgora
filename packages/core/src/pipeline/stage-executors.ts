/**
 * Pipeline Stage Executors
 * Extracted L1/L2/L3 execution and telemetry recording logic from orchestrator.
 */

import { groupDiff } from '../l3/grouping.js';
import { executeReviewers, checkForfeitThreshold } from '../l1/reviewer.js';
import { applyThreshold } from '../l2/threshold.js';
import { runModerator } from '../l2/moderator.js';
import { deduplicateDiscussions } from '../l2/deduplication.js';
import { extractMultipleSnippets } from '@codeagora/shared/utils/diff.js';
import { createLogger } from '@codeagora/shared/utils/logger.js';
import { makeHeadVerdict, scanUnconfirmedQueue } from '../l3/verdict.js';
import { QualityTracker } from '../l0/quality-tracker.js';
import { resolveReviewers, getBanditStore } from '../l0/index.js';
import type { EvidenceDocument, ReviewOutput, ModeratorReport } from '../types/core.js';
import type { ReviewerInput } from '../l1/reviewer.js';
import { chunkDiff } from './chunker.js';
import { pLimit } from '@codeagora/shared/utils/concurrency.js';
import { adjustConfidenceFromDiscussion } from './confidence.js';
import { DiscussionEmitter } from '../l2/event-emitter.js';
import type { Config, ReviewerEntry } from '../types/config.js';

/**
 * Execute L1 reviewers across all diff chunks and return aggregated results.
 */
export async function executeL1Reviews(
  config: Config,
  chunks: Awaited<ReturnType<typeof chunkDiff>>,
  surroundingContext: string | undefined,
  projectContext?: string,
  enrichedContext?: import('./pre-analysis.js').EnrichedDiffContext,
  progress?: import('./progress.js').ProgressEmitter,
): Promise<{ allReviewResults: ReviewOutput[]; allReviewerInputs: ReviewerInput[] }> {
  const allReviewResults: ReviewOutput[] = [];
  const allReviewerInputs: ReviewerInput[] = [];

  const processChunk = async (chunk: typeof chunks[number]) => {
    const fileGroups = groupDiff(chunk.diffContent);
    if (fileGroups.length === 0) return null;

    const { reviewerInputs } = await resolveReviewers(
      config.reviewers as ReviewerEntry[],
      fileGroups,
      config.modelRouter
    );

    // Inject surrounding context into each reviewer input (context-aware review)
    if (surroundingContext) {
      for (const ri of reviewerInputs) {
        ri.surroundingContext = surroundingContext;
      }
    }

    // Inject custom reviewer prompt path from config
    if (config.prompts?.reviewer) {
      for (const ri of reviewerInputs) {
        ri.customPromptPath = config.prompts.reviewer;
      }
    }

    // Inject project context to prevent false positives (#237)
    if (projectContext) {
      for (const ri of reviewerInputs) {
        ri.projectContext = projectContext;
      }
    }

    // Inject pre-analysis enriched context (#411, #414, #415, #407, #408)
    if (enrichedContext) {
      for (const ri of reviewerInputs) {
        ri.enrichedContext = enrichedContext;
      }
    }

    const reviewResults = await executeReviewers(
      reviewerInputs,
      config.errorHandling.maxRetries,
      undefined, // concurrency (default 5)
      undefined, // options (default)
      (reviewerId, issueCount, _elapsed, total, completed) => {
        progress?.stageUpdate(
          'review',
          Math.round((completed / total) * 80),
          `${reviewerId}: ${issueCount} issue(s) found (${completed}/${total})`,
          { reviewerId, completed, total },
        );
      },
    );

    // Emit per-chunk progress
    const successCount = reviewResults.filter((r) => r.status === 'success').length;
    progress?.stageUpdate(
      'review',
      Math.round(((chunk.index + 1) / chunks.length) * 90),
      `Chunk ${chunk.index + 1}/${chunks.length}: ${successCount}/${reviewResults.length} reviewers succeeded`,
      { completed: chunk.index + 1, total: chunks.length },
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

  // Adaptive strategy: ≤2 chunks serial (overhead not worth it), >2 parallel
  const CHUNK_PARALLEL_THRESHOLD = 2;
  const CHUNK_CONCURRENCY = 3;

  if (chunks.length <= CHUNK_PARALLEL_THRESHOLD) {
    // Serial — low overhead for small diffs
    for (const chunk of chunks) {
      const out = await processChunk(chunk);
      if (out) {
        allReviewResults.push(...out.reviewResults);
        allReviewerInputs.push(...out.reviewerInputs);
      }
    }
  } else {
    // Parallel with concurrency limit — prevents API rate-limit storms
    const limit = pLimit(CHUNK_CONCURRENCY);
    const settled = await Promise.allSettled(
      chunks.map((chunk) => limit(() => processChunk(chunk)))
    );
    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value) {
        allReviewResults.push(...result.value.reviewResults);
        allReviewerInputs.push(...result.value.reviewerInputs);
      }
      // rejected chunks are silently skipped (same as forfeit skip)
    }
  }

  return { allReviewResults, allReviewerInputs };
}

/**
 * Execute L2 moderator discussions and return the moderator report.
 */
export async function executeL2Discussions(
  config: Config,
  diffContent: string,
  thresholdResult: ReturnType<typeof applyThreshold>,
  date: string,
  sessionId: string,
  discussionEmitter: DiscussionEmitter,
  allEvidenceDocs: EvidenceDocument[],
  qualityTracker: QualityTracker,
  logger: ReturnType<typeof createLogger>,
  enrichedContext?: import('./pre-analysis.js').EnrichedDiffContext,
): Promise<ModeratorReport> {
  const { deduplicated, mergedCount } = deduplicateDiscussions(thresholdResult.discussions);
  logger.info(`Deduplicated discussions: ${mergedCount} merged`);

  if (deduplicated.length === 0) {
    logger.warn('No discussions registered — all issues below threshold or in unconfirmed queue');
  }

  // Extract code snippets for discussions
  const snippets = extractMultipleSnippets(
    diffContent,
    deduplicated.map((d) => ({
      filePath: d.filePath,
      lineRange: d.lineRange,
    })),
    config.discussion.codeSnippetRange
  );

  // Attach snippets to discussions
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
    enrichedContext,
  });

  // === QUALITY TRACKING: Record L2 discussion results ===
  qualityTracker.recordDiscussionResults(deduplicated, moderatorReport.discussions);

  // Add unconfirmed and suggestions to report
  moderatorReport.unconfirmedIssues = thresholdResult.unconfirmed;
  moderatorReport.suggestions = thresholdResult.suggestions;

  // === CONFIDENCE: Adjust confidence based on L2 discussion verdicts ===
  for (const verdict of moderatorReport.discussions) {
    const matchingDocs = allEvidenceDocs.filter(d =>
      d.filePath === verdict.filePath && Math.abs(d.lineRange[0] - verdict.lineRange[0]) <= 5
    );
    for (const doc of matchingDocs) {
      doc.confidence = adjustConfidenceFromDiscussion(doc.confidence ?? 50, verdict);
    }

    // Propagate average confidence to verdict for use in L3 head prompt (#229).
    // Only count docs that have an explicit confidence value — docs without
    // confidence were not scored by L1 and should not inflate the average.
    const scoredDocs = matchingDocs.filter(d => d.confidence != null);
    if (scoredDocs.length > 0) {
      verdict.avgConfidence = Math.round(
        scoredDocs.reduce((sum, d) => sum + d.confidence!, 0) / scoredDocs.length
      );
    }
  }

  return moderatorReport;
}

/**
 * Execute L3 head verdict (scan unconfirmed queue + make verdict).
 */
export async function executeL3Verdict(
  config: Config,
  moderatorReport: ModeratorReport,
): Promise<ReturnType<typeof makeHeadVerdict>> {
  // === L3 HEAD: Scan Unconfirmed Queue ===
  const { promoted, dismissed: _dismissed } = scanUnconfirmedQueue(
    moderatorReport.unconfirmedIssues
  );

  // Promoted unconfirmed issues count as escalated for Head verdict
  if (promoted.length > 0) {
    for (const doc of promoted) {
      moderatorReport.discussions.push({
        discussionId: `promoted-${doc.filePath}:${doc.lineRange[0]}`,
        filePath: doc.filePath,
        lineRange: doc.lineRange,
        finalSeverity: doc.severity,
        reasoning: `Promoted from unconfirmed queue: ${doc.issueTitle}`,
        consensusReached: false,
        rounds: 0,
      });
    }
    moderatorReport.summary.escalated += promoted.length;
    moderatorReport.summary.totalDiscussions += promoted.length;
  }

  return makeHeadVerdict(moderatorReport, config.head, config.mode, config.language);
}

/**
 * Record telemetry (quality tracking + bandit rewards) after pipeline completes.
 */
export async function recordTelemetry(
  qualityTracker: QualityTracker,
  sessionId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const rewards = qualityTracker.finalizeRewards();
  if (rewards.size === 0) return;

  // Use shared BanditStore from L0 (avoids dual-instance data corruption)
  let banditStoreInstance = getBanditStore();
  if (!banditStoreInstance) {
    // L0 not initialized (no auto reviewers) — create standalone instance
    const { BanditStore } = await import('../l0/bandit-store.js');
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
    `Quality feedback: ${rewards.size} reviewers scored, ` +
    `${[...rewards.values()].filter((r) => r.reward === 1).length} rewarded`
  );
}
