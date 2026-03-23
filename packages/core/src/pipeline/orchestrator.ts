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
import { extractMultipleSnippets, parseDiffFileRanges, readSurroundingContext } from '@codeagora/shared/utils/diff.js';
import { estimateTokens } from './chunker.js';
import { createLogger } from '@codeagora/shared/utils/logger.js';
import { makeHeadVerdict, scanUnconfirmedQueue } from '../l3/verdict.js';
import { writeHeadVerdict } from '../l3/writer.js';
import { QualityTracker } from '../l0/quality-tracker.js';
import { resolveReviewers, getBanditStore } from '../l0/index.js';
import type { EvidenceDocument, ReviewOutput, DiscussionVerdict } from '../types/core.js';
import { SEVERITY_ORDER } from '../types/core.js';
import type { ProgressEmitter } from './progress.js';
import type { ReviewerInput } from '../l1/reviewer.js';
import { chunkDiff } from './chunker.js';
import { pLimit } from '@codeagora/shared/utils/concurrency.js';
import { analyzeTrivialDiff } from './auto-approve.js';
import { computeL1Confidence, adjustConfidenceFromDiscussion } from './confidence.js';
import { loadLearnedPatterns } from '../learning/store.js';
import { applyLearnedPatterns } from '../learning/filter.js';
import { loadReviewRules } from '../rules/loader.js';
import { matchRules } from '../rules/matcher.js';
import { DiscussionEmitter } from '../l2/event-emitter.js';
import { estimateDiffComplexity } from './diff-complexity.js';
import { generateReport, formatReportText } from './report.js';
import { trackDevilsAdvocate } from '../l2/devils-advocate-tracker.js';
import { PipelineTelemetry } from './telemetry.js';
import { computeHash } from '@codeagora/shared/utils/hash.js';
import { lookupCache, addToCache } from '@codeagora/shared/utils/cache.js';
import { CA_ROOT } from '@codeagora/shared/utils/fs.js';
import fs from 'fs/promises';
import type { Config, ReviewerEntry } from '../types/config.js';
import type { ModeratorReport } from '../types/core.js';

// ============================================================================
// Main Pipeline
// ============================================================================

export interface PipelineInput {
  diffPath: string;
  providerOverride?: string;
  modelOverride?: string;
  timeoutMs?: number;
  reviewerTimeoutMs?: number;
  skipDiscussion?: boolean;
  /** Skip L3 head verdict — return raw L1 evidence docs (6.2 lightweight mode) */
  skipHead?: boolean;
  reviewerSelection?: { count?: number; names?: string[] };
  /** Optional event emitter for real-time discussion events (2.1). Attach listeners before calling runPipeline. */
  discussionEmitter?: DiscussionEmitter;
  /** Disable result caching — always run a fresh review */
  noCache?: boolean;
  /** Git repo root path — enables surrounding code context for reviewers */
  repoPath?: string;
  /** Number of surrounding lines to include around changed ranges (default 20, 0 = disabled) */
  contextLines?: number;
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
  evidenceDocs?: EvidenceDocument[];
  discussions?: DiscussionVerdict[];
  /** Per-discussion round data (supporter stances, responses, prompts) */
  roundsPerDiscussion?: Record<string, import('../types/core.js').DiscussionRound[]>;
  /** Pre-formatted performance report text */
  performanceText?: string;
  /** Diff complexity analysis */
  diffComplexity?: import('./diff-complexity.js').DiffComplexity;
  /** Devil's advocate effectiveness stats */
  devilsAdvocateStats?: import('../l2/devils-advocate-tracker.js').DevilsAdvocateStats;
  /** Maps "filePath:startLine" → reviewer IDs that flagged the issue */
  reviewerMap?: Record<string, string[]>;
  /** Maps "filePath:startLine" → per-reviewer opinions preserving individual L1 findings */
  reviewerOpinions?: Record<string, import('../types/core.js').ReviewerOpinion[]>;
  /** Devil's Advocate supporter ID (for display annotation) */
  devilsAdvocateId?: string;
  /** Maps supporterId → model name (for display in discussion tables) */
  supporterModelMap?: Record<string, string>;
  /** True when the result was served from cache (#109) */
  cached?: boolean;
}

// ============================================================================
// Private helpers
// ============================================================================

/**
 * Check cache for an identical diff+config combo. Returns cached result or null.
 */
async function checkAndLoadCache(
  cacheKey: string,
  session: SessionManager,
): Promise<PipelineResult | null> {
  try {
    const cachedSessionPath = await lookupCache(CA_ROOT, cacheKey);
    if (cachedSessionPath) {
      const [cachedDate, cachedId] = cachedSessionPath.split('/');
      if (cachedDate && cachedId) {
        const cachedResultPath = `${CA_ROOT}/sessions/${cachedDate}/${cachedId}/result.json`;
        const cachedRaw = await fs.readFile(cachedResultPath, 'utf-8');
        const cachedResult = JSON.parse(cachedRaw) as PipelineResult;
        await session.setStatus('completed');
        return { ...cachedResult, cached: true };
      }
    }
  } catch {
    // Cache miss or corrupt data — continue with fresh review
  }
  return null;
}

/**
 * Execute L1 reviewers across all diff chunks and return aggregated results.
 */
async function executeL1Reviews(
  config: Config,
  chunks: Awaited<ReturnType<typeof chunkDiff>>,
  surroundingContext: string | undefined,
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
async function executeL2Discussions(
  config: Config,
  diffContent: string,
  thresholdResult: ReturnType<typeof applyThreshold>,
  date: string,
  sessionId: string,
  discussionEmitter: DiscussionEmitter,
  allEvidenceDocs: EvidenceDocument[],
  qualityTracker: QualityTracker,
  logger: ReturnType<typeof createLogger>,
): Promise<ModeratorReport> {
  const { deduplicated, mergedCount } = deduplicateDiscussions(thresholdResult.discussions);
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
  }

  return moderatorReport;
}

/**
 * Execute L3 head verdict (scan unconfirmed queue + make verdict).
 */
async function executeL3Verdict(
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
async function recordTelemetry(
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

// ============================================================================
// Run Pipeline
// ============================================================================

/**
 * Run complete V3 pipeline
 */
export async function runPipeline(input: PipelineInput, progress?: ProgressEmitter): Promise<PipelineResult> {
  let session: SessionManager | undefined;
  // D-3: basic pipeline timing telemetry
  const telemetry = new PipelineTelemetry();

  try {
    // Load credentials from ~/.config/codeagora/credentials
    const { loadCredentials } = await import('../config/credentials.js');
    await loadCredentials();

    // Load config and normalize (expand declarative reviewers if needed)
    progress?.stageStart('init', 'Loading config...');
    const rawConfig = await loadConfig();
    const config = normalizeConfig(rawConfig);

    // Apply CLI overrides to config
    if (Array.isArray(config.reviewers)) {
      for (const r of config.reviewers) {
        if ('auto' in r) continue; // skip auto reviewers — they have no model/provider
        if (input.providerOverride) r.provider = input.providerOverride;
        if (input.modelOverride) r.model = input.modelOverride;
        if (input.reviewerTimeoutMs) r.timeout = Math.round(input.reviewerTimeoutMs / 1000);
      }
    }
    if (input.timeoutMs) {
      config.errorHandling.maxRetries = Math.min(config.errorHandling.maxRetries, 1);
    }

    // Create session
    session = await SessionManager.create(input.diffPath);
    const date = session.getDate();
    const sessionId = session.getSessionId();

    // Read diff
    const diffContent = await fs.readFile(input.diffPath, 'utf-8');
    const diffComplexity = estimateDiffComplexity(diffContent);

    // === SURROUNDING CONTEXT: Read source files for context-aware review ===
    let surroundingContext: string | undefined;
    const contextLinesCount = input.contextLines ?? 20;
    if (input.repoPath && contextLinesCount > 0) {
      try {
        const fileRanges = parseDiffFileRanges(diffContent);
        const maxTokens = config.chunking?.maxTokens ?? 8000;
        const contextBudget = Math.floor(maxTokens * 0.3);
        let currentContextLines = contextLinesCount;

        while (currentContextLines > 0) {
          const contextParts: string[] = [];
          for (const { file, ranges } of fileRanges) {
            const ctx = await readSurroundingContext(
              input.repoPath,
              file,
              ranges,
              currentContextLines
            );
            if (ctx) contextParts.push(ctx);
          }

          const combined = contextParts.join('\n\n');
          if (estimateTokens(combined) <= contextBudget || currentContextLines <= 2) {
            if (combined) surroundingContext = combined;
            break;
          }

          currentContextLines = Math.floor(currentContextLines / 2);
        }
      } catch {
        // Context gathering failed — continue without it
      }
    }

    progress?.stageComplete('init', 'Config loaded');

    // === CACHE: Check for identical diff + config (#109) ===
    const cacheKey = computeHash(diffContent + JSON.stringify(config.reviewers));
    if (!input.noCache) {
      const cached = await checkAndLoadCache(cacheKey, session);
      if (cached) return cached;
    }

    // === AUTO-APPROVE: Skip LLM pipeline for trivial diffs ===
    if (config.autoApprove?.enabled) {
      const trivialResult = analyzeTrivialDiff(diffContent, config.autoApprove);
      if (trivialResult.isTrivial) {
        const reason = trivialResult.reason ?? 'trivial-diff';
        await session.setStatus('completed');
        return {
          sessionId,
          date,
          status: 'success',
          summary: {
            decision: 'ACCEPT',
            reasoning: `Auto-approved: ${reason}`,
            totalReviewers: 0,
            forfeitedReviewers: 0,
            severityCounts: {},
            topIssues: [],
            totalDiscussions: 0,
            resolved: 0,
            escalated: 0,
          },
        };
      }
    }

    // === DIFF CHUNKING ===
    const chunks = await chunkDiff(diffContent, { maxTokens: config.chunking?.maxTokens ?? 8000 });

    // Guard: empty diff produces no chunks
    if (chunks.length === 0) {
      await session.setStatus('completed');
      return {
        sessionId,
        date,
        status: 'success',
      };
    }

    // === L1 REVIEWERS: Chunk Processing ===
    progress?.stageStart('review', `Running reviewers across ${chunks.length} chunk(s)...`);
    const { allReviewResults, allReviewerInputs } = await executeL1Reviews(config, chunks, surroundingContext);
    progress?.stageComplete('review', `${allReviewResults.length} reviewer results collected`);

    // Empty pipeline guard — all chunks failed
    if (allReviewResults.length === 0) {
      await session.setStatus('failed');
      return {
        sessionId,
        date,
        status: 'error',
        error: 'All review chunks failed (forfeited or errored)',
      };
    }

    // Write review outputs (once, after all chunks)
    await writeAllReviews(date, sessionId, allReviewResults);

    // === QUALITY TRACKING: Record L1 specificity ===
    // Merge by reviewerId so QualityTracker gets one entry per reviewer
    const mergedForTracking = mergeReviewOutputsByReviewer(allReviewResults);
    const qualityTracker = new QualityTracker();
    for (const result of mergedForTracking) {
      const reviewerInput = allReviewerInputs.find((r) => r.config.id === result.reviewerId);
      qualityTracker.recordReviewerOutput(
        result,
        reviewerInput?.config.provider ?? reviewerInput?.config.backend ?? 'unknown',
        sessionId
      );
    }

    // === L2 MODERATOR: Discussion Registration ===
    let allEvidenceDocs: EvidenceDocument[] = allReviewResults.flatMap(
      (r) => r.evidenceDocs
    );

    // === RULES: Apply custom review rules ===
    const compiledRules = await loadReviewRules(process.cwd());
    if (compiledRules && compiledRules.length > 0) {
      const ruleEvidence = matchRules(diffContent, compiledRules);
      if (ruleEvidence.length > 0) {
        console.log(`[Rules] Matched ${ruleEvidence.length} rule-based issue(s)`);
        allEvidenceDocs.push(...ruleEvidence);
      }
    }

    // === LEARNING: Apply dismissed patterns ===
    const learnedPatterns = await loadLearnedPatterns(process.cwd());
    if (learnedPatterns && learnedPatterns.dismissedPatterns.length > 0) {
      const { filtered, suppressed } = applyLearnedPatterns(
        allEvidenceDocs,
        learnedPatterns.dismissedPatterns,
      );
      if (suppressed.length > 0) {
        console.log(`[Learning] Suppressed ${suppressed.length} previously dismissed issue(s)`);
      }
      allEvidenceDocs = filtered;
    }

    // === CONFIDENCE: Compute L1 confidence for non-rule docs ===
    const totalReviewers = allReviewerInputs.length;
    for (const doc of allEvidenceDocs) {
      if (doc.source !== 'rule') {
        doc.confidence = computeL1Confidence(doc, allEvidenceDocs, totalReviewers);
      }
    }

    const thresholdResult = applyThreshold(allEvidenceDocs, config.discussion);
    const logger = createLogger(date, sessionId, 'pipeline');

    let moderatorReport: ModeratorReport;

    if (input.skipDiscussion) {
      // Skip L2 — treat all issues as unconfirmed
      logger.info('Discussion skipped (--no-discussion)');
      moderatorReport = {
        discussions: [],
        roundsPerDiscussion: {},
        unconfirmedIssues: thresholdResult.unconfirmed,
        suggestions: thresholdResult.suggestions,
        summary: { totalDiscussions: 0, resolved: 0, escalated: 0 },
      };
    } else {
      // === L2 MODERATOR: Run Discussions ===
      progress?.stageStart('discuss', 'Moderating discussions...');
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
      );
      progress?.stageComplete('discuss', 'Discussions complete');
    }

    // Write moderator report
    await writeModeratorReport(date, sessionId, moderatorReport);
    await writeSuggestions(date, sessionId, thresholdResult.suggestions);

    // === LIGHTWEIGHT MODE: Skip L3 head verdict (6.2) ===
    if (input.skipHead) {
      await session.setStatus('completed');
      progress?.stageComplete('verdict', 'Skipped (lightweight mode)');
      const severityCounts: Record<string, number> = {};
      for (const doc of allEvidenceDocs) {
        severityCounts[doc.severity] = (severityCounts[doc.severity] ?? 0) + 1;
      }
      return {
        sessionId, date, status: 'success',
        summary: {
          decision: 'NEEDS_HUMAN', reasoning: 'Lightweight mode — no head verdict',
          totalReviewers: allReviewerInputs.length,
          forfeitedReviewers: allReviewResults.filter(r => r.status === 'forfeit').length,
          severityCounts,
          topIssues: allEvidenceDocs.slice(0, 5).map(d => ({ severity: d.severity, filePath: d.filePath, lineRange: d.lineRange, title: d.issueTitle })),
          totalDiscussions: moderatorReport.summary.totalDiscussions,
          resolved: moderatorReport.summary.resolved,
          escalated: moderatorReport.summary.escalated,
        },
        evidenceDocs: allEvidenceDocs,
        discussions: moderatorReport.discussions,
        roundsPerDiscussion: moderatorReport.roundsPerDiscussion,
        performanceText: await generatePerformanceText(telemetry),
        diffComplexity,
        reviewerMap: buildReviewerMap(allReviewResults),
        reviewerOpinions: buildReviewerOpinions(allReviewResults),
        devilsAdvocateId: config.supporters?.devilsAdvocate?.enabled ? config.supporters.devilsAdvocate.id : undefined,
        supporterModelMap: config.supporters ? buildSupporterModelMap(config.supporters) : undefined,
      };
    }

    // === L3 HEAD: Final Verdict ===
    progress?.stageStart('verdict', 'Generating verdict...');
    const headVerdict = await executeL3Verdict(config, moderatorReport);
    await writeHeadVerdict(date, sessionId, headVerdict);
    progress?.stageComplete('verdict', 'Verdict complete');

    // === QUALITY TRACKING: Finalize rewards and persist bandit state ===
    await recordTelemetry(qualityTracker, sessionId, logger);

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

    const pipelineResult: PipelineResult = {
      sessionId,
      date,
      status: 'success',
      summary: {
        decision: headVerdict.decision,
        reasoning: headVerdict.reasoning,
        totalReviewers: allReviewerInputs.length,
        forfeitedReviewers: allReviewResults.filter(r => r.status === 'forfeit').length,
        severityCounts,
        topIssues,
        totalDiscussions: moderatorReport.summary.totalDiscussions,
        resolved: moderatorReport.summary.resolved,
        escalated: moderatorReport.summary.escalated,
      },
      evidenceDocs: allEvidenceDocs,
      discussions: moderatorReport.discussions,
      roundsPerDiscussion: moderatorReport.roundsPerDiscussion,
      performanceText: await generatePerformanceText(telemetry),
      diffComplexity,
      devilsAdvocateStats: trackDA(config, moderatorReport),
      reviewerMap: buildReviewerMap(allReviewResults),
      reviewerOpinions: buildReviewerOpinions(allReviewResults),
      devilsAdvocateId: config.supporters?.devilsAdvocate?.enabled ? config.supporters.devilsAdvocate.id : undefined,
      supporterModelMap: config.supporters ? buildSupporterModelMap(config.supporters) : undefined,
    };

    // === CACHE: Persist result and update cache index (#109) ===
    try {
      const resultJsonPath = `${CA_ROOT}/sessions/${date}/${sessionId}/result.json`;
      await fs.writeFile(resultJsonPath, JSON.stringify(pipelineResult, null, 2), 'utf-8');
      if (!input.noCache) {
        await addToCache(CA_ROOT, cacheKey, `${date}/${sessionId}`);
      }
    } catch {
      // Cache write failure is non-fatal — pipeline result is still valid
    }

    return pipelineResult;
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

// ============================================================================
// Chunk Merge Helper
// ============================================================================

/**
 * Build a map of "filePath:startLine" → reviewer IDs that flagged the issue.
 */
function buildReviewerMap(results: ReviewOutput[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
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

/**
 * Build a map of "filePath:startLine" → per-reviewer opinions.
 * Preserves each reviewer's individual problem/evidence/suggestion/severity.
 */
function buildReviewerOpinions(results: ReviewOutput[]): Record<string, import('../types/core.js').ReviewerOpinion[]> {
  const map: Record<string, import('../types/core.js').ReviewerOpinion[]> = {};
  for (const r of results) {
    if (r.status !== 'success') continue;
    for (const doc of r.evidenceDocs) {
      const key = `${doc.filePath}:${doc.lineRange[0]}`;
      if (!map[key]) map[key] = [];
      map[key].push({
        reviewerId: r.reviewerId,
        model: r.model,
        severity: doc.severity,
        problem: doc.problem,
        evidence: doc.evidence,
        suggestion: doc.suggestion,
      });
    }
  }
  return map;
}

/**
 * Build supporterId → model map from supporter pool config.
 */
function buildSupporterModelMap(supporters: import('../types/config.js').SupporterPoolConfig): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of supporters.pool) {
    map[s.id] = s.model;
  }
  if (supporters.devilsAdvocate?.enabled) {
    map[supporters.devilsAdvocate.id] = supporters.devilsAdvocate.model;
  }
  return map;
}

/**
 * Merge ReviewOutputs by reviewerId for QualityTracker.
 * Same reviewer across multiple chunks → single entry with concatenated evidenceDocs.
 */
export function mergeReviewOutputsByReviewer(results: ReviewOutput[]): ReviewOutput[] {
  const map = new Map<string, ReviewOutput>();

  for (const r of results) {
    const existing = map.get(r.reviewerId);
    if (!existing) {
      map.set(r.reviewerId, { ...r, evidenceDocs: [...r.evidenceDocs] });
    } else {
      existing.evidenceDocs.push(...r.evidenceDocs);
      // If any chunk succeeded, mark as success
      if (r.status === 'success') existing.status = 'success';
    }
  }

  return [...map.values()];
}

/**
 * Track devil's advocate effectiveness if enabled.
 */
function trackDA(config: Config, report: ModeratorReport) {
  const da = config.supporters?.devilsAdvocate;
  if (!da?.enabled) return undefined;
  return trackDevilsAdvocate(da.id, report.roundsPerDiscussion, report.discussions);
}

async function generatePerformanceText(telemetry: PipelineTelemetry): Promise<string> {
  try {
    const report = await generateReport(telemetry);
    if (report.summary.totalCalls === 0) return '';
    return formatReportText(report);
  } catch {
    return '';
  }
}
