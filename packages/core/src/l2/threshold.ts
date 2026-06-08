/**
 * L2 Threshold - Discussion Registration Logic
 * Determines which issues become Discussions based on Severity thresholds
 */

import type { EvidenceDocument, Discussion, Severity } from '../types/core.js';
import type { DiscussionSettings } from '../types/config.js';

// ============================================================================
// Discussion Registration
// ============================================================================

export interface ThresholdResult {
  discussions: Discussion[];
  unconfirmed: EvidenceDocument[]; // 1 reviewer only, CRITICAL/WARNING
  suggestions: EvidenceDocument[]; // SUGGESTION severity
}

/**
 * Apply registration threshold to group evidence documents
 */
export function applyThreshold(
  evidenceDocs: EvidenceDocument[],
  settings: DiscussionSettings
): ThresholdResult {
  // Group by file:line
  const grouped = groupByLocation(evidenceDocs);

  const discussions: Discussion[] = [];
  const unconfirmed: EvidenceDocument[] = [];
  const suggestions: EvidenceDocument[] = [];
  const counter = { value: 1 };

  for (const group of grouped) {
    const severityCounts = countBySeverity(group.docs);

    // SUGGESTION: Never becomes Discussion
    if (group.primarySeverity === 'SUGGESTION') {
      suggestions.push(...group.docs);
      continue;
    }

    // HARSHLY_CRITICAL: 1명 → 즉시 등록
    const hcThreshold = settings.registrationThreshold.HARSHLY_CRITICAL;
    if (hcThreshold !== null && hcThreshold !== 0 && severityCounts.HARSHLY_CRITICAL >= hcThreshold) {
      discussions.push(createDiscussion(group, 'HARSHLY_CRITICAL', counter));
      continue;
    }

    // CRITICAL: 1명 + (서포터 검증 필요)
    // For now, register if threshold met (supporter approval added in discussion phase)
    const criticalThreshold = settings.registrationThreshold.CRITICAL;
    if (criticalThreshold !== null && criticalThreshold !== 0 && severityCounts.CRITICAL >= criticalThreshold) {
      discussions.push(createDiscussion(group, 'CRITICAL', counter));
      continue;
    }

    // WARNING: 2명+
    const warningThreshold = settings.registrationThreshold.WARNING;
    if (warningThreshold !== null && warningThreshold !== 0 && severityCounts.WARNING >= warningThreshold) {
      discussions.push(createDiscussion(group, 'WARNING', counter));
      continue;
    }

    // A single reviewer can still catch a real high-risk boundary issue.
    // Keep the global WARNING threshold conservative, but do not silently
    // dismiss auth/security/data-integrity warnings that have concrete signal.
    if (group.docs.some(isHighRiskWarning)) {
      discussions.push(createDiscussion(group, 'WARNING', counter));
      continue;
    }

    // Route individual docs by their own severity — handles both single-reviewer
    // and mixed-severity groups (e.g. 1 CRITICAL + 1 WARNING) that failed to
    // meet threshold. Prevents mixed groups from silently falling into SUGGESTION.
    for (const doc of group.docs) {
      if (doc.severity === 'CRITICAL' || doc.severity === 'HARSHLY_CRITICAL' || doc.severity === 'WARNING') {
        unconfirmed.push(doc);
      } else {
        suggestions.push(doc);
      }
    }
  }

  return { discussions, unconfirmed, suggestions };
}

// ============================================================================
// Grouping Helpers
// ============================================================================

interface LocationGroup {
  filePath: string;
  lineRange: [number, number];
  issueTitle: string;
  docs: EvidenceDocument[];
  primarySeverity: Severity;
}

/**
 * Fuzzy line-range tolerance for grouping — two reviewers flagging nearby
 * lines on the same file are treated as the same location.
 * 15 lines covers most single-function bodies (#234).
 */
const LINE_PROXIMITY = 15;

function groupByLocation(docs: EvidenceDocument[]): LocationGroup[] {
  const groups: LocationGroup[] = [];

  for (const doc of docs) {
    // Find existing group for the same file with overlapping/nearby line range
    const existing = groups.find(
      (g) =>
        g.filePath === doc.filePath &&
        doc.lineRange[0] <= g.lineRange[1] + LINE_PROXIMITY &&
        doc.lineRange[1] >= g.lineRange[0] - LINE_PROXIMITY,
    );

    if (existing) {
      existing.docs.push(doc);
      // Expand range to cover both
      existing.lineRange = [
        Math.min(existing.lineRange[0], doc.lineRange[0]),
        Math.max(existing.lineRange[1], doc.lineRange[1]),
      ];
      if (severityRank(doc.severity) > severityRank(existing.primarySeverity)) {
        existing.primarySeverity = doc.severity;
      }
    } else {
      groups.push({
        filePath: doc.filePath,
        lineRange: [...doc.lineRange],
        issueTitle: doc.issueTitle,
        docs: [doc],
        primarySeverity: doc.severity,
      });
    }
  }

  return groups;
}

function countBySeverity(docs: EvidenceDocument[]): Record<Severity, number> {
  const reviewersBySeverity: Record<Severity, Set<string>> = {
    HARSHLY_CRITICAL: new Set(),
    CRITICAL: new Set(),
    WARNING: new Set(),
    SUGGESTION: new Set(),
  };

  docs.forEach((doc, index) => {
    reviewersBySeverity[doc.severity].add(doc.reviewerId ?? `finding:${index}`);
  });

  return {
    HARSHLY_CRITICAL: reviewersBySeverity.HARSHLY_CRITICAL.size,
    CRITICAL: reviewersBySeverity.CRITICAL.size,
    WARNING: reviewersBySeverity.WARNING.size,
    SUGGESTION: reviewersBySeverity.SUGGESTION.size,
  };
}

function severityRank(severity: Severity): number {
  const ranks: Record<Severity, number> = {
    HARSHLY_CRITICAL: 4,
    CRITICAL: 3,
    WARNING: 2,
    SUGGESTION: 1,
  };
  return ranks[severity];
}

const HIGH_RISK_WARNING_RE = /\b(auth|authz|authorization|permission|rbac|tenant|session|token|jwt|secret|credential|signature|csrf|ssrf|sql|query|injection|shell|command|path traversal|upload|webhook|payment|refund|quota|ledger|transaction|idempot|rollback|cache|state)\b/i;

function findingConfidence(doc: EvidenceDocument): number | undefined {
  return doc.confidenceTrace?.final
    ?? doc.confidenceTrace?.verified
    ?? doc.confidenceTrace?.corroborated
    ?? doc.confidence;
}

function isHighRiskWarning(doc: EvidenceDocument): boolean {
  if (doc.severity !== 'WARNING') return false;
  const confidence = findingConfidence(doc);
  if (confidence !== undefined && confidence < 50) return false;
  const searchable = [
    doc.filePath,
    doc.issueTitle,
    doc.problem,
    ...doc.evidence,
    doc.suggestion,
  ].join(' ');
  return HIGH_RISK_WARNING_RE.test(searchable);
}

// ============================================================================
// Discussion Creation
// ============================================================================

function createDiscussion(group: LocationGroup, severity: Severity, counter: { value: number }): Discussion {
  const id = `d${String(counter.value++).padStart(3, '0')}`;

  return {
    id,
    severity,
    issueTitle: group.issueTitle,
    filePath: group.filePath,
    lineRange: group.lineRange,
    codeSnippet: '', // Populated by moderator
    evidenceDocs: group.docs.map((d) => `evidence-${d.issueTitle.replace(/\s+/g, '-')}.md`),
    evidenceContent: group.docs, // Actual L1 content for supporter prompts (#246)
    status: 'pending',
  };
}
