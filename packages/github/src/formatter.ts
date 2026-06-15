/**
 * GitHub Review Formatter
 * Markdown rendering, truncation, severity badges, and body building.
 * Extracted from mapper.ts to separate formatting/rendering from mapping logic.
 */

import type { EvidenceDocument, DiscussionVerdict, DiscussionRound, ReviewerOpinion } from '@codeagora/core/types/core.js';
import type { PipelineSummary, ReviewQueues, ReviewRunSummary } from '@codeagora/core/pipeline/orchestrator.js';
import { getConfidenceBadge } from '@codeagora/core/pipeline/confidence.js';
import { triageDocs } from '@codeagora/shared/utils/triage.js';
import { redactDeep } from '@codeagora/shared/utils/redaction.js';

// ============================================================================
// Constants
// ============================================================================

export const MARKER = '<!-- codeagora-v3 -->';

/** GitHub enforces 65,535 char limit on review body; use 60K ceiling for safety. */
export const MAX_REVIEW_BODY_CHARS = 60_000;
/** GitHub enforces 65,535 char limit on individual comment body. */
export const MAX_COMMENT_BODY_CHARS = 60_000;

export const SEVERITY_BADGE: Record<string, { emoji: string; label: string }> = {
  HARSHLY_CRITICAL: { emoji: '\u{1F534}', label: 'HARSHLY CRITICAL' },
  CRITICAL: { emoji: '\u{1F534}', label: 'CRITICAL' },
  WARNING: { emoji: '\u{1F7E1}', label: 'WARNING' },
  SUGGESTION: { emoji: '\u{1F535}', label: 'SUGGESTION' },
};

export const VERDICT_BADGE: Record<string, { emoji: string; label: string }> = {
  ACCEPT: { emoji: '\u2705', label: 'ACCEPT' },
  REJECT: { emoji: '\u{1F534}', label: 'REJECT' },
  NEEDS_HUMAN: { emoji: '\u{1F7E0}', label: 'NEEDS HUMAN REVIEW' },
};

const LOW_CONFIDENCE_CRITICAL_MAX = 60;
const NEEDS_REPRO_CONFIDENCE_MAX = 40;
const SPECULATIVE_CONFIDENCE_MAX = 20;

// ============================================================================
// Truncation Helpers
// ============================================================================

/** Truncate a response to N chars, ending at sentence boundary if possible. */
export function truncateResponse(text: string, maxLen: number): string {
  const clean = text.replace(/\n/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const lastDot = cut.lastIndexOf('.');
  return (lastDot > maxLen * 0.5 ? cut.slice(0, lastDot + 1) : cut) + '...';
}

/**
 * Truncate review body to fit GitHub's limit.
 * Strips low-severity sections (suggestions, then warnings) first to preserve blocking issues.
 */
export function truncateReviewBody(body: string, maxLen: number): string {
  // Try removing suggestions section first
  let trimmed = body.replace(/<details>\s*<summary>\d+ suggestion\(s\)<\/summary>[\s\S]*?<\/details>\s*/g, '');
  if (trimmed.length <= maxLen) return trimmed;

  // Try removing warnings section
  trimmed = trimmed.replace(/<details>\s*<summary>\d+ warning\(s\)<\/summary>[\s\S]*?<\/details>\s*/g, '');
  if (trimmed.length <= maxLen) return trimmed;

  // Last resort: hard truncate
  return trimmed.slice(0, maxLen - 40) + '\n\n---\n*[Truncated — review body too long]*';
}

// ============================================================================
// Triage Digest
// ============================================================================

function evidenceConfidence(doc: EvidenceDocument): number {
  return doc.confidenceTrace?.final ?? doc.confidence ?? 50;
}

function isCriticalSeverity(doc: EvidenceDocument): boolean {
  return doc.severity === 'CRITICAL' || doc.severity === 'HARSHLY_CRITICAL';
}

const PUBLIC_SUMMARY_HIDDEN_CLASS_PRIORS = new Set([
  'provider-contract-flexibility',
  'review-run-summary-policy',
]);

function isHiddenClassPrior(doc: EvidenceDocument): boolean {
  return PUBLIC_SUMMARY_HIDDEN_CLASS_PRIORS.has(doc.confidenceTrace?.classPrior ?? '');
}

function splitPublicVerifyDocs(docs: EvidenceDocument[]): {
  needsHuman: EvidenceDocument[];
  needsRepro: EvidenceDocument[];
  speculative: EvidenceDocument[];
  verify: EvidenceDocument[];
} {
  const needsHuman: EvidenceDocument[] = [];
  const needsRepro: EvidenceDocument[] = [];
  const speculative: EvidenceDocument[] = [];
  const verify: EvidenceDocument[] = [];
  for (const doc of docs) {
    const confidence = evidenceConfidence(doc);
    if (isCriticalSeverity(doc) && (confidence < SPECULATIVE_CONFIDENCE_MAX || isHiddenClassPrior(doc))) {
      speculative.push(doc);
    } else if (isCriticalSeverity(doc) && confidence < NEEDS_REPRO_CONFIDENCE_MAX) {
      needsRepro.push(doc);
    } else if (isCriticalSeverity(doc) && confidence < LOW_CONFIDENCE_CRITICAL_MAX) {
      needsHuman.push(doc);
    } else {
      verify.push(doc);
    }
  }
  return { needsHuman, needsRepro, speculative, verify };
}

function formatPublicTriageCounts(triage: ReturnType<typeof triageDocs>): string {
  const { needsHuman, needsRepro, speculative, verify } = splitPublicVerifyDocs(triage.verify);
  const parts: string[] = [];
  if (triage.mustFix.length > 0) parts.push(`${triage.mustFix.length} must-fix`);
  if (needsHuman.length > 0) parts.push(`${needsHuman.length} needs-human`);
  if (needsRepro.length > 0) parts.push(`${needsRepro.length} needs-repro`);
  if (speculative.length > 0) parts.push(`${speculative.length} speculative hidden`);
  if (verify.length > 0) parts.push(`${verify.length} verify`);
  if (triage.ignore.length > 0) parts.push(`${triage.ignore.length} ignore`);
  return parts.join(' \u00B7 ') || 'no issues';
}

function formatLocation(doc: EvidenceDocument): string {
  return `${doc.filePath}:${doc.lineRange[0]}`;
}

function firstEvidence(doc: EvidenceDocument): string {
  return doc.evidence.find((item) => item.trim().length > 0) ?? 'Inspect the referenced line and confirm the reported path.';
}

function confidenceValueLabel(value: number | undefined): string {
  return value === undefined ? 'n/a' : `${value}%`;
}

function formatConfidenceBasis(doc: EvidenceDocument): string {
  const trace = doc.confidenceTrace;
  const final = doc.confidenceTrace?.final ?? doc.confidence;
  if (!trace) return `final ${confidenceValueLabel(final)}; no stage trace was recorded`;
  const parts = [
    `raw ${confidenceValueLabel(trace.raw)}`,
    `filtered ${confidenceValueLabel(trace.filtered)}`,
    `corroborated ${confidenceValueLabel(trace.corroborated)}`,
    trace.verified !== undefined ? `verified ${confidenceValueLabel(trace.verified)}` : undefined,
    `final ${confidenceValueLabel(trace.final ?? doc.confidence)}`,
    trace.evidence !== undefined ? `evidence ${Math.round(trace.evidence * 100)}%` : undefined,
    trace.classPrior ? `class prior ${trace.classPrior}` : undefined,
  ].filter(Boolean);
  return parts.join(' -> ');
}

function commandLikeSnippet(text: string): string | null {
  const backtickMatches = [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]?.trim()).filter(Boolean);
  return backtickMatches.find((snippet) =>
    /^(?:pnpm|npm|yarn|node|agora|codeagora|gh|git)\b/.test(snippet!) ||
    /\b(?:init|review|test|build|evidence|workflow)\b/.test(snippet!)
  ) ?? null;
}

function suggestedReproCommand(doc: EvidenceDocument): string {
  const haystack = [doc.problem, ...doc.evidence, doc.suggestion].join('\n');
  const snippet = commandLikeSnippet(haystack);
  if (snippet) return snippet;
  if (/packages\/cli\/src\/commands\/init\.ts/.test(doc.filePath)) {
    return 'pnpm dev init --preset action';
  }
  if (/\.github\/workflows|workflow/i.test(doc.issueTitle)) {
    return 'Inspect the generated workflow YAML for the referenced secret/config path.';
  }
  return `Inspect \`${formatLocation(doc)}\` and run the smallest command or test that exercises this path.`;
}

function pushReproCard(lines: string[], doc: EvidenceDocument): void {
  lines.push('- Repro card:');
  lines.push(`  - Try: ${suggestedReproCommand(doc)}`);
  lines.push(`  - Expected if valid: ${truncateResponse(doc.problem, 180)}`);
  lines.push(`  - Actual to check: ${truncateResponse(firstEvidence(doc), 180)}`);
  lines.push(`  - Pass condition: the expected and actual behavior match without relying on reviewer speculation.`);
}

function pushIssueActionDetails(lines: string[], docs: EvidenceDocument[], label: string): void {
  if (docs.length === 0) return;
  lines.push('<details>');
  lines.push(`<summary>${label} action details</summary>`);
  lines.push('');
  for (const doc of docs) {
    lines.push(`**\`${formatLocation(doc)}\` — ${doc.issueTitle}**`);
    lines.push('');
    lines.push(`- Why this matters: ${truncateResponse(doc.problem, 220)}`);
    lines.push(`- How to verify: ${truncateResponse(firstEvidence(doc), 220)}`);
    if (doc.suggestion) {
      lines.push(`- Suggested fix: ${truncateResponse(doc.suggestion, 220)}`);
    }
    if (label === 'Needs-repro') {
      pushReproCard(lines, doc);
    }
    lines.push(`- Confidence basis: ${formatConfidenceBasis(doc)}`);
    lines.push('');
  }
  lines.push('</details>');
  lines.push('');
}

/**
 * Build a one-line triage summary for quick developer orientation (#410).
 */
export function buildTriageDigest(docs: EvidenceDocument[]): string | null {
  if (docs.length === 0) return null;
  const triage = triageDocs(docs);
  const formatted = formatPublicTriageCounts(triage);
  return formatted === 'no issues' ? null : `\u{1F4CB} **Triage:** ${formatted}`;
}

function formatRoleMeta(summary: PipelineSummary, run?: ReviewRunSummary): string {
  if (!run) {
    const reviewerStr = summary.totalReviewers > 0 ? `${summary.totalReviewers} L1 reviewer(s)` : '';
    const debateStr = summary.totalDiscussions > 0 ? `${summary.totalDiscussions} debate(s)` : '';
    return [reviewerStr, debateStr].filter(Boolean).join(' \u00B7 ');
  }

  const l1 = run.l1.configured > 0
    ? `L1 ${run.l1.completed}/${run.l1.configured}`
    : '';
  const l2 = run.l2.skipped
    ? 'L2 skipped'
    : `L2 ${run.l2.supporters}${run.l2.devilsAdvocate ? '+DA' : ''}`;
  const l3 = run.l3.skipped ? 'head skipped' : run.l3.head ? 'head' : '';
  const debateStr = summary.totalDiscussions > 0 ? `${summary.totalDiscussions} debate(s)` : '0 debates';
  const degraded = run.degraded ? 'degraded' : '';
  return [l1, l2, l3, debateStr, degraded].filter(Boolean).join(' \u00B7 ');
}

function formatModelList(models: string[], max = 6): string {
  if (models.length === 0) return 'none';
  const visible = models.slice(0, max).map((model) => `\`${model}\``).join(', ');
  return models.length > max ? `${visible}, +${models.length - max} more` : visible;
}

function pushReviewCoverage(lines: string[], summary: PipelineSummary, run?: ReviewRunSummary): void {
  if (!run) return;

  lines.push('### Review Coverage');
  lines.push('');
  lines.push('| Stage | Result | Models |');
  lines.push('|---|---:|---|');
  lines.push(`| L1 reviewers | ${run.l1.completed}/${run.l1.configured} completed | ${formatModelList(run.l1.models)} |`);
  const l2Status = run.l2.skipped
    ? 'skipped'
    : `${run.l2.supporters} supporter(s)${run.l2.devilsAdvocate ? " + devil's advocate" : ''}`;
  lines.push(`| L2 debate | ${l2Status}; ${summary.totalDiscussions} discussion(s) | ${formatModelList(run.l2.supporterModels)} |`);
  const l3Status = run.l3.skipped ? 'skipped' : run.l3.head ? 'completed' : 'not configured';
  lines.push(`| L3 head verdict | ${l3Status} | ${run.l3.head ? `\`${run.l3.head.model}\`` : 'none'} |`);
  lines.push('');

  if (run.degraded) {
    lines.push(`**Degraded:** ${run.degradedReasons.join('; ')}`);
    lines.push('');
  }

  if (summary.decision === 'ACCEPT') {
    lines.push(
      'No blocking findings remained after reviewer corroboration, thresholding, discussion, and final verdict checks.',
    );
    lines.push('');
  }
}

function formatQueueItem(doc: EvidenceDocument): string {
  if (doc.filePath === 'unknown' || doc.lineRange[0] <= 0) {
    return `- ${doc.issueTitle} (invalid location)`;
  }
  const lineLabel = doc.lineRange[0] === doc.lineRange[1]
    ? `${doc.lineRange[0]}`
    : `${doc.lineRange[0]}-${doc.lineRange[1]}`;
  return `- \`${doc.filePath}:${lineLabel}\` — ${doc.issueTitle}`;
}

function hiddenQueueMessage(title: string, count: number): string {
  if (title === 'Removed by hallucination filter') {
    return `- ${count} rejected item(s) hidden from the public summary.`;
  }
  return `- ${count} low-confidence item(s) hidden from the public summary.`;
}

function queueDispositionReason(title: string, doc: EvidenceDocument): string {
  if (title === 'Removed by hallucination filter') {
    return `rejected by hallucination checks; ${formatConfidenceBasis(doc)}`;
  }
  if (title === 'Uncertain after hallucination checks') {
    return `retained as uncertain after penalties; ${formatConfidenceBasis(doc)}`;
  }
  if (doc.confidenceTrace?.classPrior) {
    return `low-confidence class prior: ${doc.confidenceTrace.classPrior}`;
  }
  return formatConfidenceBasis(doc);
}

function formatHiddenQueueItem(title: string, doc: EvidenceDocument): string {
  const location = doc.filePath === 'unknown' || doc.lineRange[0] <= 0
    ? 'invalid location'
    : formatLocation(doc);
  return `- \`${location}\` — ${doc.issueTitle}; ${queueDispositionReason(title, doc)}`;
}

function visibleQueueDocs(title: string, docs: EvidenceDocument[]): EvidenceDocument[] {
  if (title === 'Removed by hallucination filter') return [];
  return docs.filter((doc) => !PUBLIC_SUMMARY_HIDDEN_CLASS_PRIORS.has(doc.confidenceTrace?.classPrior ?? ''));
}

function pushNonBlockingQueues(lines: string[], run?: ReviewRunSummary, queues?: ReviewQueues): void {
  const queueCounts = run?.queues;
  if (!queueCounts) return;
  const total =
    queueCounts.suggestions +
    queueCounts.unconfirmed +
    queueCounts.suppressed +
    queueCounts.hallucinationRemoved +
    queueCounts.hallucinationUncertain;
  if (total === 0) return;

  lines.push('<details>');
  lines.push(`<summary>Non-blocking review queues (${total})</summary>`);
  lines.push('');
  lines.push('| Queue | Count | Meaning |');
  lines.push('|---|---:|---|');
  lines.push(`| Suggestions | ${queueCounts.suggestions} | Low-priority findings kept out of must-fix. |`);
  lines.push(`| Unconfirmed | ${queueCounts.unconfirmed} | Findings below the discussion threshold. |`);
  lines.push(`| Suppressed | ${queueCounts.suppressed} | Findings hidden by learned dismissal patterns. |`);
  lines.push(`| Removed by hallucination filter | ${queueCounts.hallucinationRemoved} | Findings rejected as unsupported by the diff. |`);
  lines.push(`| Uncertain after hallucination checks | ${queueCounts.hallucinationUncertain} | Findings retained with lower confidence. |`);
  lines.push('');

  const sections: Array<[string, EvidenceDocument[] | undefined]> = [
    ['Suggestions', queues?.suggestions],
    ['Unconfirmed', queues?.unconfirmed],
    ['Suppressed', queues?.suppressed],
    ['Removed by hallucination filter', queues?.hallucinationRemoved],
    ['Uncertain after hallucination checks', queues?.hallucinationUncertain],
  ];
  for (const [title, docs] of sections) {
    if (!docs || docs.length === 0) continue;
    const visibleDocs = visibleQueueDocs(title, docs);
    lines.push(`**${title}**`);
    if (visibleDocs.length === 0) {
      lines.push(hiddenQueueMessage(title, docs.length));
      for (const doc of docs.slice(0, 3)) {
        lines.push(formatHiddenQueueItem(title, doc));
      }
      if (docs.length > 3) {
        lines.push(`- ...and ${docs.length - 3} more hidden item(s)`);
      }
      lines.push('');
      continue;
    }
    for (const doc of visibleDocs.slice(0, 5)) {
      lines.push(formatQueueItem(doc));
    }
    const hiddenInvalidCount = docs.length - visibleDocs.length;
    const remainingVisibleCount = Math.max(0, visibleDocs.length - 5);
    if (remainingVisibleCount > 0) {
      lines.push(`- ...and ${remainingVisibleCount} more`);
    }
    if (hiddenInvalidCount > 0) {
      lines.push(`- ${hiddenInvalidCount} invalid-location item(s) hidden.`);
    }
    lines.push('');
  }

  lines.push('</details>');
  lines.push('');
}

// ============================================================================
// Inline Comment Body
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
  inputDoc: EvidenceDocument,
  inputDiscussion?: DiscussionVerdict,
  reviewerIds?: string[],
  options?: MapperOptions,
  /** Per-round debate data for this discussion (1.2) */
  inputRounds?: DiscussionRound[],
  /** Per-reviewer individual opinions for this location */
  inputOpinions?: ReviewerOpinion[],
  /** Devil's Advocate supporter ID for annotation */
  devilsAdvocateId?: string,
  /** Maps supporterId → model name */
  supporterModelMap?: Map<string, string>,
): string {
  const doc = redactDeep(inputDoc);
  const discussion = inputDiscussion ? redactDeep(inputDiscussion) : undefined;
  const rounds = inputRounds ? redactDeep(inputRounds) : undefined;
  const opinions = inputOpinions ? redactDeep(inputOpinions) : undefined;
  const badge = SEVERITY_BADGE[doc.severity] ?? { emoji: '\u26AA', label: doc.severity };
  const lines: string[] = [];

  lines.push(`${badge.emoji} **${badge.label}** \u2014 ${doc.issueTitle}`);
  lines.push('');
  const confidenceBadge = getConfidenceBadge(doc.confidenceTrace?.final ?? doc.confidence);
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
    const codeBlockMatch = /```[\w]*\n?([\s\S]*?)```/.exec(doc.suggestion);
    if (codeBlockMatch) {
      const extractedCode = codeBlockMatch[1];
      lines.push('```suggestion');
      lines.push(extractedCode!.replace(/\n$/, ''));
      lines.push('```');
    } else {
      lines.push(`**Suggestion:** ${doc.suggestion}`);
    }

    // Suggestion verification badge (#413)
    if (doc.suggestionVerified === 'passed') {
      lines.push('');
      lines.push('\u2705 *Suggestion verified \u2014 compiles successfully*');
    } else if (doc.suggestionVerified === 'failed') {
      lines.push('');
      lines.push('\u274C *Suggestion failed verification \u2014 may not compile*');
    }
  }

  // Individual reviewer opinions (L1)
  if (opinions && opinions.length > 1) {
    const severityBadge = (sev: string) => SEVERITY_BADGE[sev]?.emoji ?? '\u26AA';
    lines.push('');
    lines.push('<details>');
    lines.push(`<summary>\u{1F50D} Individual Reviews (${opinions.length} reviewers)</summary>`);
    lines.push('');
    for (const op of opinions) {
      lines.push(`**${op.reviewerId}** \u{1F4AC} \`${op.model}\` (${severityBadge(op.severity)} ${op.severity})`);
      lines.push('');
      lines.push(`> **Problem:** ${truncateResponse(op.problem, 200)}`);
      if (op.evidence.length > 0) {
        lines.push('>');
        lines.push(`> **Evidence:**`);
        for (const e of op.evidence) {
          lines.push(`> - ${truncateResponse(e, 150)}`);
        }
      }
      if (op.suggestion) {
        lines.push('>');
        lines.push(`> **Suggestion:** ${truncateResponse(op.suggestion, 200)}`);
      }
      lines.push('');
    }
    lines.push('</details>');
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
            const isDA = devilsAdvocateId && resp.supporterId === devilsAdvocateId;
            const displayName = supporterModelMap?.get(resp.supporterId) ?? resp.supporterId;
            const nameLabel = isDA ? `\u{1F608} ${displayName}` : displayName;
            lines.push(`| ${nameLabel} | ${stanceIcon} ${resp.stance.toUpperCase()} | ${summary} |`);
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
// Summary Body Builder
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
  /** Devil's Advocate supporter ID for annotation */
  devilsAdvocateId?: string;
  /** Maps supporterId → model name */
  supporterModelMap?: Map<string, string>;
  /** Role-aware run summary for coverage and degraded-state reporting. */
  reviewRun?: ReviewRunSummary;
  /** Non-blocking and filtered queues retained for transparent reporting. */
  reviewQueues?: ReviewQueues;
}): string {
  const safeParams = redactDeep(params);
  const { summary, sessionId, sessionDate, evidenceDocs, discussions, questionsForHuman } = safeParams;
  const lines: string[] = [];

  lines.push(MARKER);
  lines.push('');
  // Unified header: verdict + triage
  const vb = VERDICT_BADGE[summary.decision] ?? { emoji: '\u2753', label: summary.decision };
  const triage = triageDocs(evidenceDocs);
  const triageStr = formatPublicTriageCounts(triage);
  const publicVerify = splitPublicVerifyDocs(triage.verify);
  const metaParts = formatRoleMeta(summary, safeParams.reviewRun);

  lines.push(`## ${vb.emoji} CodeAgora: ${vb.label}`);
  lines.push('');
  lines.push(`**${triageStr}**${metaParts ? ` | ${metaParts}` : ''}`);
  lines.push('');
  lines.push(`> ${summary.reasoning}`);
  lines.push('');

  pushReviewCoverage(lines, summary, safeParams.reviewRun);
  pushNonBlockingQueues(lines, safeParams.reviewRun, safeParams.reviewQueues);

  // Must Fix section
  if (triage.mustFix.length > 0) {
    lines.push('### Must Fix');
    lines.push('');
    lines.push('| | File | Issue | Confidence |');
    lines.push('|--|------|-------|-----------|');
    for (const doc of triage.mustFix) {
      const badge = SEVERITY_BADGE[doc.severity]!;
      const conf = doc.confidenceTrace?.final ?? doc.confidence;
      const confCell = getConfidenceBadge(conf) || '\u2014';
      const unverified = (conf ?? 100) <= 30 ? ' \u26A0\uFE0F' : '';
      lines.push(
        `| ${badge.emoji}${unverified} | \`${formatLocation(doc)}\` | ${doc.issueTitle} | ${confCell} |`,
      );
    }
    lines.push('');
    pushIssueActionDetails(lines, triage.mustFix, 'Must-fix');
  }

  // Needs-human section: low-confidence CRITICAL+ findings are not must-fix.
  if (publicVerify.needsHuman.length > 0) {
    lines.push('### Needs Human');
    lines.push('');
    lines.push('| | File | Issue | Confidence |');
    lines.push('|--|------|-------|-----------|');
    for (const doc of publicVerify.needsHuman) {
      const confCell = getConfidenceBadge(doc.confidenceTrace?.final ?? doc.confidence) || '\u2014';
      lines.push(
        `| \u{1F7E0} | \`${formatLocation(doc)}\` | ${doc.issueTitle} | ${confCell} |`,
      );
    }
    lines.push('');
    pushIssueActionDetails(lines, publicVerify.needsHuman, 'Needs-human');
  }

  // Needs-repro section: lower-confidence CRITICAL+ findings need a concrete
  // reproduction before they should influence merge decisions.
  if (publicVerify.needsRepro.length > 0) {
    lines.push('### Needs Repro');
    lines.push('');
    lines.push('Confirm with a concrete reproduction before treating these as blockers.');
    lines.push('');
    lines.push('| | File | Issue | Confidence |');
    lines.push('|--|------|-------|-----------|');
    for (const doc of publicVerify.needsRepro) {
      const confCell = getConfidenceBadge(doc.confidenceTrace?.final ?? doc.confidence) || '\u2014';
      lines.push(
        `| \u{1F7E0} | \`${formatLocation(doc)}\` | ${doc.issueTitle} | ${confCell} |`,
      );
    }
    lines.push('');
    pushIssueActionDetails(lines, publicVerify.needsRepro, 'Needs-repro');
  }

  // Verify section: actionable non-blocking findings, typically warnings.
  if (publicVerify.verify.length > 0) {
    lines.push('### Verify');
    lines.push('');
    lines.push('| | File | Issue | Confidence |');
    lines.push('|--|------|-------|-----------|');
    for (const doc of publicVerify.verify) {
      const badge = SEVERITY_BADGE[doc.severity] ?? { emoji: '\uD83D\uDFE1' };
      const confCell = getConfidenceBadge(doc.confidenceTrace?.final ?? doc.confidence) || '\u2014';
      lines.push(
        `| ${badge.emoji} | \`${formatLocation(doc)}\` | ${doc.issueTitle} | ${confCell} |`,
      );
    }
    lines.push('');
    pushIssueActionDetails(lines, publicVerify.verify, 'Verify');
  }

  // Speculative hypotheses stay collapsed so 0-19% confidence findings do not
  // compete with actionable review signal.
  if (publicVerify.speculative.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>${publicVerify.speculative.length} speculative hypothesis(es) hidden</summary>`);
    lines.push('');
    lines.push('These are not merge blockers unless a human can reproduce them or add stronger evidence.');
    lines.push('');
    for (const doc of publicVerify.speculative) {
      const confCell = getConfidenceBadge(doc.confidenceTrace?.final ?? doc.confidence) || '\u2014';
      lines.push(`- \`${formatLocation(doc)}\` — ${doc.issueTitle} (${confCell})`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Suggestions (collapsible). When review queues are present, they already
  // render suggestions/unconfirmed findings with clearer labels.
  if (triage.ignore.length > 0 && !safeParams.reviewQueues) {
    lines.push('<details>');
    lines.push(`<summary>${triage.ignore.length} suggestion(s)</summary>`);
    lines.push('');
    for (const doc of triage.ignore) {
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
            const isDA = params.devilsAdvocateId && resp.supporterId === params.devilsAdvocateId;
            const displayName = params.supporterModelMap?.get(resp.supporterId) ?? resp.supporterId;
            const nameLabel = isDA ? `\u{1F608} ${displayName}` : displayName;
            lines.push(`| ${nameLabel} | ${stanceIcon} ${resp.stance.toUpperCase()} | ${summary} |`);
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

// ============================================================================
// Badge URL Builder
// ============================================================================

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
