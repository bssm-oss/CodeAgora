/**
 * GitHub Review Mapper
 * Maps CodeAgora domain types → GitHub API review shapes.
 */

import type { EvidenceDocument, DiscussionVerdict, DiscussionRound } from '@codeagora/core/types/core.js';
import { SEVERITY_ORDER } from '@codeagora/core/types/core.js';
import type { GitHubReview, GitHubReviewComment, DiffPositionIndex } from './types.js';
import { resolveLineRange } from './diff-parser.js';
import type { PipelineSummary } from '@codeagora/core/pipeline/orchestrator.js';
import { getConfidenceBadge } from '@codeagora/core/pipeline/confidence.js';

// ============================================================================
// Constants
// ============================================================================

const MARKER = '<!-- codeagora-v3 -->';

/** Truncate a response to N chars, ending at sentence boundary if possible. */
function truncateResponse(text: string, maxLen: number): string {
  const clean = text.replace(/\n/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const lastDot = cut.lastIndexOf('.');
  return (lastDot > maxLen * 0.5 ? cut.slice(0, lastDot + 1) : cut) + '...';
}

const SEVERITY_BADGE: Record<string, { emoji: string; label: string }> = {
  HARSHLY_CRITICAL: { emoji: '\u{1F534}', label: 'HARSHLY CRITICAL' },
  CRITICAL: { emoji: '\u{1F534}', label: 'CRITICAL' },
  WARNING: { emoji: '\u{1F7E1}', label: 'WARNING' },
  SUGGESTION: { emoji: '\u{1F535}', label: 'SUGGESTION' },
};

const VERDICT_BADGE: Record<string, { emoji: string; label: string }> = {
  ACCEPT: { emoji: '\u2705', label: 'ACCEPT' },
  REJECT: { emoji: '\u{1F534}', label: 'REJECT' },
  NEEDS_HUMAN: { emoji: '\u{1F7E0}', label: 'NEEDS HUMAN REVIEW' },
};

// ============================================================================
// Inline Comment Mapper
// ============================================================================

export interface MapperOptions {
  /** When false, inline suggestion code blocks are omitted. Default: true (postSuggestions) */
  postSuggestions?: boolean;
  /** When false, discussion details render inline instead of collapsed. Default: true (collapseDiscussions) */
  collapseDiscussions?: boolean;
}

/**
 * Map a single EvidenceDocument to an inline comment body string.
 */
export function mapToInlineCommentBody(
  doc: EvidenceDocument,
  discussion?: DiscussionVerdict,
  reviewerIds?: string[],
  options?: MapperOptions,
  /** Per-round debate data for this discussion (1.2) */
  rounds?: DiscussionRound[],
): string {
  const badge = SEVERITY_BADGE[doc.severity] ?? { emoji: '\u26AA', label: doc.severity };
  const lines: string[] = [];

  lines.push(`${badge.emoji} **${badge.label}** \u2014 ${doc.issueTitle}`);
  lines.push('');
  const confidenceBadge = getConfidenceBadge(doc.confidence);
  if (confidenceBadge) {
    lines.push(`**Confidence:** ${confidenceBadge}`);
    lines.push('');
  }
  lines.push(`**Problem:** ${doc.problem}`);

  if (doc.evidence.length > 0) {
    lines.push('');
    lines.push('**Evidence:**');
    for (let i = 0; i < doc.evidence.length; i++) {
      lines.push(`${i + 1}. ${doc.evidence[i]}`);
    }
  }

  if (doc.suggestion && options?.postSuggestions !== false) {
    lines.push('');
    const codeBlockMatch = /```[\w]*\n([\s\S]*?)```/.exec(doc.suggestion);
    if (codeBlockMatch) {
      const extractedCode = codeBlockMatch[1];
      lines.push('```suggestion');
      lines.push(extractedCode!.replace(/\n$/, ''));
      lines.push('```');
    } else {
      lines.push(`**Suggestion:** ${doc.suggestion}`);
    }
  }

  if (discussion) {
    const consensusIcon = discussion.consensusReached ? '\u2705' : '\u26A0\uFE0F';
    const consensusText = discussion.consensusReached ? 'consensus' : 'forced decision';
    lines.push('');
    if (options?.collapseDiscussions !== false) {
      lines.push('<details>');
      lines.push(
        `<summary>${consensusIcon} Discussion ${discussion.discussionId} \u2014 ${discussion.rounds} round(s), ${consensusText}</summary>`,
      );
      lines.push('');

      // Per-round debate logs (1.2)
      if (rounds && rounds.length > 0) {
        for (const round of rounds) {
          if (round.round > 100) continue; // Skip synthetic objection rounds
          lines.push(`**Round ${round.round}**`);
          lines.push('| Supporter | Stance | Summary |');
          lines.push('|-----------|--------|---------|');
          for (const resp of round.supporterResponses) {
            const stanceIcon = resp.stance === 'agree' ? '\u2705' : resp.stance === 'disagree' ? '\u274C' : '\u2796';
            const summary = truncateResponse(resp.response, 100);
            lines.push(`| ${resp.supporterId} | ${stanceIcon} ${resp.stance.toUpperCase()} | ${summary} |`);
          }
          lines.push('');
        }
      }

      lines.push(`**Verdict:** ${discussion.finalSeverity} \u2014 ${discussion.reasoning}`);
      lines.push('');
      lines.push('</details>');
    } else {
      lines.push(
        `${consensusIcon} Discussion ${discussion.discussionId} \u2014 ${discussion.rounds} round(s), ${consensusText}`,
      );
      lines.push('');
      lines.push(`> ${discussion.reasoning}`);
    }
  }

  if (reviewerIds && reviewerIds.length > 0) {
    lines.push('');
    lines.push(`<sub>Flagged by: ${reviewerIds.join(', ')} \u00A0|\u00A0 CodeAgora</sub>`);
  }

  return lines.join('\n');
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
): GitHubReviewComment[] {
  // Build discussion lookup by filePath:startLine for exact matching
  const discussionByLocation = new Map<string, DiscussionVerdict>();
  for (const d of discussions) {
    const key = `${d.filePath}:${d.lineRange[0]}`;
    discussionByLocation.set(key, d);
  }

  const comments: GitHubReviewComment[] = [];

  for (const doc of evidenceDocs) {
    // Skip dismissed issues — exact match by file + line
    const locationKey = `${doc.filePath}:${doc.lineRange[0]}`;
    const matchingDiscussion = discussionByLocation.get(locationKey);

    if (matchingDiscussion?.finalSeverity === 'DISMISSED') continue;

    // Confidence filtering (1.6): skip inline comment if below threshold
    if (minConfidence !== undefined && minConfidence > 0) {
      if ((doc.confidence ?? 0) < minConfidence) continue;
    }

    const position = resolveLineRange(positionIndex, doc.filePath, doc.lineRange);
    const reviewerIds = reviewerMap?.get(`${doc.filePath}:${doc.lineRange[0]}`);
    const discussionRounds = matchingDiscussion
      ? roundsPerDiscussion?.[matchingDiscussion.discussionId]
      : undefined;
    let body = mapToInlineCommentBody(doc, matchingDiscussion, reviewerIds, options, discussionRounds);

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
// Summary Comment Builder
// ============================================================================

/**
 * Build the summary review body with verdict header, blocking table,
 * collapsible warnings/suggestions, and agent consensus log.
 */
export function buildSummaryBody(params: {
  summary: PipelineSummary;
  sessionId: string;
  sessionDate: string;
  evidenceDocs: EvidenceDocument[];
  discussions: DiscussionVerdict[];
  questionsForHuman?: string[];
  /** Pre-formatted performance report text (1.4) */
  performanceText?: string;
  /** Per-discussion round data for debate detail (1.3) */
  roundsPerDiscussion?: Record<string, DiscussionRound[]>;
  /** Suppressed issues for transparency (1.5) */
  suppressedIssues?: Array<{ filePath: string; lineRange: [number, number]; issueTitle: string; dismissCount?: number }>;
}): string {
  const { summary, sessionId, sessionDate, evidenceDocs, discussions, questionsForHuman } = params;
  const lines: string[] = [];

  lines.push(MARKER);
  lines.push('');
  lines.push('## CodeAgora Review');
  lines.push('');

  // Verdict line
  const vb = VERDICT_BADGE[summary.decision] ?? { emoji: '\u2753', label: summary.decision };
  const severityParts = SEVERITY_ORDER
    .filter((s) => (summary.severityCounts[s] ?? 0) > 0)
    .map((s) => `${summary.severityCounts[s]} ${s.toLowerCase()}`);

  lines.push(
    `**Verdict: ${vb.emoji} ${vb.label}** \u00B7 ${severityParts.join(' \u00B7 ')}`,
  );
  lines.push('');
  lines.push(`> ${summary.reasoning}`);
  lines.push('');

  // Blocking issues table
  const blocking = evidenceDocs.filter(
    (d) => d.severity === 'HARSHLY_CRITICAL' || d.severity === 'CRITICAL',
  );
  if (blocking.length > 0) {
    lines.push('### Blocking Issues');
    lines.push('');
    lines.push('| Severity | File | Line | Issue | Confidence |');
    lines.push('|----------|------|------|-------|------------|');
    for (const doc of blocking) {
      const badge = SEVERITY_BADGE[doc.severity]!;
      const confCell = getConfidenceBadge(doc.confidence) || '—';
      lines.push(
        `| ${badge.emoji} ${badge.label} | \`${doc.filePath}\` | ${doc.lineRange[0]}\u2013${doc.lineRange[1]} | ${doc.issueTitle} | ${confCell} |`,
      );
    }
    lines.push('');
  }

  // Warnings (collapsible)
  const warnings = evidenceDocs.filter((d) => d.severity === 'WARNING');
  if (warnings.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>${warnings.length} warning(s)</summary>`);
    lines.push('');
    lines.push('| Severity | File | Line | Issue | Confidence |');
    lines.push('|----------|------|------|-------|------------|');
    for (const doc of warnings) {
      const confCell = getConfidenceBadge(doc.confidence) || '—';
      lines.push(
        `| \u{1F7E1} WARNING | \`${doc.filePath}\` | ${doc.lineRange[0]} | ${doc.issueTitle} | ${confCell} |`,
      );
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Suggestions (collapsible)
  const suggestions = evidenceDocs.filter((d) => d.severity === 'SUGGESTION');
  if (suggestions.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>${suggestions.length} suggestion(s)</summary>`);
    lines.push('');
    for (const doc of suggestions) {
      lines.push(
        `- \`${doc.filePath}:${doc.lineRange[0]}\` \u2014 ${doc.issueTitle}`,
      );
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Issue heatmap (1.9)
  if (evidenceDocs.length > 0) {
    const fileCounts = new Map<string, number>();
    for (const doc of evidenceDocs) {
      fileCounts.set(doc.filePath, (fileCounts.get(doc.filePath) ?? 0) + 1);
    }
    const sorted = [...fileCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const maxCount = sorted[0]?.[1] ?? 1;

    lines.push('<details>');
    lines.push(`<summary>Issue distribution (${fileCounts.size} file(s))</summary>`);
    lines.push('');
    lines.push('| File | Issues |');
    lines.push('|------|--------|');
    for (const [file, count] of sorted) {
      const bar = '\u2588'.repeat(Math.max(1, Math.round((count / maxCount) * 12)));
      lines.push(`| \`${file}\` | ${bar} ${count} |`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Performance report (1.4)
  if (params.performanceText) {
    lines.push('<details>');
    lines.push(`<summary>Performance (${summary.totalReviewers} reviewer(s))</summary>`);
    lines.push('');
    lines.push(params.performanceText);
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Discussion log with round detail (1.3)
  if (discussions.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>Agent consensus log (${discussions.length} discussion(s))</summary>`);
    lines.push('');
    for (const d of discussions) {
      const consensusIcon = d.consensusReached ? '\u2705' : '\u26A0\uFE0F';
      const consensusText = d.consensusReached ? 'consensus' : 'forced';
      lines.push(`<details>`);
      lines.push(`<summary>${consensusIcon} ${d.discussionId} \u2014 ${d.rounds} round(s), ${consensusText} \u2192 ${d.finalSeverity}</summary>`);
      lines.push('');

      // Round-by-round detail if available
      const rounds = params.roundsPerDiscussion?.[d.discussionId];
      if (rounds && rounds.length > 0) {
        for (const round of rounds) {
          if (round.round > 100) continue; // Skip synthetic objection rounds
          lines.push(`**Round ${round.round}**`);
          lines.push('| Supporter | Stance | Summary |');
          lines.push('|-----------|--------|---------|');
          for (const resp of round.supporterResponses) {
            const stanceIcon = resp.stance === 'agree' ? '\u2705' : resp.stance === 'disagree' ? '\u274C' : '\u2796';
            const summary = truncateResponse(resp.response, 80);
            lines.push(`| ${resp.supporterId} | ${stanceIcon} ${resp.stance.toUpperCase()} | ${summary} |`);
          }
          lines.push('');
        }
      }

      lines.push(`**Verdict:** ${d.finalSeverity} \u2014 ${d.reasoning}`);
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
    lines.push('</details>');
    lines.push('');
  }

  // Suppressed issues transparency (1.5)
  if (params.suppressedIssues && params.suppressedIssues.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>${params.suppressedIssues.length} issue(s) suppressed by learned patterns</summary>`);
    lines.push('');
    for (const s of params.suppressedIssues) {
      const countInfo = s.dismissCount ? ` (dismissed ${s.dismissCount} times previously)` : '';
      lines.push(`- \`${s.filePath}:${s.lineRange[0]}\` \u2014 "${s.issueTitle}"${countInfo}`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Open questions (NEEDS_HUMAN)
  if (questionsForHuman && questionsForHuman.length > 0) {
    lines.push('### Open Questions');
    lines.push('');
    lines.push('CodeAgora could not reach a conclusion on the following. A human reviewer has been requested.');
    lines.push('');
    for (let i = 0; i < questionsForHuman.length; i++) {
      lines.push(`${i + 1}. ${questionsForHuman[i]}`);
    }
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(
    `<sub>CodeAgora \u00B7 Session: \`${sessionDate}/${sessionId}\`</sub>`,
  );

  return lines.join('\n');
}

/**
 * Generate a shields.io badge URL for the review verdict (1.11).
 */
export function buildReviewBadgeUrl(decision: string, severityCounts: Record<string, number>): string {
  const colorMap: Record<string, string> = {
    ACCEPT: 'brightgreen',
    REJECT: 'red',
    NEEDS_HUMAN: 'yellow',
  };
  const color = colorMap[decision] ?? 'lightgrey';

  const criticalCount = (severityCounts['HARSHLY_CRITICAL'] ?? 0) + (severityCounts['CRITICAL'] ?? 0);
  const detail = criticalCount > 0
    ? `${decision} (${criticalCount} critical)`
    : decision;

  return `https://img.shields.io/badge/CodeAgora-${encodeURIComponent(detail)}-${color}`;
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
}): GitHubReview {
  const { summary, evidenceDocs, discussions, positionIndex, headSha, sessionId, sessionDate, reviewerMap, questionsForHuman, options, performanceText, roundsPerDiscussion, suppressedIssues, minConfidence } =
    params;

  // Filter out dismissed docs — exact match by file + line
  const dismissedLocations = new Set(
    discussions
      .filter((d) => d.finalSeverity === 'DISMISSED')
      .map((d) => `${d.filePath}:${d.lineRange[0]}`),
  );
  const activeDocs = evidenceDocs.filter(
    (doc) => !dismissedLocations.has(`${doc.filePath}:${doc.lineRange[0]}`),
  );

  const comments = buildReviewComments(activeDocs, discussions, positionIndex, reviewerMap, options, roundsPerDiscussion, minConfidence);
  const body = buildSummaryBody({ summary, sessionId, sessionDate, evidenceDocs: activeDocs, discussions, questionsForHuman, performanceText, roundsPerDiscussion, suppressedIssues });

  // Determine event: REQUEST_CHANGES if any CRITICAL/HARSHLY_CRITICAL remains
  const hasBlocking = activeDocs.some(
    (d) => d.severity === 'HARSHLY_CRITICAL' || d.severity === 'CRITICAL',
  );
  const event: GitHubReview['event'] = hasBlocking ? 'REQUEST_CHANGES' : 'COMMENT';

  return {
    commit_id: headSha,
    event,
    body,
    comments,
  };
}
