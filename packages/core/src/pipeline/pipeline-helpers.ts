/**
 * Pipeline Result Helpers
 * Functions that build result maps and format pipeline output data.
 */

import type { ReviewOutput } from '../types/core.js';
import type { Config } from '../types/config.js';
import type { ModeratorReport } from '../types/core.js';
import { trackDevilsAdvocate } from '../l2/devils-advocate-tracker.js';
import { generateReport, formatReportText } from './report.js';
import type { PipelineTelemetry } from './telemetry.js';

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
