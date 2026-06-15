import { triageDocs } from '@codeagora/shared/utils/triage.js';
import type {
  DiscussionVerdict,
  EvidenceDocument,
  HeadVerdict,
  ModeratorReport,
  ReviewDecisionBrief,
  ReviewDecisionEvidenceCard,
} from '../types/core.js';
import type { DiffComplexity } from './diff-complexity.js';
import type { EnrichedDiffContext } from './pre-analysis.js';
import type { ReviewQueues, PipelineSummary } from './orchestrator.js';
import type { ReviewRunSummary } from './pipeline-helpers.js';

const MAX_SCOPE_ITEMS = 6;

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

function truncate(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function locationIsExact(filePath?: string, lineRange?: [number, number]): boolean {
  return typeof filePath === 'string' &&
    filePath.trim().length > 0 &&
    filePath !== 'unknown' &&
    Array.isArray(lineRange) &&
    Number.isFinite(lineRange[0]) &&
    lineRange[0] > 0 &&
    Number.isFinite(lineRange[1]) &&
    lineRange[1] >= lineRange[0];
}

function firstEvidence(doc: EvidenceDocument): string {
  return Array.isArray(doc.evidence)
    ? doc.evidence.find((item) => item.trim().length > 0)?.trim() ?? ''
    : '';
}

function confidence(doc: EvidenceDocument): number | undefined {
  return doc.confidenceTrace?.final ?? doc.confidence;
}

function commandForPath(filePath?: string): string {
  if (!filePath) {
    return 'Inspect the diff and run the nearest focused validation.';
  }
  if (/\.test\.[cm]?[jt]sx?$|\/tests?\//i.test(filePath)) {
    return 'pnpm test';
  }
  if (/\.[cm]?tsx?$/.test(filePath)) {
    return 'pnpm typecheck';
  }
  if (/action\.ya?ml$|\.github\/workflows\//.test(filePath)) {
    return 'pnpm vitest run src/tests/github-actions-runtime.test.ts';
  }
  if (/package\.json|pnpm-lock\.yaml|tsconfig/.test(filePath)) {
    return 'pnpm typecheck';
  }
  return `Inspect ${filePath} and run the nearest focused validation.`;
}

function missingEvidenceFields(card: Omit<ReviewDecisionEvidenceCard, 'complete' | 'missing'>): string[] {
  const missing: string[] = [];
  if (!locationIsExact(card.filePath, card.lineRange)) missing.push('exact file/line');
  if (!(card.diffFact ?? '').trim()) missing.push('concrete diff fact');
  if (!(card.affectedContract ?? '').trim()) missing.push('affected contract/caller/invariant');
  if (!(card.check ?? '').trim()) missing.push('deterministic check or repro command');
  if (!(card.expectedActual ?? '').trim() && !(card.decisionRule ?? '').trim()) {
    missing.push('expected/actual or decision rule');
  }
  return missing;
}

function cardFromDoc(doc: EvidenceDocument, kind: ReviewDecisionEvidenceCard['kind']): ReviewDecisionEvidenceCard {
  const base = {
    kind,
    source: 'evidence' as const,
    title: doc.issueTitle,
    severity: doc.severity,
    filePath: doc.filePath,
    lineRange: doc.lineRange,
    confidence: confidence(doc),
    diffFact: firstEvidence(doc),
    affectedContract: (doc.problem ?? '').trim(),
    check: commandForPath(doc.filePath),
    expectedActual: doc.suggestion?.trim() ? `Expected: ${truncate(doc.suggestion, 160)}; actual: ${truncate(firstEvidence(doc) || doc.problem, 160)}` : undefined,
    decisionRule: kind === 'must-fix'
      ? 'Keep REJECT only if this diff fact still violates the named contract after the focused check.'
      : 'Keep NEEDS_HUMAN only if the focused check cannot confirm the intended contract.',
  };
  const missing = missingEvidenceFields(base);
  return { ...base, complete: missing.length === 0, missing };
}

function isCriticalDiscussion(discussion: DiscussionVerdict): boolean {
  return discussion.finalSeverity === 'CRITICAL' || discussion.finalSeverity === 'HARSHLY_CRITICAL';
}

function isHumanGateDiscussion(discussion: DiscussionVerdict): boolean {
  return isCriticalDiscussion(discussion) &&
    discussion.avgConfidence != null &&
    discussion.avgConfidence >= 40 &&
    discussion.avgConfidence < 60;
}

function findDocForDiscussion(discussion: DiscussionVerdict, docs: EvidenceDocument[]): EvidenceDocument | undefined {
  return docs.find((doc) =>
    doc.filePath === discussion.filePath &&
    doc.lineRange[0] <= discussion.lineRange[1] &&
    doc.lineRange[1] >= discussion.lineRange[0]
  );
}

function isDismissedByDiscussion(doc: EvidenceDocument, discussions: DiscussionVerdict[]): boolean {
  return discussions.some((discussion) =>
    discussion.finalSeverity === 'DISMISSED' &&
    discussion.filePath === doc.filePath &&
    discussion.lineRange[0] <= doc.lineRange[1] &&
    discussion.lineRange[1] >= doc.lineRange[0]
  );
}

function cardFromDiscussion(discussion: DiscussionVerdict, docs: EvidenceDocument[]): ReviewDecisionEvidenceCard {
  const doc = findDocForDiscussion(discussion, docs);
  const diffFact = doc ? firstEvidence(doc) : '';
  const affectedContract = doc?.problem?.trim() || (discussion.reasoning ?? '').trim();
  const base = {
    kind: 'human-gate' as const,
    source: 'discussion' as const,
    title: `${discussion.discussionId} human-gated discussion`,
    severity: discussion.finalSeverity,
    filePath: discussion.filePath,
    lineRange: discussion.lineRange,
    confidence: discussion.avgConfidence,
    diffFact,
    affectedContract,
    check: commandForPath(discussion.filePath),
    expectedActual: doc?.suggestion?.trim()
      ? `Expected: ${truncate(doc.suggestion, 160)}; actual: ${truncate(diffFact || discussion.reasoning, 160)}`
      : undefined,
    decisionRule: 'Pass removes the human gate; fail keeps the pre-merge gate until fixed or explicitly accepted.',
  };
  const missing = missingEvidenceFields(base);
  return { ...base, complete: missing.length === 0, missing };
}

function scopeFromEnrichment(
  docs: EvidenceDocument[],
  enrichedContext?: EnrichedDiffContext,
  diffComplexity?: DiffComplexity,
): ReviewDecisionBrief['reviewedScope'] {
  const files = unique([
    ...(enrichedContext ? [...enrichedContext.fileClassifications.keys()] : []),
    ...docs.map((doc) => doc.filePath),
  ]).slice(0, MAX_SCOPE_ITEMS);

  const areas = enrichedContext && enrichedContext.fileClassifications.size > 0
    ? [...new Set([...enrichedContext.fileClassifications.values()])].map((kind) => `${kind} changes`)
    : diffComplexity
      ? [`${diffComplexity.level} diff`, `${diffComplexity.fileCount} file(s)`]
      : ['changed files in PR diff'];

  const contracts = unique([
    ...(enrichedContext ? [...enrichedContext.impactAnalysis.values()].map((entry) =>
      `${entry.symbol}() has ${entry.callerCount} importer(s)`
    ) : []),
    ...(enrichedContext?.tscDiagnostics.slice(0, 3).map((diagnostic) =>
      `TS${diagnostic.code} at ${diagnostic.file}:${diagnostic.line}`
    ) ?? []),
    ...docs.slice(0, 3).map((doc) => truncate(doc.problem, 96)),
  ]).slice(0, MAX_SCOPE_ITEMS);

  const checks = [
    enrichedContext ? 'file classification' : undefined,
    enrichedContext ? 'impact analysis' : undefined,
    enrichedContext ? 'TypeScript diagnostics sweep' : undefined,
  ];

  return {
    files,
    areas: areas.slice(0, MAX_SCOPE_ITEMS),
    contracts,
    checks: unique(checks),
    uncertainty: 'Non-promoted findings remain follow-up/audit only unless reproduced with complete evidence.',
  };
}

function completedChecks(summary: PipelineSummary, run?: ReviewRunSummary): string[] {
  const checks = [
    run ? `L1 reviewers completed ${run.l1.completed}/${run.l1.configured}` : `${summary.totalReviewers} reviewer(s) completed`,
    run?.l2.skipped ? 'L2 discussion skipped by configuration' : `L2 discussions completed (${summary.totalDiscussions})`,
    run?.l3.skipped ? 'L3 head verdict skipped' : 'L3 head verdict completed',
    'hallucination filter applied',
    'confidence and triage thresholds applied',
  ];
  if (run?.degraded) checks.push(`degraded: ${run.degradedReasons.join('; ')}`);
  return checks;
}

function requiredActionForCard(card: ReviewDecisionEvidenceCard): string {
  const action = card.kind === 'must-fix' ? 'Fix before merge' : 'Confirm before merge';
  return `${action}: ${card.filePath}:${card.lineRange[0]} ${card.title}`;
}

export function buildReviewDecisionBrief(params: {
  summary: PipelineSummary;
  headVerdict?: HeadVerdict;
  evidenceDocs: EvidenceDocument[];
  moderatorReport: ModeratorReport;
  reviewRun?: ReviewRunSummary;
  reviewQueues?: ReviewQueues;
  enrichedContext?: EnrichedDiffContext;
  diffComplexity?: DiffComplexity;
}): ReviewDecisionBrief {
  const decisionDocs = params.evidenceDocs.filter((doc) => !isDismissedByDiscussion(doc, params.moderatorReport.discussions));
  const triage = triageDocs(decisionDocs);
  const mustFixCards = triage.mustFix.map((doc) => cardFromDoc(doc, 'must-fix'));
  const verifyCards = triage.verify
    .filter((doc) => {
      const isCritical = doc.severity === 'CRITICAL' || doc.severity === 'HARSHLY_CRITICAL';
      const conf = doc.confidenceTrace?.final ?? doc.confidence ?? 50;
      return isCritical && conf >= 40;
    })
    .map((doc) => cardFromDoc(doc, 'human-gate'));
  const discussionCards = params.moderatorReport.discussions
    .filter(isHumanGateDiscussion)
    .map((discussion) => cardFromDiscussion(discussion, decisionDocs));
  const completeMustFix = mustFixCards.filter((card) => card.complete);
  const completeHumanGate = [...verifyCards, ...discussionCards].filter((card) => card.complete);
  const demotedCount = [...mustFixCards, ...verifyCards, ...discussionCards].filter((card) => !card.complete).length;
  const decision: HeadVerdict['decision'] = completeMustFix.length > 0
    ? 'REJECT'
    : completeHumanGate.length > 0
      ? 'NEEDS_HUMAN'
      : 'ACCEPT';
  const queueCounts = params.reviewRun?.queues;
  const auditCount = (queueCounts?.suggestions ?? params.reviewQueues?.suggestions.length ?? 0) +
    (queueCounts?.unconfirmed ?? params.reviewQueues?.unconfirmed.length ?? 0) +
    (queueCounts?.suppressed ?? params.reviewQueues?.suppressed.length ?? 0) +
    (queueCounts?.hallucinationRemoved ?? params.reviewQueues?.hallucinationRemoved.length ?? 0) +
    (queueCounts?.hallucinationUncertain ?? params.reviewQueues?.hallucinationUncertain.length ?? 0) +
    demotedCount;
  const promotedCards = decision === 'REJECT' ? completeMustFix : completeHumanGate;

  return {
    decision,
    reviewedScope: scopeFromEnrichment(decisionDocs, params.enrichedContext, params.diffComplexity),
    completedChecks: completedChecks(params.summary, params.reviewRun),
    evidenceCards: promotedCards,
    requiredActions: promotedCards.map(requiredActionForCard),
    followUpCount: triage.ignore.length + (triage.verify.length - verifyCards.length) + demotedCount,
    auditCount,
    demotedCount,
  };
}
