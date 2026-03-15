/**
 * Pipeline Orchestrator
 * Connects all layers: L1 → L2 → L3
 */

import { SessionManager } from '../session/manager.js';
import { loadConfig, normalizeConfig } from '../config/loader.js';
import { groupDiff } from '../l3/grouping.js';
import { executeReviewers, checkForfeitThreshold } from '../l1/reviewer.js';
import { writeAllReviews } from '../l1/writer.js';
import { applyThreshold } from '../l2/threshold.js';
import { runModerator } from '../l2/moderator.js';
import { writeModeratorReport, writeSuggestions } from '../l2/writer.js';
import { deduplicateDiscussions } from '../l2/deduplication.js';
import { extractMultipleSnippets } from '../utils/diff.js';
import { createLogger } from '../utils/logger.js';
import { makeHeadVerdict, scanUnconfirmedQueue } from '../l3/verdict.js';
import { writeHeadVerdict } from '../l3/writer.js';
import { QualityTracker } from '../l0/quality-tracker.js';
import { resolveReviewers, getBanditStore } from '../l0/index.js';
import type { EvidenceDocument } from '../types/core.js';
import { SEVERITY_ORDER } from '../types/core.js';
import type { ProgressEmitter } from './progress.js';
import fs from 'fs/promises';

// ============================================================================
// Main Pipeline
// ============================================================================

export interface PipelineInput {
  diffPath: string;
}

export interface PipelineSummary {
  decision: 'ACCEPT' | 'REJECT' | 'NEEDS_HUMAN';
  reasoning: string;
  totalReviewers: number;
  forfeitedReviewers: number;
  severityCounts: Record<string, number>;
  topIssues: Array<{
    severity: string;
    filePath: string;
    lineRange: [number, number];
    title: string;
  }>;
  totalDiscussions: number;
  resolved: number;
  escalated: number;
}

export interface PipelineResult {
  sessionId: string;
  date: string;
  status: 'success' | 'error';
  error?: string;
  summary?: PipelineSummary;
}

/**
 * Run complete V3 pipeline
 */
export async function runPipeline(input: PipelineInput, progress?: ProgressEmitter): Promise<PipelineResult> {
  let session: SessionManager | undefined;

  try {
    // Load config and normalize (expand declarative reviewers if needed)
    progress?.stageStart('init', 'Loading config...');
    const rawConfig = await loadConfig();
    const config = normalizeConfig(rawConfig);

    // Create session
    session = await SessionManager.create(input.diffPath);
    const date = session.getDate();
    const sessionId = session.getSessionId();

    // Read diff
    const diffContent = await fs.readFile(input.diffPath, 'utf-8');
    progress?.stageComplete('init', 'Config loaded');

    // === L3 HEAD: Diff Grouping ===
    const fileGroups = groupDiff(diffContent);

    // Guard: empty diff produces no file groups
    if (fileGroups.length === 0) {
      await session.setStatus('completed');
      return {
        sessionId,
        date,
        status: 'success',
      };
    }

    // === L1 REVIEWERS: Resolve (L0 model selection for auto reviewers) + Parallel Execution ===
    const { reviewerInputs } = await resolveReviewers(
      config.reviewers,
      fileGroups,
      config.modelRouter
    );

    progress?.stageStart('review', 'Running reviewers...');
    const reviewResults = await executeReviewers(
      reviewerInputs,
      config.errorHandling.maxRetries
    );
    progress?.stageComplete('review', `${reviewResults.length} reviewers completed`);

    // Check forfeit threshold
    const forfeitCheck = checkForfeitThreshold(
      reviewResults,
      config.errorHandling.forfeitThreshold
    );

    if (!forfeitCheck.passed) {
      await session.setStatus('failed');
      return {
        sessionId,
        date,
        status: 'error',
        error: `Too many reviewers forfeited: ${(forfeitCheck.forfeitRate * 100).toFixed(1)}%`,
      };
    }

    // Write review outputs
    await writeAllReviews(date, sessionId, reviewResults);

    // === QUALITY TRACKING: Record L1 specificity ===
    const qualityTracker = new QualityTracker();
    for (const result of reviewResults) {
      const reviewerInput = reviewerInputs.find((r) => r.config.id === result.reviewerId);
      qualityTracker.recordReviewerOutput(
        result,
        reviewerInput?.config.provider ?? reviewerInput?.config.backend ?? 'unknown',
        sessionId
      );
    }

    // === L2 MODERATOR: Discussion Registration ===
    const allEvidenceDocs: EvidenceDocument[] = reviewResults.flatMap(
      (r) => r.evidenceDocs
    );

    const thresholdResult = applyThreshold(allEvidenceDocs, config.discussion);

    // Deduplicate discussions
    const { deduplicated, mergedCount } = deduplicateDiscussions(thresholdResult.discussions);
    const logger = createLogger(date, sessionId, 'pipeline');
    logger.info(`Deduplicated discussions: ${mergedCount} merged`);

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
        // Log warning and set fallback message
        logger.warn(`Failed to extract code snippet for ${key}`);
        discussion.codeSnippet = `[Code snippet not available - file ${discussion.filePath} may not be in diff]`;
      }
    }

    // === L2 MODERATOR: Run Discussions ===
    progress?.stageStart('discuss', 'Moderating discussions...');
    const moderatorReport = await runModerator({
      config: config.moderator,
      supporterPoolConfig: config.supporters,
      discussions: deduplicated,
      settings: config.discussion,
      date,
      sessionId,
    });

    progress?.stageComplete('discuss', 'Discussions complete');

    // === QUALITY TRACKING: Record L2 discussion results ===
    qualityTracker.recordDiscussionResults(
      deduplicated,
      moderatorReport.discussions
    );

    // Add unconfirmed and suggestions to report
    moderatorReport.unconfirmedIssues = thresholdResult.unconfirmed;
    moderatorReport.suggestions = thresholdResult.suggestions;

    // Write moderator report
    await writeModeratorReport(date, sessionId, moderatorReport);
    await writeSuggestions(date, sessionId, thresholdResult.suggestions);

    // === L3 HEAD: Scan Unconfirmed Queue ===
    const { promoted, dismissed: _dismissed } = scanUnconfirmedQueue(
      moderatorReport.unconfirmedIssues
    );

    // Promoted unconfirmed issues count as escalated for Head verdict
    if (promoted.length > 0) {
      for (const doc of promoted) {
        moderatorReport.discussions.push({
          discussionId: `promoted-${doc.filePath}:${doc.lineRange[0]}`,
          finalSeverity: doc.severity,
          reasoning: `Promoted from unconfirmed queue: ${doc.issueTitle}`,
          consensusReached: false,
          rounds: 0,
        });
      }
      moderatorReport.summary.escalated += promoted.length;
      moderatorReport.summary.totalDiscussions += promoted.length;
    }

    // === L3 HEAD: Final Verdict ===
    progress?.stageStart('verdict', 'Generating verdict...');
    const headVerdict = makeHeadVerdict(moderatorReport);
    await writeHeadVerdict(date, sessionId, headVerdict);
    progress?.stageComplete('verdict', 'Verdict complete');

    // === QUALITY TRACKING: Finalize rewards and persist bandit state ===
    const rewards = qualityTracker.finalizeRewards();
    if (rewards.size > 0) {
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

    // Flush logs
    await logger.flush();

    // Complete session
    await session.setStatus('completed');

    // Build summary from pipeline data
    const severityCounts: Record<string, number> = {};
    for (const doc of allEvidenceDocs) {
      severityCounts[doc.severity] = (severityCounts[doc.severity] ?? 0) + 1;
    }

    const topIssues = [...allEvidenceDocs]
      .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
      .slice(0, 5)
      .map(d => ({
        severity: d.severity,
        filePath: d.filePath,
        lineRange: d.lineRange,
        title: d.issueTitle,
      }));

    progress?.pipelineComplete('Done!');

    return {
      sessionId,
      date,
      status: 'success',
      summary: {
        decision: headVerdict.decision,
        reasoning: headVerdict.reasoning,
        totalReviewers: reviewerInputs.length,
        forfeitedReviewers: reviewResults.filter(r => r.status === 'forfeit').length,
        severityCounts,
        topIssues,
        totalDiscussions: moderatorReport.summary.totalDiscussions,
        resolved: moderatorReport.summary.resolved,
        escalated: moderatorReport.summary.escalated,
      },
    };
  } catch (error) {
    // Mark session as failed if it was created
    if (session) {
      await session.setStatus('failed').catch(() => {});
    }

    return {
      sessionId: session?.getSessionId() ?? 'unknown',
      date: session?.getDate() ?? 'unknown',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
