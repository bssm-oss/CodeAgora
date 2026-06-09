/**
 * Pipeline Result Helpers
 * Functions that build result maps and format pipeline output data.
 */

import type { EvidenceDocument, ReviewOutput } from '../types/core.js';
import type { AgentConfig, Config, HeadConfig, ModeratorConfig } from '../types/config.js';
import type { ModeratorReport } from '../types/core.js';
import type { ReviewerInput } from '../l1/reviewer.js';
import { trackDevilsAdvocate } from '../l2/devils-advocate-tracker.js';
import { generateReport, formatReportText } from './report.js';
import type { PipelineTelemetry } from './telemetry.js';

export interface ReviewAgentRun {
  id: string;
  model: string;
  backend?: string;
  provider?: string;
  status?: 'success' | 'forfeit' | 'error' | 'skipped';
}

export interface ReviewRunSummary {
  l1: {
    configured: number;
    completed: number;
    forfeited: number;
    errored: number;
    reviewers: ReviewAgentRun[];
    models: string[];
    providers: string[];
  };
  l2: {
    supporters: number;
    supporterModels: string[];
    devilsAdvocate?: ReviewAgentRun;
    moderator?: ReviewAgentRun;
    discussions: number;
    skipped: boolean;
  };
  l3: {
    head?: ReviewAgentRun;
    skipped: boolean;
  };
  queues: {
    activeFindings: number;
    suggestions: number;
    unconfirmed: number;
    suppressed: number;
    hallucinationRemoved: number;
    hallucinationUncertain: number;
  };
  degraded: boolean;
  degradedReasons: string[];
}

/**
 * Build a map of "filePath:startLine" → reviewer IDs that flagged the issue.
 */
export function buildReviewerMap(results: ReviewOutput[]): Record<string, string[]> {
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
export function buildReviewerOpinions(results: ReviewOutput[]): Record<string, import('../types/core.js').ReviewerOpinion[]> {
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
export function buildSupporterModelMap(supporters: import('../types/config.js').SupporterPoolConfig): Record<string, string> {
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

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function reviewerRunFromInput(input: ReviewerInput, result?: ReviewOutput): ReviewAgentRun {
  return {
    id: input.config.id,
    model: result?.model ?? input.config.model,
    backend: input.config.backend,
    provider: result?.provider ?? input.config.provider,
    status: result?.status ?? 'skipped',
  };
}

function agentRunFromConfig(
  id: string,
  config: Pick<AgentConfig | ModeratorConfig | HeadConfig, 'model' | 'backend' | 'provider'>,
  status: ReviewAgentRun['status'] = 'success',
): ReviewAgentRun {
  return {
    id,
    model: config.model,
    backend: config.backend,
    provider: config.provider,
    status,
  };
}

export function uniqueReviewerInputCount(inputs: ReviewerInput[]): number {
  return new Set(inputs.map((input) => input.config.id)).size;
}

export function uniqueForfeitedReviewerCount(results: ReviewOutput[]): number {
  const merged = mergeReviewOutputsByReviewer(results);
  return merged.filter((result) => result.status === 'forfeit').length;
}

export function buildReviewRunSummary(params: {
  config: Config;
  reviewerInputs: ReviewerInput[];
  reviewResults: ReviewOutput[];
  moderatorReport: ModeratorReport;
  evidenceDocs: EvidenceDocument[];
  suppressedIssues?: EvidenceDocument[];
  hallucinationRemoved?: EvidenceDocument[];
  hallucinationUncertain?: EvidenceDocument[];
  skipHead?: boolean;
  l2Skipped?: boolean;
}): ReviewRunSummary {
  const mergedResults = mergeReviewOutputsByReviewer(params.reviewResults);
  const resultByReviewer = new Map(mergedResults.map((result) => [result.reviewerId, result]));
  const reviewers = uniqueById(
    params.reviewerInputs.map((input) => reviewerRunFromInput(input, resultByReviewer.get(input.config.id))),
  );
  const completed = reviewers.filter((reviewer) => reviewer.status === 'success').length;
  const forfeited = reviewers.filter((reviewer) => reviewer.status === 'forfeit').length;
  const errored = reviewers.filter((reviewer) => reviewer.status === 'error').length;
  const supporterModels = uniqueStrings(params.config.supporters?.pool.filter((s) => s.enabled).map((s) => s.model) ?? []);
  const devilsAdvocate = params.config.supporters?.devilsAdvocate?.enabled
    ? agentRunFromConfig(params.config.supporters.devilsAdvocate.id, params.config.supporters.devilsAdvocate)
    : undefined;
  const headEnabled = params.config.head?.enabled !== false && !params.skipHead;
  const head = params.config.head
    ? agentRunFromConfig('head', params.config.head, headEnabled ? 'success' : 'skipped')
    : undefined;
  const degradedReasons: string[] = [];

  if (forfeited > 0) {
    degradedReasons.push(`${forfeited} L1 reviewer(s) forfeited`);
  }
  if (errored > 0) {
    degradedReasons.push(`${errored} L1 reviewer(s) errored`);
  }
  if (params.l2Skipped) {
    degradedReasons.push('L2 discussion skipped');
  }
  if (params.skipHead) {
    degradedReasons.push('L3 head verdict skipped');
  }

  return {
    l1: {
      configured: reviewers.length,
      completed,
      forfeited,
      errored,
      reviewers,
      models: uniqueStrings(reviewers.map((reviewer) => reviewer.model)),
      providers: uniqueStrings(reviewers.map((reviewer) => reviewer.provider ?? reviewer.backend)),
    },
    l2: {
      supporters: params.config.supporters?.pool.filter((supporter) => supporter.enabled).length ?? 0,
      supporterModels,
      devilsAdvocate,
      moderator: agentRunFromConfig('moderator', params.config.moderator),
      discussions: params.moderatorReport.summary.totalDiscussions,
      skipped: !!params.l2Skipped,
    },
    l3: {
      head,
      skipped: !!params.skipHead,
    },
    queues: {
      activeFindings: params.evidenceDocs.length,
      suggestions: params.moderatorReport.suggestions.length,
      unconfirmed: params.moderatorReport.unconfirmedIssues.length,
      suppressed: params.suppressedIssues?.length ?? 0,
      hallucinationRemoved: params.hallucinationRemoved?.length ?? 0,
      hallucinationUncertain: params.hallucinationUncertain?.length ?? 0,
    },
    degraded: degradedReasons.length > 0,
    degradedReasons,
  };
}

/**
 * Track devil's advocate effectiveness if enabled.
 */
export function trackDA(config: Config, report: ModeratorReport) {
  const da = config.supporters?.devilsAdvocate;
  if (!da?.enabled) return undefined;
  return trackDevilsAdvocate(da.id, report.roundsPerDiscussion, report.discussions);
}

/**
 * Generate performance report text from telemetry data.
 */
export async function generatePerformanceText(telemetry: PipelineTelemetry): Promise<string> {
  try {
    const report = await generateReport(telemetry);
    if (report.summary.totalCalls === 0) return '';
    return formatReportText(report);
  } catch {
    return '';
  }
}
