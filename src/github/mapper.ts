/**
 * GitHub Review Mapper
 * Maps CodeAgora domain types → GitHub API review shapes.
 */

import type { EvidenceDocument, DiscussionVerdict } from '../types/core.js';
import { SEVERITY_ORDER } from '../types/core.js';
import type { GitHubReview, GitHubReviewComment, DiffPositionIndex } from './types.js';
import { resolveLineRange } from './diff-parser.js';
import type { PipelineSummary } from '../pipeline/orchestrator.js';

// ============================================================================
// Constants
// ============================================================================

const MARKER = '<!-- codeagora-v3 -->';

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

/**
 * Map a single EvidenceDocument to an inline comment body string.
 */
export function mapToInlineCommentBody(
  doc: EvidenceDocument,
  discussion?: DiscussionVerdict,
  reviewerIds?: string[],
): string {
  const badge = SEVERITY_BADGE[doc.severity] ?? { emoji: '\u26AA', label: doc.severity };
  const lines: string[] = [];

  lines.push(`${badge.emoji} **${badge.label}** \u2014 ${doc.issueTitle}`);
  lines.push('');
  lines.push(`**Problem:** ${doc.problem}`);

  if (doc.evidence.length > 0) {
    lines.push('');
    lines.push('**Evidence:**');
    for (let i = 0; i < doc.evidence.length; i++) {
      lines.push(`${i + 1}. ${doc.evidence[i]}`);
    }
  }

  if (doc.suggestion) {
    lines.push('');
    lines.push(`**Suggestion:** ${doc.suggestion}`);
  }

  if (discussion) {
    lines.push('');
    lines.push('<details>');
    const consensusText = discussion.consensusReached
      ? 'consensus reached'
      : 'forced decision';
    lines.push(
      `<summary>Discussion ${discussion.discussionId} \u2014 ${discussion.rounds} round(s), ${consensusText}</summary>`,
    );
    lines.push('');
    lines.push(discussion.reasoning);
    lines.push('');
    lines.push('</details>');
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

    const position = resolveLineRange(positionIndex, doc.filePath, doc.lineRange);
    const reviewerIds = reviewerMap?.get(`${doc.filePath}:${doc.lineRange[0]}`);
    let body = mapToInlineCommentBody(doc, matchingDiscussion, reviewerIds);

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
    lines.push('| Severity | File | Line | Issue |');
    lines.push('|----------|------|------|-------|');
    for (const doc of blocking) {
      const badge = SEVERITY_BADGE[doc.severity]!;
      lines.push(
        `| ${badge.emoji} ${badge.label} | \`${doc.filePath}\` | ${doc.lineRange[0]}\u2013${doc.lineRange[1]} | ${doc.issueTitle} |`,
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
    lines.push('| Severity | File | Line | Issue |');
    lines.push('|----------|------|------|-------|');
    for (const doc of warnings) {
      lines.push(
        `| \u{1F7E1} WARNING | \`${doc.filePath}\` | ${doc.lineRange[0]} | ${doc.issueTitle} |`,
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

  // Discussion log (collapsible)
  if (discussions.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>Agent consensus log (${discussions.length} discussion(s))</summary>`);
    lines.push('');
    for (const d of discussions) {
      const consensusText = d.consensusReached ? 'consensus reached' : 'forced decision';
      lines.push(
        `- **${d.discussionId}** \u2014 ${d.rounds} round(s), ${consensusText}: ${d.finalSeverity}`,
      );
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
}): GitHubReview {
  const { summary, evidenceDocs, discussions, positionIndex, headSha, sessionId, sessionDate, reviewerMap, questionsForHuman } =
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

  const comments = buildReviewComments(activeDocs, discussions, positionIndex, reviewerMap);
  const body = buildSummaryBody({ summary, sessionId, sessionDate, evidenceDocs: activeDocs, discussions, questionsForHuman });

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
