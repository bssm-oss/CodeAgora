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

    // Single reviewer CRITICAL/WARNING → unconfirmed queue
    if (group.docs.length === 1 && ['CRITICAL', 'WARNING'].includes(group.primarySeverity)) {
      unconfirmed.push(...group.docs);
      continue;
    }

    // Fallback: Low-priority suggestions
    suggestions.push(...group.docs);
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

function groupByLocation(docs: EvidenceDocument[]): LocationGroup[] {
  const groups = new Map<string, LocationGroup>();

  for (const doc of docs) {
    const key = `${doc.filePath}:${doc.lineRange[0]}-${doc.lineRange[1]}`;

    if (!groups.has(key)) {
      groups.set(key, {
        filePath: doc.filePath,
        lineRange: doc.lineRange,
        issueTitle: doc.issueTitle,
        docs: [],
        primarySeverity: doc.severity,
      });
    }

    const group = groups.get(key)!;
    group.docs.push(doc);

    // Update primary severity (highest wins)
    if (severityRank(doc.severity) > severityRank(group.primarySeverity)) {
      group.primarySeverity = doc.severity;
    }
  }

  return Array.from(groups.values());
}

function countBySeverity(docs: EvidenceDocument[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    HARSHLY_CRITICAL: 0,
    CRITICAL: 0,
    WARNING: 0,
    SUGGESTION: 0,
  };

  for (const doc of docs) {
    counts[doc.severity]++;
  }

  return counts;
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
    status: 'pending',
  };
}
