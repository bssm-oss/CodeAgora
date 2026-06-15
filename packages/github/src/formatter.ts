/**
 * GitHub Review Formatter
 * Markdown rendering, truncation, severity badges, and body building.
 * Extracted from mapper.ts to separate formatting/rendering from mapping logic.
 */

import type { EvidenceDocument, DiscussionVerdict, DiscussionRound, ReviewerOpinion, ReviewDecisionBrief, ReviewDecisionEvidenceCard } from '@codeagora/core/types/core.js';
import type { PipelineSummary, ReviewQueues, ReviewRunSummary } from '@codeagora/core/pipeline/orchestrator.js';
import { getConfidenceBadge } from '@codeagora/core/pipeline/confidence.js';
import { triageDocs } from '@codeagora/shared/utils/triage.js';
import { redactDeep } from '@codeagora/shared/utils/redaction.js';
import { containsHighRiskSpeculativeClaim } from '@codeagora/shared/utils/high-risk.js';

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

function isCriticalDiscussion(discussion: DiscussionVerdict): boolean {
  return discussion.finalSeverity === 'CRITICAL' || discussion.finalSeverity === 'HARSHLY_CRITICAL';
}

function isHighRiskSpeculativeDoc(doc: EvidenceDocument): boolean {
  return isCriticalSeverity(doc) &&
    containsHighRiskSpeculativeClaim([doc.issueTitle, doc.problem, ...doc.evidence, doc.suggestion].join('\n'));
}

function isLowConfidenceCriticalDiscussion(discussion: DiscussionVerdict): boolean {
  return isCriticalDiscussion(discussion) &&
    discussion.avgConfidence != null &&
    discussion.avgConfidence < SPECULATIVE_CONFIDENCE_MAX;
}

function isHighRiskSpeculativeDiscussion(discussion: DiscussionVerdict): boolean {
  return isLowConfidenceCriticalDiscussion(discussion) &&
    containsHighRiskSpeculativeClaim(discussion.reasoning);
}

function isSpeculativeCriticalDiscussion(discussion: DiscussionVerdict): boolean {
  return isLowConfidenceCriticalDiscussion(discussion) && !isHighRiskSpeculativeDiscussion(discussion);
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
    if (isCriticalSeverity(doc) && !isHighRiskSpeculativeDoc(doc) && (confidence < SPECULATIVE_CONFIDENCE_MAX || isHiddenClassPrior(doc))) {
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

function isNeedsHumanDiscussion(discussion: DiscussionVerdict): boolean {
  return isCriticalDiscussion(discussion) &&
    discussion.avgConfidence != null &&
    discussion.avgConfidence >= NEEDS_REPRO_CONFIDENCE_MAX &&
    discussion.avgConfidence < LOW_CONFIDENCE_CRITICAL_MAX;
}

function isNeedsReproDiscussion(discussion: DiscussionVerdict): boolean {
  return isCriticalDiscussion(discussion) &&
    discussion.avgConfidence != null &&
    discussion.avgConfidence >= SPECULATIVE_CONFIDENCE_MAX &&
    discussion.avgConfidence < NEEDS_REPRO_CONFIDENCE_MAX;
}

function formatSummaryTriageCounts(triage: ReturnType<typeof triageDocs>, discussions: DiscussionVerdict[]): string {
  const formatted = formatPublicTriageCounts(triage);
  const discussionNeedsHuman = discussions.filter(isNeedsHumanDiscussion).length;
  if (discussionNeedsHuman === 0) {
    return formatted;
  }
  if (formatted === 'no issues') {
    return `${discussionNeedsHuman} needs-human discussion`;
  }
  return `${formatted} \u00B7 ${discussionNeedsHuman} needs-human discussion`;
}

function formatLocation(doc: EvidenceDocument): string {
  if (!doc.filePath) return 'unknown';
  if (!doc.lineRange || typeof doc.lineRange[0] !== 'number') return doc.filePath;
  return `${doc.filePath}:${doc.lineRange[0]}`;
}

function firstEvidence(doc: EvidenceDocument): string {
  return Array.isArray(doc.evidence)
    ? doc.evidence.find((item) => item.trim().length > 0) ?? 'Inspect the referenced line and confirm the reported path.'
    : 'Inspect the referenced line and confirm the reported path.';
}

function rawFirstEvidence(doc: EvidenceDocument): string {
  return Array.isArray(doc.evidence)
    ? doc.evidence.find((item) => item.trim().length > 0)?.trim() ?? ''
    : '';
}

function confidenceValueLabel(value: number | undefined): string {
  return value === undefined ? 'n/a' : `${value}%`;
}

function formatPublicConfidenceBasis(doc: EvidenceDocument): string {
  const final = doc.confidenceTrace?.final ?? doc.confidence;
  const parts = [`final confidence ${confidenceValueLabel(final)}`];
  if (doc.confidenceTrace?.classPrior) {
    parts.push(`class prior ${doc.confidenceTrace.classPrior}`);
  }
  if (doc.confidenceTrace) {
    parts.push('stage trace hidden from summary');
  }
  return parts.join('; ');
}

function discussionConfidenceLabel(discussion: DiscussionVerdict): string {
  return discussion.avgConfidence == null ? 'confidence n/a' : `${discussion.avgConfidence}%`;
}

function formatDiscussionSeverityLabel(discussion: DiscussionVerdict): string {
  if (isHighRiskSpeculativeDiscussion(discussion)) {
    return `high-risk hypothesis (${discussionConfidenceLabel(discussion)})`;
  }
  if (isSpeculativeCriticalDiscussion(discussion)) {
    return `speculative hypothesis (${discussionConfidenceLabel(discussion)})`;
  }
  return discussion.finalSeverity;
}

function hasForcedDecisionTrace(discussion: DiscussionVerdict): boolean {
  return !discussion.consensusReached || /\b(?:forced decision|forced-tie-break|tie broken)\b/i.test(discussion.reasoning);
}

function isForcedSpeculativeDiscussion(discussion: DiscussionVerdict): boolean {
  return hasForcedDecisionTrace(discussion) && isSpeculativeCriticalDiscussion(discussion);
}

function formatDiscussionDecisionDisposition(discussion: DiscussionVerdict): string {
  if (isNeedsHumanDiscussion(discussion)) {
    return `human-gated critical-risk hypothesis (${discussionConfidenceLabel(discussion)})`;
  }
  if (isNeedsReproDiscussion(discussion)) {
    return `needs-repro critical hypothesis (${discussionConfidenceLabel(discussion)})`;
  }
  return formatDiscussionSeverityLabel(discussion);
}

function pushDiscussionDisposition(lines: string[], discussion: DiscussionVerdict): void {
  const severityLabel = formatDiscussionSeverityLabel(discussion);
  if (isForcedSpeculativeDiscussion(discussion)) {
    lines.push(`**Disposition:** ${severityLabel} — retained for auditability, but not treated as blocking without reproduction.`);
    lines.push(`**Trace:** ${discussion.reasoning}`);
    return;
  }
  if (isNeedsHumanDiscussion(discussion)) {
    lines.push(`**Disposition:** ${formatDiscussionDecisionDisposition(discussion)} — human check required before merge.`);
    lines.push(`**Trace:** ${discussion.reasoning}`);
    return;
  }
  if (isNeedsReproDiscussion(discussion)) {
    lines.push(`**Disposition:** ${formatDiscussionDecisionDisposition(discussion)} — non-blocking unless reproduced by the listed focused check.`);
    lines.push(`**Trace:** ${discussion.reasoning}`);
    return;
  }
  lines.push(`**Verdict:** ${severityLabel} \u2014 ${discussion.reasoning}`);
}

function countForcedSpeculativeDiscussions(discussions: DiscussionVerdict[]): number {
  return discussions.filter(isForcedSpeculativeDiscussion).length;
}

function pushDecisionSnapshot(
  lines: string[],
  publicDecision: PipelineSummary['decision'],
  publicVerify: ReturnType<typeof splitPublicVerifyDocs>,
  discussions: DiscussionVerdict[],
): void {
  const decisionGate = publicDecision === 'REJECT'
    ? 'merge blocked'
    : publicDecision === 'NEEDS_HUMAN'
      ? 'human review required'
      : '0';
  const followUpLater = publicVerify.needsHuman.length +
    publicVerify.needsRepro.length +
    publicVerify.verify.length +
    discussions.filter((discussion) => isNeedsHumanDiscussion(discussion) || isNeedsReproDiscussion(discussion)).length;
  const hiddenSpeculative = publicVerify.speculative.length + countForcedSpeculativeDiscussions(discussions);
  lines.push('### Decision Snapshot');
  lines.push('');
  lines.push('| Decision gate | Follow-up later | Ignored speculative |');
  lines.push('|---:|---:|---:|');
  lines.push(`| ${decisionGate} | ${followUpLater} | ${hiddenSpeculative} |`);
  lines.push('');
  if (publicDecision === 'NEEDS_HUMAN') {
    lines.push('Human-gated items require maintainer confirmation before merge. Needs-repro and speculative items remain non-blocking until reproduced or backed by stronger evidence.');
  } else {
    lines.push('Verdict is based on current blockers. Follow-up and speculative items are non-blocking until reproduced or backed by stronger evidence.');
  }
  lines.push('');
}

function formatContractItems(items: string[], empty = 'none'): string {
  if (items.length === 0) return empty;
  const visible = items.slice(0, 3).join('<br>');
  return items.length > 3 ? `${visible}<br>+${items.length - 3} more` : visible;
}

function formatFollowUpContract(count: number): string {
  if (count === 0) return 'none';
  return `${count} non-blocking follow-up item(s); inspect collapsed audit sections only if needed.`;
}

function pushMergeDecisionContract(
  lines: string[],
  publicDecision: PipelineSummary['decision'],
  triage: ReturnType<typeof triageDocs>,
  publicVerify: ReturnType<typeof splitPublicVerifyDocs>,
  discussions: DiscussionVerdict[],
): void {
  const mustFixItems = triage.mustFix.map((doc) => `\`${formatLocation(doc)}\` ${doc.issueTitle}`);
  const humanItems = [
    ...publicVerify.needsHuman.map((doc) => `\`${formatLocation(doc)}\` ${doc.issueTitle}`),
    ...discussions.filter(isNeedsHumanDiscussion).map((discussion) =>
      `${discussion.discussionId} \`${discussion.filePath}:${discussion.lineRange[0]}\` ${formatDiscussionDecisionDisposition(discussion)}`,
    ),
  ];
  const followUpItems = [
    ...publicVerify.needsRepro.map((doc) => `\`${formatLocation(doc)}\` ${doc.issueTitle}`),
    ...publicVerify.verify.map((doc) => `\`${formatLocation(doc)}\` ${doc.issueTitle}`),
    ...publicVerify.speculative.map((doc) => `\`${formatLocation(doc)}\` ${doc.issueTitle}`),
    ...discussions.filter(isForcedSpeculativeDiscussion).map((discussion) =>
      `${discussion.discussionId} \`${discussion.filePath}:${discussion.lineRange[0]}\` ${formatDiscussionSeverityLabel(discussion)}`,
    ),
  ];
  const mergeNow = publicDecision === 'ACCEPT' && mustFixItems.length === 0 && humanItems.length === 0
    ? 'yes'
    : 'no';
  const blockingLabel = mustFixItems.length > 0
    ? formatContractItems(mustFixItems)
    : publicDecision === 'REJECT'
      ? 'reject verdict; inspect final decision table'
      : 'none';

  lines.push('### Maintainer Decision Box');
  lines.push('');
  lines.push('| Question | Answer |');
  lines.push('|---|---|');
  lines.push(`| Merge now? | ${mergeNow} |`);
  lines.push(`| Pre-merge required | ${formatContractItems([...mustFixItems, ...humanItems], 'none')} |`);
  lines.push(`| Risk if skipped | ${blockingLabel === 'none' && humanItems.length === 0 ? 'No public pre-merge risk above the human-gate threshold.' : 'A listed pre-merge condition may still be unresolved.'} |`);
  lines.push(`| Follow-up only | ${formatFollowUpContract(followUpItems.length)} |`);
  lines.push('| Confidence rule | CRITICAL/HARSHLY_CRITICAL at >=60% blocks merge; 40-59% is a human gate; 20-39% is needs-repro appendix; <20% is speculative unless reproduced. |');
  lines.push('');
}

function pushTopMaintainerActionList(
  lines: string[],
  triage: ReturnType<typeof triageDocs>,
  publicVerify: ReturnType<typeof splitPublicVerifyDocs>,
  discussions: DiscussionVerdict[],
): void {
  const actions: Array<{ item: string; impact: string; confidence: string; action: string }> = [];
  for (const doc of triage.mustFix) {
    actions.push({
      item: `\`${formatLocation(doc)}\` ${doc.issueTitle}`,
      impact: truncateResponse(doc.problem, 120),
      confidence: confidenceValueLabel(doc.confidenceTrace?.final ?? doc.confidence),
      action: 'Fix before merge.',
    });
  }
  for (const doc of publicVerify.needsHuman) {
    actions.push({
      item: `\`${formatLocation(doc)}\` ${doc.issueTitle}`,
      impact: truncateResponse(doc.problem, 120),
      confidence: confidenceValueLabel(doc.confidenceTrace?.final ?? doc.confidence),
      action: `Confirm contract with \`${suggestedReproCommand(doc)}\`.`,
    });
  }
  for (const discussion of discussions.filter(isNeedsHumanDiscussion)) {
    actions.push({
      item: `${discussion.discussionId} \`${discussion.filePath}:${discussion.lineRange[0]}\``,
      impact: 'Human-gated discussion needs maintainer confirmation before merge.',
      confidence: discussionConfidenceLabel(discussion),
      action: `Run \`${suggestedDiscussionCommand(discussion)}\`.`,
    });
  }
  lines.push('### Maintainer Action List');
  lines.push('');
  if (actions.length === 0) {
    const followUpCount = publicVerify.speculative.length +
      publicVerify.verify.length +
      publicVerify.needsRepro.length +
      discussions.filter(isNeedsReproDiscussion).length +
      countForcedSpeculativeDiscussions(discussions);
    lines.push(`No pre-merge maintainer action required. ${formatFollowUpContract(followUpCount)}`);
    lines.push('');
    return;
  }
  lines.push('| Item | Why it matters | Confidence | Required action |');
  lines.push('|---|---|---:|---|');
  for (const action of actions.slice(0, 3)) {
    lines.push(`| ${action.item} | ${action.impact} | ${action.confidence} | ${action.action} |`);
  }
  lines.push('');
}


function pushFinalDecisionTable(
  lines: string[],
  triage: ReturnType<typeof triageDocs>,
  publicVerify: ReturnType<typeof splitPublicVerifyDocs>,
  discussions: DiscussionVerdict[],
): void {
  const rows: Array<{ item: string; confidence: string; disposition: string; blocks: string; action: string }> = [];

  for (const doc of triage.mustFix) {
    rows.push({
      item: `\`${formatLocation(doc)}\` — ${doc.issueTitle}`,
      confidence: confidenceValueLabel(doc.confidenceTrace?.final ?? doc.confidence),
      disposition: 'must-fix',
      blocks: 'yes',
      action: 'Fix before merge.',
    });
  }

  for (const doc of publicVerify.needsHuman) {
    rows.push({
      item: `\`${formatLocation(doc)}\` — ${doc.issueTitle}`,
      confidence: confidenceValueLabel(doc.confidenceTrace?.final ?? doc.confidence),
      disposition: 'needs human judgment',
      blocks: 'human gate',
      action: 'Confirm the contract or intended behavior.',
    });
  }

  for (const discussion of discussions.filter(isNeedsHumanDiscussion)) {
    rows.push({
      item: `${discussion.discussionId} — discussion verdict`,
      confidence: discussionConfidenceLabel(discussion),
      disposition: formatDiscussionDecisionDisposition(discussion),
      blocks: 'human gate',
      action: 'Run the evidence card below and confirm the contract.',
    });
  }

  if (rows.length === 0) {
    lines.push('### Final Decision Table');
    lines.push('');
    lines.push('No current blockers or human gates remain.');
    lines.push('');
    return;
  }

  lines.push('### Final Decision Table');
  lines.push('');
  lines.push('| Item | Confidence | Disposition | Blocks merge | Owner action |');
  lines.push('|---|---:|---|---|---|');
  for (const row of rows.slice(0, 8)) {
    lines.push(`| ${row.item} | ${row.confidence} | ${row.disposition} | ${row.blocks} | ${row.action} |`);
  }
  if (rows.length > 8) {
    lines.push(`| ${rows.length - 8} more item(s) | n/a | hidden for brevity | no | Inspect details below if needed. |`);
  }
  lines.push('');
}

function findEvidenceForDiscussion(discussion: DiscussionVerdict, docs: EvidenceDocument[]): EvidenceDocument | undefined {
  return docs.find((doc) =>
    doc.filePath === discussion.filePath &&
    doc.lineRange[0] <= discussion.lineRange[1] &&
    doc.lineRange[1] >= discussion.lineRange[0]
  );
}

function pushDiscussionEvidenceCards(lines: string[], discussions: DiscussionVerdict[], docs: EvidenceDocument[]): void {
  const humanGateDiscussions = discussions.filter(isNeedsHumanDiscussion);
  if (humanGateDiscussions.length === 0) return;

  lines.push('### Human Gate Evidence Cards');
  lines.push('');
  for (const discussion of humanGateDiscussions.slice(0, 3)) {
    const location = `${discussion.filePath}:${discussion.lineRange[0]}`;
    const doc = findEvidenceForDiscussion(discussion, docs);
    const command = suggestedDiscussionCommand(discussion);
    const observedChange = doc ? firstEvidence(doc) : discussion.reasoning;
    const impact = doc?.problem ?? 'The discussion kept this as a pre-merge contract check.';
    lines.push(`**${discussion.discussionId} — \`${location}\`**`);
    lines.push('');
    lines.push(`- Exact change to inspect: ${truncateResponse(observedChange, 180)}`);
    lines.push(`- Affected contract/callers: ${truncateResponse(impact, 180)}`);
    lines.push(`- Reproduce command: \`${command}\``);
    lines.push('- Expected result: the referenced contract remains compatible and the focused check passes.');
    lines.push('- Actual result to check: the focused command or code inspection reproduces the reported contract break.');
    lines.push('- Decision rule: pass removes the human gate; fail keeps the pre-merge gate until fixed.');
    lines.push(`- Trace: ${truncateResponse(discussion.reasoning, 140)}`);
    lines.push('');
  }
}

function cardMissingFields(card: Omit<ReviewDecisionEvidenceCard, 'complete' | 'missing'>): string[] {
  const missing: string[] = [];
  if (!card.filePath || card.filePath === 'unknown' || !card.lineRange || typeof card.lineRange[0] !== 'number' || card.lineRange[0] <= 0) {
    missing.push('exact file/line');
  }
  if (!(card.diffFact ?? '').trim()) missing.push('concrete diff fact');
  if (!(card.affectedContract ?? '').trim()) missing.push('affected contract/caller/invariant');
  if (!(card.check ?? '').trim()) missing.push('deterministic check or repro command');
  if (!(card.expectedActual ?? '').trim() && !(card.decisionRule ?? '').trim()) {
    missing.push('expected/actual or decision rule');
  }
  return missing;
}

function briefCardFromDoc(doc: EvidenceDocument, kind: ReviewDecisionEvidenceCard['kind']): ReviewDecisionEvidenceCard {
  const base = {
    kind,
    source: 'evidence' as const,
    title: doc.issueTitle,
    severity: doc.severity,
    filePath: doc.filePath,
    lineRange: doc.lineRange,
    confidence: doc.confidenceTrace?.final ?? doc.confidence,
    diffFact: rawFirstEvidence(doc),
    affectedContract: doc.problem,
    check: suggestedReproCommand(doc),
    expectedActual: doc.suggestion
      ? `Expected: ${truncateResponse(doc.suggestion, 160)}; actual: ${truncateResponse(rawFirstEvidence(doc), 160)}`
      : undefined,
    decisionRule: kind === 'must-fix'
      ? 'Keep REJECT only if the focused check confirms this contract break.'
      : 'Keep NEEDS_HUMAN only if the focused check cannot confirm the intended contract.',
  };
  const missing = cardMissingFields(base);
  return { ...base, complete: missing.length === 0, missing };
}

function buildFallbackDecisionBrief(
  summary: PipelineSummary,
  triage: ReturnType<typeof triageDocs>,
  publicVerify: ReturnType<typeof splitPublicVerifyDocs>,
  discussions: DiscussionVerdict[],
  evidenceDocs: EvidenceDocument[],
  run?: ReviewRunSummary,
): ReviewDecisionBrief {
  const mustFixCards = triage.mustFix.map((doc) => briefCardFromDoc(doc, 'must-fix'));
  const humanCards = [
    ...publicVerify.needsHuman.map((doc) => briefCardFromDoc(doc, 'human-gate')),
    ...discussions.filter(isNeedsHumanDiscussion).map((discussion) => {
      const doc = findEvidenceForDiscussion(discussion, evidenceDocs);
      const base = {
        kind: 'human-gate' as const,
        source: 'discussion' as const,
        title: `${discussion.discussionId} human-gated discussion`,
        severity: discussion.finalSeverity,
        filePath: discussion.filePath,
        lineRange: discussion.lineRange,
        confidence: discussion.avgConfidence,
        diffFact: doc ? rawFirstEvidence(doc) : discussion.reasoning,
        affectedContract: doc?.problem ?? discussion.reasoning,
        check: suggestedDiscussionCommand(discussion),
        expectedActual: doc?.suggestion
          ? `Expected: ${truncateResponse(doc.suggestion, 160)}; actual: ${truncateResponse(rawFirstEvidence(doc), 160)}`
          : undefined,
        decisionRule: 'Pass removes the human gate; fail keeps the pre-merge gate until fixed.',
      };
      const missing = cardMissingFields(base);
      return { ...base, complete: missing.length === 0, missing };
    }),
  ];
  const completeMustFix = mustFixCards.filter((card) => card.complete);
  const completeHuman = humanCards.filter((card) => card.complete);
  const decision: PipelineSummary['decision'] = completeMustFix.length > 0
    ? 'REJECT'
    : completeHuman.length > 0
      ? 'NEEDS_HUMAN'
      : 'ACCEPT';
  const files = [...new Set(evidenceDocs.map((doc) => doc.filePath).filter((file) => file && file !== 'unknown'))].slice(0, 6);
  const completedChecks = [
    run ? `L1 reviewers completed ${run.l1.completed}/${run.l1.configured}` : `${summary.totalReviewers} reviewer(s) completed`,
    run?.l2.skipped ? 'L2 discussion skipped by configuration' : `L2 discussions completed (${summary.totalDiscussions})`,
    run?.l3.skipped ? 'L3 head verdict skipped' : 'L3 head verdict completed',
    'hallucination filter applied',
    'confidence and triage thresholds applied',
  ];
  const demotedCount = [...mustFixCards, ...humanCards].filter((card) => !card.complete).length;
  return {
    decision,
    reviewedScope: {
      files,
      areas: files.length > 0 ? ['changed files with reviewer findings'] : ['reviewed PR diff'],
      contracts: evidenceDocs.slice(0, 3).map((doc) => truncateResponse(doc.problem, 96)),
      checks: completedChecks,
      uncertainty: 'Non-promoted findings remain follow-up/audit only unless reproduced with complete evidence.',
    },
    completedChecks,
    evidenceCards: decision === 'REJECT' ? completeMustFix : completeHuman,
    requiredActions: (decision === 'REJECT' ? completeMustFix : completeHuman)
      .map((card) => `${card.kind === 'must-fix' ? 'Fix' : 'Confirm'} ${card.filePath}:${card.lineRange[0]} ${card.title}`),
    followUpCount: publicVerify.verify.length + publicVerify.needsRepro.length + publicVerify.speculative.length + triage.ignore.length + demotedCount,
    auditCount: publicVerify.verify.length + publicVerify.needsRepro.length + publicVerify.speculative.length + triage.ignore.length + discussions.length + demotedCount,
    demotedCount,
  };
}

function cardMatchesDoc(card: ReviewDecisionEvidenceCard, doc: EvidenceDocument): boolean {
  return card.filePath === doc.filePath &&
    card.lineRange[0] <= doc.lineRange[1] &&
    card.lineRange[1] >= doc.lineRange[0];
}

function cardMatchesActiveDiscussion(card: ReviewDecisionEvidenceCard, discussion: DiscussionVerdict): boolean {
  return discussion.finalSeverity !== 'DISMISSED' &&
    card.filePath === discussion.filePath &&
    card.lineRange[0] <= discussion.lineRange[1] &&
    card.lineRange[1] >= discussion.lineRange[0];
}

function requiredActionFromBriefCard(card: ReviewDecisionEvidenceCard): string {
  const action = card.kind === 'must-fix' ? 'Fix' : 'Confirm';
  return `${action} ${card.filePath}:${card.lineRange[0]} ${card.title}`;
}

function reconcileProvidedDecisionBrief(
  brief: ReviewDecisionBrief,
  evidenceDocs: EvidenceDocument[],
  discussions: DiscussionVerdict[],
): ReviewDecisionBrief {
  const evidenceCards = brief.evidenceCards.filter((card) =>
    card.source === 'discussion'
      ? discussions.some((discussion) => cardMatchesActiveDiscussion(card, discussion))
      : evidenceDocs.some((doc) => cardMatchesDoc(card, doc))
  );
  if (evidenceCards.length === brief.evidenceCards.length) return brief;

  const decision: PipelineSummary['decision'] = evidenceCards.some((card) => card.kind === 'must-fix')
    ? 'REJECT'
    : evidenceCards.some((card) => card.kind === 'human-gate')
      ? 'NEEDS_HUMAN'
      : 'ACCEPT';
  const removedCount = brief.evidenceCards.length - evidenceCards.length;
  return {
    ...brief,
    decision,
    evidenceCards,
    requiredActions: evidenceCards.map(requiredActionFromBriefCard),
    followUpCount: brief.followUpCount + removedCount,
    auditCount: brief.auditCount + removedCount,
    demotedCount: brief.demotedCount + removedCount,
  };
}

export function resolveReviewDecisionBrief(params: {
  summary: PipelineSummary;
  evidenceDocs: EvidenceDocument[];
  discussions: DiscussionVerdict[];
  reviewRun?: ReviewRunSummary;
  decisionBrief?: ReviewDecisionBrief;
}): ReviewDecisionBrief {
  if (params.decisionBrief) {
    return reconcileProvidedDecisionBrief(params.decisionBrief, params.evidenceDocs, params.discussions);
  }
  const triage = triageDocs(params.evidenceDocs);
  const publicVerify = splitPublicVerifyDocs(triage.verify);
  return buildFallbackDecisionBrief(
    params.summary,
    triage,
    publicVerify,
    params.discussions,
    params.evidenceDocs,
    params.reviewRun,
  );
}

function formatCompactList(items: string[], empty: string, maxItems = 3): string {
  if (items.length === 0) return empty;
  const visible = items.slice(0, maxItems).join('; ');
  return items.length > maxItems ? `${visible}; +${items.length - maxItems} more` : visible;
}

function pushDecisionBriefTop(lines: string[], brief: ReviewDecisionBrief, summary: PipelineSummary): void {
  const vb = VERDICT_BADGE[brief.decision] ?? { emoji: '\u2753', label: brief.decision };
  lines.push(`## ${vb.emoji} CodeAgora: ${vb.label}`);
  lines.push('');
  lines.push(`**Decision:** ${brief.decision}`);
  if (brief.decision !== summary.decision) {
    lines.push(`**Head verdict adjusted for public gate:** ${summary.decision} -> ${brief.decision}; ${brief.demotedCount} item(s) lacked complete promotion evidence.`);
  }
  lines.push('');
  lines.push('### Why This Verdict');
  lines.push('');
  lines.push(`- Scope reviewed: ${formatCompactList(brief.reviewedScope.areas, 'PR diff')} (${formatCompactList(brief.reviewedScope.files, 'no source files listed')}).`);
  lines.push(`- Checks completed: ${formatCompactList(brief.completedChecks, 'review checks completed')}.`);
  if (brief.decision === 'ACCEPT') {
    lines.push(`- Gates: 0 promoted blockers, 0 promoted human gates; ${brief.followUpCount} follow-up/audit item(s) stay non-blocking.`);
    lines.push(`- Uncertainty boundary: ${brief.reviewedScope.uncertainty}`);
  } else {
    for (const card of brief.evidenceCards.slice(0, 2)) {
      lines.push(`- ${card.kind === 'must-fix' ? 'Must-fix' : 'Human gate'}: \`${card.filePath}:${card.lineRange[0]}\` ${card.title}`);
      lines.push(`  - Diff: ${truncateResponse(card.diffFact, 140)}`);
      lines.push(`  - Contract: ${truncateResponse(card.affectedContract, 140)}`);
      lines.push(`  - Check: \`${card.check}\``);
      lines.push(`  - Rule: ${truncateResponse(card.decisionRule, 140)}`);
    }
  }
  lines.push('');
  lines.push('### Required Action');
  lines.push('');
  if (brief.requiredActions.length === 0) {
    lines.push('No pre-merge action required. Inspect the audit appendix only for optional follow-up or debugging.');
  } else {
    for (const action of brief.requiredActions.slice(0, 3)) {
      lines.push(`- ${action}`);
    }
  }
  lines.push('');
}

function suggestedCommandForPath(filePath?: string, issueTitle = ''): string | null {
  if (!filePath) return null;
  if (/packages\/core\/src\/learning\/collector\.ts/.test(filePath)) {
    return 'pnpm vitest run packages/core/src/tests/learning-collector.test.ts';
  }
  if (/packages\/github\/src\/formatter\.ts/.test(filePath)) {
    return 'pnpm vitest run packages/github/src/tests/mapper.test.ts src/tests/github-mapper.test.ts';
  }
  if (/packages\/desktop\/src\/api\/desktop-bridge\.ts/.test(filePath)) {
    return 'pnpm vitest run src/tests/desktop-bridge.test.ts';
  }
  if (/packages\/shared\/src\/utils\/triage\.ts/.test(filePath)) {
    return 'pnpm vitest run packages/github/src/tests/mapper.test.ts src/tests/github-mapper.test.ts';
  }
  if (/packages\/cli\/src\/commands\/init\.ts/.test(filePath)) {
    return 'pnpm vitest run src/tests/cli-init-ci.test.ts src/tests/github-actions-runtime.test.ts';
  }
  if (/scripts\/evidence-manifest\.mjs/.test(filePath)) {
    return 'pnpm vitest run src/tests/release-evidence-manifest.test.ts';
  }
  if (/\.github\/workflows|workflow/i.test(filePath) || /workflow/i.test(issueTitle)) {
    return 'pnpm vitest run src/tests/github-actions-runtime.test.ts';
  }
  return null;
}

function commandLikeSnippet(text: string): string | null {
  const backtickMatches = [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]?.trim()).filter(Boolean);
  return backtickMatches.find((snippet) =>
    snippet!.length <= 160 &&
    !snippet!.includes('\n') &&
    /^(?:pnpm|npm|yarn|node|agora|codeagora|gh|git)\b/.test(snippet!)
  ) ?? null;
}

function suggestedReproCommand(doc: EvidenceDocument): string {
  const pathCommand = suggestedCommandForPath(doc.filePath, doc.issueTitle);
  if (pathCommand) return pathCommand;
  const evidenceArray = Array.isArray(doc.evidence) ? doc.evidence : [];
  const haystack = [doc.problem, ...evidenceArray, doc.suggestion].join('\n');
  const snippet = commandLikeSnippet(haystack);
  if (snippet) return snippet;
  return `Inspect ${formatLocation(doc)} and run the smallest command or test that exercises this path.`;
}

function suggestedDiscussionCommand(discussion: DiscussionVerdict): string {
  return suggestedCommandForPath(discussion.filePath) ??
    `Inspect ${discussion.filePath}:${discussion.lineRange[0]} and run the nearest focused test.`;
}

function pushReproCard(lines: string[], doc: EvidenceDocument): void {
  lines.push('- Repro card:');
  lines.push(`  - Try: ${suggestedReproCommand(doc)}`);
  lines.push(`  - Expected if valid: ${truncateResponse(doc.problem, 180)}`);
  lines.push(`  - Actual to check: ${truncateResponse(firstEvidence(doc), 180)}`);
  lines.push(`  - Pass condition: the expected and actual behavior match without relying on reviewer speculation.`);
}

function formatSummarySuggestion(suggestion: string): string {
  if (/```[\s\S]*```/.test(suggestion) || suggestion.length > 240) {
    return 'Code-level suggestion omitted from summary; verify the issue first, then inspect inline suggestions if needed.';
  }
  return truncateResponse(suggestion, 220);
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
      lines.push(`- Suggested fix: ${formatSummarySuggestion(doc.suggestion)}`);
    }
    if (label === 'Needs-repro') {
      pushReproCard(lines, doc);
    }
    lines.push(`- Confidence: ${formatPublicConfidenceBasis(doc)}`);
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

function queueItemKey(doc: EvidenceDocument): string {
  return [
    doc.filePath,
    doc.lineRange[0],
    doc.lineRange[1],
    doc.issueTitle.trim().toLowerCase(),
  ].join(':');
}

function hiddenQueueMessage(title: string, count: number): string {
  if (title === 'Removed by hallucination filter') {
    return `- ${count} rejected item(s) hidden from the public summary.`;
  }
  return `- ${count} low-confidence item(s) hidden from the public summary.`;
}

function queueDispositionReason(title: string, doc: EvidenceDocument): string {
  if (title === 'Removed by hallucination filter') {
    return 'rejected by hallucination checks; confidence omitted because the claim lacked diff support';
  }
  if (title === 'Uncertain after hallucination checks') {
    return `retained as uncertain after penalties; ${formatPublicConfidenceBasis(doc)}`;
  }
  if (doc.confidenceTrace?.classPrior) {
    return `low-confidence class prior: ${doc.confidenceTrace.classPrior}`;
  }
  return formatPublicConfidenceBasis(doc);
}

function queueImpactIfTrue(title: string, doc: EvidenceDocument): string {
  if (title === 'Removed by hallucination filter') {
    return 'No maintainer action expected unless a fresh review reproduces the claim with concrete diff evidence.';
  }
  if (title === 'Uncertain after hallucination checks') {
    return `Could matter if the observed signal is real: ${truncateResponse(doc.problem, 160)}`;
  }
  if (title === 'Unconfirmed') {
    return `Potential follow-up only: ${truncateResponse(doc.problem, 160)}`;
  }
  if (title === 'Suggestions') {
    return `Optional cleanup: ${truncateResponse(doc.problem, 160)}`;
  }
  return `Diagnostic context only: ${truncateResponse(doc.problem, 160)}`;
}

function formatHiddenQueueItem(title: string, doc: EvidenceDocument): string {
  const location = doc.filePath === 'unknown' || doc.lineRange[0] <= 0
    ? 'invalid location'
    : formatLocation(doc);
  return `- \`${location}\` — ${doc.issueTitle}; why non-blocking: ${queueDispositionReason(title, doc)}`;
}

function pushQueueTriageCard(lines: string[], title: string, doc: EvidenceDocument): void {
  const item = formatQueueItem(doc).replace(/^- /, '');
  lines.push(`- Claim: ${item}`);
  lines.push(`  - Evidence snippet: ${truncateResponse(firstEvidence(doc), 160)}`);
  lines.push(`  - User impact if true: ${queueImpactIfTrue(title, doc)}`);
  lines.push(`  - Why non-blocking now: ${queueDispositionReason(title, doc)}`);
  lines.push(`  - Repro/test to promote: \`${suggestedReproCommand(doc)}\``);
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
  if (run?.degraded) {
    lines.push('This run was degraded; treat these queues as diagnostic context until the degraded reason is resolved.');
    lines.push('');
  } else if (run?.l3.head) {
    lines.push('These queues did not meet the public blocking threshold; use them as follow-up context, not as merge blockers.');
    lines.push('');
  }
  lines.push('Queue counts are internal diagnostics. Item cards below are deduped by location/title and are not added to the decision gate.');
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
  const seenItems = new Set<string>();
  let duplicateItems = 0;
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
    let rendered = 0;
    for (const doc of visibleDocs) {
      const key = queueItemKey(doc);
      if (seenItems.has(key)) {
        duplicateItems += 1;
        continue;
      }
      seenItems.add(key);
      if (rendered >= 3) {
        continue;
      }
      pushQueueTriageCard(lines, title, doc);
      rendered += 1;
    }
    if (rendered === 0 && visibleDocs.length > 0) {
      lines.push('- All visible item(s) duplicate earlier queue cards.');
    }
    const hiddenInvalidCount = docs.length - visibleDocs.length;
    const uniqueVisibleCount = visibleDocs.filter((doc) => seenItems.has(queueItemKey(doc))).length;
    const remainingVisibleCount = Math.max(0, uniqueVisibleCount - 3);
    if (remainingVisibleCount > 0) {
      lines.push(`- ...and ${remainingVisibleCount} more deduped diagnostic item(s) hidden for brevity.`);
    }
    if (hiddenInvalidCount > 0) {
      lines.push(`- ${hiddenInvalidCount} invalid-location item(s) hidden.`);
    }
    lines.push('');
  }
  if (duplicateItems > 0) {
    lines.push(`${duplicateItems} duplicate queue item(s) omitted from the item cards; the first rendered disposition is authoritative.`);
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
    const forcedDecision = hasForcedDecisionTrace(discussion);
    const consensusIcon = forcedDecision ? '\u26A0\uFE0F' : '\u2705';
    const consensusText = forcedDecision ? 'forced decision' : 'consensus';
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

      pushDiscussionDisposition(lines, discussion);
      lines.push('');
      lines.push('</details>');
    } else {
      lines.push(
        `${consensusIcon} Discussion ${discussion.discussionId} \u2014 ${discussion.rounds} round(s), ${consensusText}`,
      );
      lines.push('');
      pushDiscussionDisposition(lines, discussion);
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
  /** Public decision brief with evidence-promotion results. */
  decisionBrief?: ReviewDecisionBrief;
}): string {
  const safeParams = redactDeep(params);
  const { summary, sessionId, sessionDate, evidenceDocs, discussions, questionsForHuman } = safeParams;
  const lines: string[] = [];

  lines.push(MARKER);
  lines.push('');
  const triage = triageDocs(evidenceDocs);
  const triageStr = formatSummaryTriageCounts(triage, discussions);
  const publicVerify = splitPublicVerifyDocs(triage.verify);
  const decisionBrief = resolveReviewDecisionBrief({
    summary,
    evidenceDocs,
    discussions,
    reviewRun: safeParams.reviewRun,
    decisionBrief: safeParams.decisionBrief,
  });
  const publicDecision = decisionBrief.decision;

  pushDecisionBriefTop(lines, decisionBrief, summary);
  lines.push('<details>');
  lines.push(`<summary>Review audit appendix (${triageStr})</summary>`);
  lines.push('');
  const metaParts = formatRoleMeta(summary, safeParams.reviewRun);
  if (metaParts) {
    lines.push(`**Run:** ${metaParts}`);
    lines.push('');
  }
  lines.push(`**${triageStr}**`);
  lines.push('');
  pushMergeDecisionContract(lines, publicDecision, triage, publicVerify, discussions);
  pushTopMaintainerActionList(lines, triage, publicVerify, discussions);
  pushFinalDecisionTable(lines, triage, publicVerify, discussions);
  pushDiscussionEvidenceCards(lines, discussions, evidenceDocs);
  pushDecisionSnapshot(lines, publicDecision, publicVerify, discussions);
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
    lines.push('<details>');
    lines.push(`<summary>Needs reproduction appendix (${publicVerify.needsRepro.length})</summary>`);
    lines.push('');
    lines.push('These low-confidence items are not pre-merge gates. Promote one only after the listed focused check reproduces it.');
    lines.push('');
    lines.push('| File | Issue | Final confidence | Repro command |');
    lines.push('|---|---|---:|---|');
    for (const doc of publicVerify.needsRepro) {
      const confCell = confidenceValueLabel(doc.confidenceTrace?.final ?? doc.confidence);
      lines.push(
        `| \`${formatLocation(doc)}\` | ${doc.issueTitle} | ${confCell} | \`${suggestedReproCommand(doc)}\` |`,
      );
    }
    lines.push('');
    pushIssueActionDetails(lines, publicVerify.needsRepro, 'Needs-repro');
    lines.push('</details>');
    lines.push('');
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
      const confCell = confidenceValueLabel(doc.confidenceTrace?.final ?? doc.confidence);
      lines.push(`- \`${formatLocation(doc)}\` — ${doc.issueTitle} (speculative, final ${confCell})`);
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
      const forcedDecision = hasForcedDecisionTrace(d);
      const consensusIcon = forcedDecision ? '\u26A0\uFE0F' : '\u2705';
      const consensusText = forcedDecision ? 'forced' : 'consensus';
      lines.push(`<details>`);
      lines.push(`<summary>${consensusIcon} ${d.discussionId} \u2014 ${d.rounds} round(s), ${consensusText} \u2192 ${formatDiscussionDecisionDisposition(d)}</summary>`);
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

      pushDiscussionDisposition(lines, d);
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

  lines.push('</details>');
  lines.push('');

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
