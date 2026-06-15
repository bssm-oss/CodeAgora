/**
 * GitHub Review Mapper
 * Maps CodeAgora domain types → GitHub API review shapes.
 *
 * Formatting/rendering logic lives in formatter.ts.
 * This module handles structural mapping: evidence docs → review comments, pipeline → review payload.
 */

import type { EvidenceDocument, DiscussionVerdict, DiscussionRound, ReviewerOpinion, ReviewDecisionBrief } from '@codeagora/core/types/core.js';
import type { GitHubReview, GitHubReviewComment, DiffPositionIndex } from './types.js';
import { resolveLineRange } from './diff-parser.js';
import type { PipelineSummary, ReviewQueues, ReviewRunSummary } from '@codeagora/core/pipeline/orchestrator.js';
import {
  mapToInlineCommentBody,
  buildSummaryBody,
  resolveReviewDecisionBrief,
  truncateReviewBody,
  MAX_REVIEW_BODY_CHARS,
  MAX_COMMENT_BODY_CHARS,
} from './formatter.js';
import type { MapperOptions } from './formatter.js';

// Re-export all formatter symbols for backward compatibility
export {
  MARKER,
  MAX_REVIEW_BODY_CHARS,
  MAX_COMMENT_BODY_CHARS,
  SEVERITY_BADGE,
  VERDICT_BADGE,
  truncateResponse,
  truncateReviewBody,
  buildTriageDigest,
  mapToInlineCommentBody,
  buildSummaryBody,
  resolveReviewDecisionBrief,
  buildReviewBadgeUrl,
} from './formatter.js';
export type { MapperOptions } from './formatter.js';

const DISCUSSION_LOCATION_TOLERANCE_LINES = 5;

function findDiscussionForDoc(
  doc: EvidenceDocument,
  discussions: DiscussionVerdict[],
): DiscussionVerdict | undefined {
  return discussions.find((discussion) =>
    discussion.filePath === doc.filePath &&
    Math.abs(discussion.lineRange[0] - doc.lineRange[0]) <= DISCUSSION_LOCATION_TOLERANCE_LINES
  );
}

function isDismissedByDiscussion(doc: EvidenceDocument, discussions: DiscussionVerdict[]): boolean {
  return findDiscussionForDoc(doc, discussions)?.finalSeverity === 'DISMISSED';
}

function rangesOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && a[1] >= b[0];
}

function docsForPublicDecision(
  docs: EvidenceDocument[],
  decisionBrief: ReviewDecisionBrief,
): EvidenceDocument[] {
  if (decisionBrief.decision === 'ACCEPT') return [];

  const promotedCards = decisionBrief.evidenceCards.filter((card) =>
    card.complete &&
    (decisionBrief.decision === 'REJECT' ? card.kind === 'must-fix' : card.kind === 'human-gate')
  );
  if (promotedCards.length === 0) return [];

  return docs.filter((doc) =>
    promotedCards.some((card) =>
      card.filePath === doc.filePath &&
      rangesOverlap(card.lineRange, doc.lineRange)
    )
  );
}

// ============================================================================
// Review Comment Builder
// ============================================================================

/**
 * Build GitHubReviewComment[] from EvidenceDocuments + position index.
 *
 * Issues whose lines cannot be resolved in the diff become file-level comments
 * (position field omitted, line reference prepended to body).
 */
export function buildReviewComments(
  evidenceDocs: EvidenceDocument[],
  discussions: DiscussionVerdict[],
  positionIndex: DiffPositionIndex,
  reviewerMap?: Map<string, string[]>,
  options?: MapperOptions,
  /** Per-discussion round data for inline debate logs (1.2) */
  roundsPerDiscussion?: Record<string, DiscussionRound[]>,
  /** Minimum confidence threshold for inline comments (1.6) */
  minConfidence?: number,
  /** Per-location reviewer opinions for individual L1 findings */
  reviewerOpinions?: Map<string, ReviewerOpinion[]>,
  /** Devil's Advocate supporter ID for annotation */
  devilsAdvocateId?: string,
  /** Maps supporterId → model name */
  supporterModelMap?: Map<string, string>,
): GitHubReviewComment[] {
  const comments: GitHubReviewComment[] = [];

  for (const doc of evidenceDocs) {
    // Skip dismissed issues using the same line tolerance as L2 confidence matching.
    const locationKey = `${doc.filePath}:${doc.lineRange[0]}`;
    const matchingDiscussion = findDiscussionForDoc(doc, discussions);

    if (matchingDiscussion?.finalSeverity === 'DISMISSED') continue;

    // Confidence filtering (1.6): skip inline comment if below threshold
    if (minConfidence !== undefined && minConfidence > 0) {
      if ((doc.confidenceTrace?.final ?? doc.confidence ?? 0) < minConfidence) continue;
    }

    const position = resolveLineRange(positionIndex, doc.filePath, doc.lineRange);
    const reviewerIds = reviewerMap?.get(`${doc.filePath}:${doc.lineRange[0]}`);
    const discussionRounds = matchingDiscussion
      ? roundsPerDiscussion?.[matchingDiscussion.discussionId]
      : undefined;
    const opinions = reviewerOpinions?.get(locationKey);
    let body = mapToInlineCommentBody(doc, matchingDiscussion, reviewerIds, options, discussionRounds, opinions, devilsAdvocateId, supporterModelMap);

    if (position !== null) {
      comments.push({
        path: doc.filePath,
        position,
        side: 'RIGHT',
        body,
      });
    } else {
      // File-level comment: prepend line reference
      body = `> \`${doc.filePath}:${doc.lineRange[0]}-${doc.lineRange[1]}\`\n\n${body}`;
      comments.push({
        path: doc.filePath,
        side: 'RIGHT',
        body,
      });
    }
  }

  return comments;
}

// ============================================================================
// Full Review Builder
// ============================================================================

/**
 * Map the full pipeline output to a single GitHub review payload.
 */
export function mapToGitHubReview(params: {
  summary: PipelineSummary;
  evidenceDocs: EvidenceDocument[];
  discussions: DiscussionVerdict[];
  positionIndex: DiffPositionIndex;
  headSha: string;
  sessionId: string;
  sessionDate: string;
  reviewerMap?: Map<string, string[]>;
  questionsForHuman?: string[];
  options?: MapperOptions;
  /** Pre-formatted performance report text (1.4) */
  performanceText?: string;
  /** Per-discussion round data (1.2, 1.3) */
  roundsPerDiscussion?: Record<string, DiscussionRound[]>;
  /** Suppressed issues for transparency (1.5) */
  suppressedIssues?: Array<{ filePath: string; lineRange: [number, number]; issueTitle: string; dismissCount?: number }>;
  /** Minimum confidence for inline comments (1.6) */
  minConfidence?: number;
  /** Per-location reviewer opinions for individual L1 findings */
  reviewerOpinions?: Map<string, ReviewerOpinion[]>;
  /** Devil's Advocate supporter ID for annotation */
  devilsAdvocateId?: string;
  /** Maps supporterId → model name */
  supporterModelMap?: Map<string, string>;
  /** Role-aware run summary for coverage and degraded-state reporting. */
  reviewRun?: ReviewRunSummary;
  /** Non-blocking and filtered queues retained for transparent reporting. */
  reviewQueues?: ReviewQueues;
  /** Public decision brief with evidence-promotion results. */
  decisionBrief?: ReviewDecisionBrief;
}): GitHubReview {
  const { summary, evidenceDocs, discussions, positionIndex, headSha, sessionId, sessionDate, reviewerMap, questionsForHuman, options, performanceText, roundsPerDiscussion, suppressedIssues, minConfidence, reviewerOpinions, devilsAdvocateId, supporterModelMap, reviewRun, reviewQueues, decisionBrief } =
    params;

  const activeDocs = evidenceDocs.filter((doc) => !isDismissedByDiscussion(doc, discussions));
  const resolvedDecisionBrief = resolveReviewDecisionBrief({
    summary,
    evidenceDocs: activeDocs,
    discussions,
    reviewRun,
    decisionBrief,
  });

  const publicCommentDocs = docsForPublicDecision(activeDocs, resolvedDecisionBrief);
  const comments = buildReviewComments(publicCommentDocs, discussions, positionIndex, reviewerMap, options, roundsPerDiscussion, minConfidence, reviewerOpinions, devilsAdvocateId, supporterModelMap);
  let body = buildSummaryBody({ summary, sessionId, sessionDate, evidenceDocs: activeDocs, discussions, questionsForHuman, performanceText, roundsPerDiscussion, suppressedIssues, devilsAdvocateId, supporterModelMap, reviewRun, reviewQueues, decisionBrief: resolvedDecisionBrief });

  // Enforce GitHub char limits (#268)
  if (body.length > MAX_REVIEW_BODY_CHARS) {
    body = truncateReviewBody(body, MAX_REVIEW_BODY_CHARS);
  }
  for (const c of comments) {
    if (c.body.length > MAX_COMMENT_BODY_CHARS) {
      c.body = c.body.slice(0, MAX_COMMENT_BODY_CHARS - 30) + '\n\n---\n*[Truncated — comment too long]*';
    }
  }

  // Determine event from head verdict decision (#258)
  const event: GitHubReview['event'] =
    resolvedDecisionBrief.decision === 'REJECT' ? 'REQUEST_CHANGES' :
    resolvedDecisionBrief.decision === 'ACCEPT' ? 'APPROVE' :
    'COMMENT';
  const verdict = resolvedDecisionBrief.decision;

  return {
    commit_id: headSha,
    event,
    verdict,
    body,
    comments,
  };
}
