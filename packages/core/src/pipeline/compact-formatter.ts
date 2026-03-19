/**
 * Context-Optimized Compact Output (6.4)
 * Minimal JSON format (~400 tokens) for MCP tool responses.
 * Strips verbose text, keeps only structured data.
 */

import type { EvidenceDocument, DiscussionVerdict } from '../types/core.js';

export interface CompactIssue {
  severity: string;
  file: string;
  line: number;
  title: string;
  confidence: number;
  flaggedBy?: string[];
}

export interface CompactReviewResult {
  decision: string;
  reasoning: string;
  issues: CompactIssue[];
  summary: string;
  cost?: string;
  sessionId?: string;
}

/**
 * Convert full pipeline output to compact format.
 */
export function formatCompact(params: {
  decision: string;
  reasoning: string;
  evidenceDocs: EvidenceDocument[];
  discussions?: DiscussionVerdict[];
  reviewerMap?: Record<string, string[]>;
  cost?: string;
  sessionId?: string;
}): CompactReviewResult {
  const { decision, reasoning, evidenceDocs, discussions, reviewerMap, cost, sessionId } = params;

  // Filter out dismissed issues
  const dismissedLocations = new Set(
    (discussions ?? [])
      .filter(d => d.finalSeverity === 'DISMISSED')
      .map(d => `${d.filePath}:${d.lineRange[0]}`)
  );

  const activeIssues = evidenceDocs.filter(
    doc => !dismissedLocations.has(`${doc.filePath}:${doc.lineRange[0]}`)
  );

  const issues: CompactIssue[] = activeIssues.map(doc => {
    const key = `${doc.filePath}:${doc.lineRange[0]}`;
    const issue: CompactIssue = {
      severity: doc.severity,
      file: doc.filePath,
      line: doc.lineRange[0],
      title: doc.issueTitle,
      confidence: doc.confidence ?? 50,
    };
    const flaggers = reviewerMap?.[key];
    if (flaggers && flaggers.length > 0) {
      issue.flaggedBy = flaggers;
    }
    return issue;
  });

  // Severity summary
  const counts: Record<string, number> = {};
  for (const issue of issues) {
    counts[issue.severity] = (counts[issue.severity] ?? 0) + 1;
  }
  const summaryParts = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sev, count]) => `${count} ${sev.toLowerCase()}`);
  const summary = summaryParts.join(', ') || 'no issues';

  return {
    decision,
    reasoning: reasoning.slice(0, 200),
    issues,
    summary,
    ...(cost && { cost }),
    ...(sessionId && { sessionId }),
  };
}
