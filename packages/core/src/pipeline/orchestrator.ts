/**
 * Pipeline Orchestrator
 * Connects all layers: L1 → L2 → L3
 */

import { SessionManager, recoverStaleSessions } from '../session/manager.js';
import { isDeclarativeReviewers, loadConfig, loadConfigFile, normalizeConfig } from '../config/loader.js';
import { writeAllReviews } from '../l1/writer.js';
import { applyThreshold } from '../l2/threshold.js';
import { writeModeratorReport, writeSuggestions } from '../l2/writer.js';
import { parseDiffFileRanges, readSurroundingContext } from '@codeagora/shared/utils/diff.js';
import { estimateTokens } from './chunker.js';
import { createLogger } from '@codeagora/shared/utils/logger.js';
import { writeHeadVerdict } from '../l3/writer.js';
import { QualityTracker } from '../l0/quality-tracker.js';
import type { EvidenceDocument, DiscussionVerdict, ReviewOutput } from '../types/core.js';
import { SEVERITY_ORDER } from '../types/core.js';
import type { ProgressEmitter } from './progress.js';
import { chunkDiffWithMetadata } from './chunker.js';
import { analyzeTrivialDiff } from './auto-approve.js';
import { computeL1Confidence } from './confidence.js';
import { isExplicitNoIssues } from '../l1/parser.js';
import { loadLearnedPatterns } from '../learning/store.js';
import { applyLearnedPatterns } from '../learning/filter.js';
import { loadReviewRules } from '../rules/loader.js';
import { matchRules } from '../rules/matcher.js';
import { DiscussionEmitter } from '../l2/event-emitter.js';
import { estimateDiffComplexity } from './diff-complexity.js';
import { PipelineTelemetry } from './telemetry.js';
import { buildReviewCacheContext, computeCacheKey, checkAndLoadCache, persistResultCache, writeSessionResult } from './cache-manager.js';
import { detectProjectContext } from './session-recovery.js';
import { buildReviewerMap, buildReviewerOpinions, buildSupporterModelMap, mergeReviewOutputsByReviewer, trackDA, generatePerformanceText } from './pipeline-helpers.js';
import { executeL1Reviews, executeL2Discussions, executeL3Verdict, recordTelemetry } from './stage-executors.js';
import fs from 'fs/promises';
import type { ModeratorReport } from '../types/core.js';
import { classifyError, type ErrorKind } from '../l1/error-classifier.js';
import type { CacheMetadata } from '@codeagora/shared/utils/cache.js';
import type { Config, ReviewerEntry } from '../types/config.js';

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
  /** Explicit config file path. Defaults to process.cwd()/.ca/config.* */
  configPath?: string;
}

export interface ReviewerSelection {
  count?: number;
  names?: string[];
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
    confidence?: number;
  }>;
  totalDiscussions: number;
  resolved: number;
  escalated: number;
  /** Human-review questions from L3 head verdict */
  questionsForHuman?: string[];
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
  /** Machine-readable cache metadata. Contains hashes/keys only, never raw provider or source context. */
  cache?: CacheMetadata;
}

// ============================================================================
// Session Result Artifacts
// ============================================================================

async function persistTerminalResult(result: PipelineResult): Promise<PipelineResult> {
  if (result.date !== 'unknown' && result.sessionId !== 'unknown') {
    await writeSessionResult(result.date, result.sessionId, result).catch(() => {});
  }
  return result;
}

export function applyReviewerSelectionToConfig(
  config: Config,
  selection?: ReviewerSelection,
): Config {
  if (!selection) return config;

  const requestedNames = selection.names?.filter((name) => name.trim().length > 0);
  if (selection.count !== undefined && (!Number.isInteger(selection.count) || selection.count < 1)) {
    throw new Error(`reviewer count must be >= 1, got ${selection.count}`);
  }

  if (isDeclarativeReviewers(config.reviewers) && (!requestedNames || requestedNames.length === 0)) {
    return {
      ...config,
      reviewers: {
        ...config.reviewers,
        ...(selection.count !== undefined && { count: selection.count }),
      },
    };
  }

  const normalized = normalizeConfig(config);
  let selected: ReviewerEntry[] = normalized.reviewers.filter((reviewer) => reviewer.enabled);

  if (requestedNames && requestedNames.length > 0) {
    const byId = new Map(selected.map((reviewer) => [reviewer.id, reviewer]));
    const missing = requestedNames.filter((name) => !byId.has(name));
    if (missing.length > 0) {
      throw new Error(`Unknown reviewer id(s): ${missing.join(', ')}`);
    }
    selected = requestedNames.map((name) => byId.get(name)!);
  }

  if (selection.count !== undefined) {
    if (selected.length < selection.count) {
      throw new Error(`Requested ${selection.count} reviewer(s), but only ${selected.length} enabled reviewer(s) are available`);
    }
    selected = selected.slice(0, selection.count);
  }

  if (selected.length === 0) {
    throw new Error('At least one reviewer must be selected');
  }

  return {
    ...normalized,
    reviewers: selected,
  };
}

export function applyPipelineTimeouts(
  config: Config & { reviewers: ReviewerEntry[] },
  timeoutMs: number | undefined,
): void {
  if (!timeoutMs) return;
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  config.errorHandling.maxRetries = Math.min(config.errorHandling.maxRetries, 1);
  config.supporters.pool = config.supporters.pool.map((supporter) => ({
    ...supporter,
    timeout: Math.min(supporter.timeout ?? timeoutSeconds, timeoutSeconds),
  }));
  config.supporters.devilsAdvocate = {
    ...config.supporters.devilsAdvocate,
    timeout: Math.min(config.supporters.devilsAdvocate.timeout ?? timeoutSeconds, timeoutSeconds),
  };
  config.moderator = {
    ...config.moderator,
    timeout: Math.min(config.moderator.timeout ?? timeoutSeconds, timeoutSeconds),
  };
  if (config.head) {
    config.head = {
      ...config.head,
      timeout: Math.min(config.head.timeout ?? timeoutSeconds, timeoutSeconds),
    };
  }
}

function pipelineTimeoutResult(timeoutMs: number): PipelineResult {
  return {
    sessionId: 'unknown',
    date: 'unknown',
    status: 'error',
    error: `Pipeline timed out after ${Math.round(timeoutMs / 1000)}s`,
  };
}

// ============================================================================
// Failure Diagnostics
// ============================================================================

function buildReviewerFailureMessage(failures: ReviewOutput[], date: string, sessionId: string): string {
  const failuresWithErrors = failures.filter((result) => result.error && result.error.trim().length > 0);
  if (failuresWithErrors.length === 0) {
    return `All reviewers failed (forfeited or errored). ` +
      `Check API keys with 'agora doctor --live' or review session logs at .ca/sessions/${date}/${sessionId}/`;
  }

  const details = failuresWithErrors
    .slice(0, 5)
    .map((result) => {
      const kind = classifyReviewerFailure(result.error ?? 'Unknown error');
      const provider = result.provider ?? 'unknown';
      return `- ${result.reviewerId} (${provider}/${result.model}): ${kind}: ${result.error}`;
    })
    .join('\n');
  const omitted = failuresWithErrors.length > 5
    ? `\n- ... ${failuresWithErrors.length - 5} more reviewer failure(s)`
    : '';

  return `All reviewers failed (forfeited or errored) due to provider/API failures.\n${details}${omitted}\n` +
    `Recovery hint: check provider API keys, quota/rate limits, network connectivity, and circuit breaker status with 'agora doctor --live'; review session logs at .ca/sessions/${date}/${sessionId}/`;
}

function classifyReviewerFailure(message: string): ErrorKind | 'circuit-open' {
  if (/circuit open/i.test(message)) return 'circuit-open';
  return classifyError(new Error(message)).kind;
}

// ============================================================================
// Run Pipeline
// ============================================================================

/**
 * Run complete V3 pipeline
 */
export async function runPipeline(input: PipelineInput, progress?: ProgressEmitter): Promise<PipelineResult> {
  if (!input.timeoutMs) {
    return runPipelineInternal(input, progress);
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<PipelineResult>((resolve) => {
    timeoutId = setTimeout(() => {
      progress?.stageError(progress.getCurrentStage(), `Pipeline timed out after ${Math.round(input.timeoutMs! / 1000)}s`);
      resolve(pipelineTimeoutResult(input.timeoutMs!));
    }, input.timeoutMs);
  });

  try {
    return await Promise.race([runPipelineInternal(input, progress), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function runPipelineInternal(input: PipelineInput, progress?: ProgressEmitter): Promise<PipelineResult> {
  let session: SessionManager | undefined;
  // D-3: basic pipeline timing telemetry
  const telemetry = new PipelineTelemetry();

  try {
    // Recover any stale in_progress sessions from previous crashes
    await recoverStaleSessions().catch(() => {});

    // Load credentials from ~/.config/codeagora/credentials
    const { loadCredentials } = await import('../config/credentials.js');
    await loadCredentials();

    // Load config and normalize (expand declarative reviewers if needed)
    progress?.stageStart('init', 'Loading config...');
    const loadedConfig = input.configPath
      ? await loadConfigFile(input.configPath, { rootDir: input.repoPath ?? process.cwd() })
      : await loadConfig();
    const rawConfig = applyReviewerSelectionToConfig(loadedConfig, input.reviewerSelection);
    const config = normalizeConfig(rawConfig);
    applyPipelineTimeouts(config, input.timeoutMs);

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

    // Create session and register signal handlers for graceful cleanup
    session = await SessionManager.create(input.diffPath);
    session.registerCleanup();
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

    // === CACHE: Check for identical review-meaning inputs (#109) ===
    const cacheContext = await buildReviewCacheContext({
      repoPath: input.repoPath,
      surroundingContext,
    });
    const cacheKey = computeCacheKey(diffContent, config, cacheContext);
    await session.setMetadata({
      cache: {
        schemaVersion: cacheContext.schemaVersion,
        key: cacheKey,
        hit: false,
      },
    }).catch(() => {});
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
        return persistTerminalResult({
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
        });
      }
    }

    // === DIFF CHUNKING ===
    const chunkResult = await chunkDiffWithMetadata(diffContent, {
      maxTokens: config.chunking?.maxTokens ?? 8000,
      contextIgnorePatterns: config.reviewContext?.ignorePatterns,
      cwd: process.cwd(),
    });
    const chunks = chunkResult.chunks;

    await session.setMetadata({
      includedFiles: chunkResult.metadata.includedFiles,
      excludedFiles: chunkResult.metadata.excludedFiles,
      diffChunking: chunkResult.metadata.diffChunking,
    }).catch(() => {});

    if (chunks.length > 1) {
      progress?.stageUpdate('init', 50, `Large diff split into ${chunks.length} chunks for parallel review`);
    }

    // Guard: empty diff produces no chunks
    if (chunks.length === 0) {
      await session.setStatus('completed');
      return persistTerminalResult({
        sessionId,
        date,
        status: 'success',
        summary: {
          decision: 'ACCEPT' as const,
          reasoning: 'No code changes detected in diff. Nothing to review.',
          severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
          topIssues: [],
          totalDiscussions: 0,
          resolved: 0,
          escalated: 0,
          totalReviewers: 0,
          forfeitedReviewers: 0,
        },
        evidenceDocs: [],
        discussions: [],
      });
    }

    // === PROJECT CONTEXT: Detect for false-positive prevention (#237) ===
    const projectContext = input.repoPath
      ? await detectProjectContext(input.repoPath, config.reviewContext).catch(() => undefined)
      : undefined;

    // === PRE-ANALYSIS: Enrich diff context for reviewers (#411, #414, #415, #407, #408) ===
    let enrichedContext: import('./pre-analysis.js').EnrichedDiffContext | undefined;
    if (input.repoPath) {
      try {
        const { analyzeBeforeReview } = await import('./pre-analysis.js');
        const { extractFileListFromDiff: extractFiles } = await import('@codeagora/shared/utils/diff.js');
        enrichedContext = await analyzeBeforeReview(
          input.repoPath,
          diffContent,
          config,
          extractFiles(diffContent),
        );
      } catch {
        // Pre-analysis failed — continue without enrichment
      }
    }

    // === L1 REVIEWERS: Chunk Processing ===
    progress?.stageStart('review', `Running reviewers across ${chunks.length} chunk(s)...`);
    const l1Start = Date.now();
    const { allReviewResults, allReviewerInputs, forfeitFailures } = await executeL1Reviews(config, chunks, surroundingContext, projectContext, enrichedContext, progress, input.reviewerTimeoutMs);
    const l1Elapsed = Date.now() - l1Start;
    for (const r of allReviewResults) {
      telemetry.record({
        reviewerId: r.reviewerId,
        provider: r.provider ?? allReviewerInputs.find((i) => i.config.id === r.reviewerId)?.config.provider ?? 'unknown',
        model: r.model,
        latencyMs: r.latencyMs ?? Math.round(l1Elapsed / allReviewResults.length),
        usage: r.usage,
        success: r.status === 'success',
        error: r.error,
      });
    }
    progress?.stageComplete('review', `${allReviewResults.length} reviewer results collected`);

    // Empty pipeline guard — all chunks failed
    if (allReviewResults.length === 0) {
      await session.setStatus('failed');
      return persistTerminalResult({
        sessionId,
        date,
        status: 'error',
        error: buildReviewerFailureMessage(forfeitFailures, date, sessionId),
      });
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
    // Use filtered diff from chunks (respects .reviewignore) instead of raw diffContent (#300)
    const filteredDiffContent = chunks.map(c => c.diffContent).join('\n');
    const compiledRules = await loadReviewRules(input.repoPath ?? process.cwd());
    if (compiledRules && compiledRules.length > 0) {
      const ruleEvidence = matchRules(filteredDiffContent, compiledRules);
      if (ruleEvidence.length > 0) {
        console.error(`[Rules] Matched ${ruleEvidence.length} rule-based issue(s)`);
        allEvidenceDocs.push(...ruleEvidence);
      }
    }

    // === LEARNING: Apply dismissed patterns ===
    const learnedPatterns = await loadLearnedPatterns(input.repoPath ?? process.cwd());
    if (learnedPatterns && learnedPatterns.dismissedPatterns.length > 0) {
      const { filtered, suppressed } = applyLearnedPatterns(
        allEvidenceDocs,
        learnedPatterns.dismissedPatterns,
      );
      if (suppressed.length > 0) {
        console.error(`[Learning] Suppressed ${suppressed.length} previously dismissed issue(s)`);
      }
      allEvidenceDocs = filtered;
    }

    // === HALLUCINATION FILTER: Remove findings referencing non-existent code (#428) ===
    const { filterHallucinations } = await import('./hallucination-filter.js');
    const hallucinationResult = filterHallucinations(allEvidenceDocs, filteredDiffContent);
    if (hallucinationResult.removed.length > 0) {
      console.error(`[Hallucination Filter] Removed ${hallucinationResult.removed.length} finding(s) referencing non-existent code`);
    }
    if (hallucinationResult.uncertain.length > 0) {
      console.error(`[Hallucination Filter] ${hallucinationResult.uncertain.length} finding(s) flagged as uncertain (low confidence after penalty)`);
    }
    // Keep uncertain findings in the pipeline (confidence already penalized,
    // triage will classify them as "verify" or "ignore" for human review)
    allEvidenceDocs = [...hallucinationResult.filtered, ...hallucinationResult.uncertain];

    // === CONFIDENCE: Compute L1 confidence for non-rule docs ===
    // Active reviewers = those who produced usable output (issue docs OR explicit
    // "no issues"). Unparseable / forfeited reviewers are excluded from the
    // denominator — they didn't effectively cast a vote (see #462).
    const activeReviewers = allReviewResults.filter(r =>
      r.status === 'success' &&
      (r.evidenceDocs.length > 0 || isExplicitNoIssues(r.rawResponse))
    ).length;
    const totalDiffLines = filteredDiffContent.split('\n').length;
    for (const doc of allEvidenceDocs) {
      if (doc.source !== 'rule') {
        const rawCorroborated = computeL1Confidence(doc, allEvidenceDocs, activeReviewers, totalDiffLines);
        const corroborated = doc.confidenceTrace?.classPrior
          ? Math.min(rawCorroborated, 75)
          : rawCorroborated;
        doc.confidence = corroborated; // BC: legacy single-field confidence
        // ConfidenceTrace: record post-corroboration confidence (stage 3 of 5).
        doc.confidenceTrace = {
          ...(doc.confidenceTrace ?? {}),
          corroborated,
        };
      }
    }

    // === SUGGESTION VERIFICATION: Check if proposed fixes compile (#413) ===
    if (input.repoPath && config.reviewContext?.verifySuggestions !== false) {
      try {
        const { verifySuggestions } = await import('./suggestion-verifier.js');
        await verifySuggestions(input.repoPath, allEvidenceDocs);
      } catch {
        // Verification failure is non-fatal
      }
    }

    const thresholdResult = applyThreshold(allEvidenceDocs, config.discussion);
    const logger = createLogger(date, sessionId, 'pipeline');

    let moderatorReport: ModeratorReport;

    if (input.skipDiscussion || config.discussion?.enabled === false) {
      // Skip L2 — treat all issues as unconfirmed
      logger.info(input.skipDiscussion ? 'Discussion skipped (--no-discussion)' : 'Discussion skipped (enabled: false)');
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
        enrichedContext,
        (call) => telemetry.record(call),
      );
      progress?.stageComplete('discuss', 'Discussions complete');
    }

    // ConfidenceTrace: backfill `final` for docs that did not enter L2.
    // Order: verified (suggestion-verifier failure) > corroborated (L1) > legacy confidence.
    // Docs adjusted by L2 already have `final` set by stage-executors.ts.
    for (const doc of allEvidenceDocs) {
      const trace = doc.confidenceTrace;
      if (trace && trace.final === undefined) {
        const fallback = trace.verified ?? trace.corroborated ?? doc.confidence;
        if (fallback !== undefined) {
          doc.confidenceTrace = { ...trace, final: fallback };
        }
      }
    }

    await writeSuggestions(date, sessionId, thresholdResult.suggestions);

    // === LIGHTWEIGHT MODE: Skip L3 head verdict (6.2) ===
    if (input.skipHead) {
      // No L3 promoted-issue mutation in lightweight mode — safe to write here
      await writeModeratorReport(date, sessionId, moderatorReport);
      await session.setStatus('completed');
      progress?.stageComplete('verdict', 'Skipped (lightweight mode)');
      const severityCounts: Record<string, number> = {};
      for (const doc of allEvidenceDocs) {
        severityCounts[doc.severity] = (severityCounts[doc.severity] ?? 0) + 1;
      }
      return persistTerminalResult({
        sessionId, date, status: 'success',
        summary: {
          decision: 'NEEDS_HUMAN', reasoning: 'Lightweight mode — no head verdict',
          totalReviewers: allReviewerInputs.length,
          forfeitedReviewers: allReviewResults.filter(r => r.status === 'forfeit').length,
          severityCounts,
          topIssues: allEvidenceDocs.slice(0, 5).map(d => ({ severity: d.severity, filePath: d.filePath, lineRange: d.lineRange, title: d.issueTitle, confidence: d.confidenceTrace?.final ?? d.confidence })),
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
      });
    }

    // === L3 HEAD: Final Verdict ===
    progress?.stageStart('verdict', 'Generating verdict...');
    const headVerdict = await executeL3Verdict(config, moderatorReport, (call) => telemetry.record(call));
    // Write moderator report AFTER L3 promoted-issue mutation (#299)
    await writeModeratorReport(date, sessionId, moderatorReport);
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
        confidence: d.confidenceTrace?.final ?? d.confidence,
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
        questionsForHuman: headVerdict.questionsForHuman,
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
      cache: {
        schemaVersion: cacheContext.schemaVersion,
        key: cacheKey,
        hit: false,
      },
    };

    // === CACHE: Persist result and update cache index (#109) ===
    await persistResultCache(date, sessionId, cacheKey, pipelineResult, !!input.noCache);

    return pipelineResult;
  } catch (error) {
    // Mark session as failed if it was created
    if (session) {
      await session.setStatus('failed').catch(() => {});
    }

    return persistTerminalResult({
      sessionId: session?.getSessionId() ?? 'unknown',
      date: session?.getDate() ?? 'unknown',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Re-export for backward compatibility
export { mergeReviewOutputsByReviewer } from './pipeline-helpers.js';
