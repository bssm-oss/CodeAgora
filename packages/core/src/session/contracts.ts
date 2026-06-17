/**
 * Stable session view contracts shared by desktop, CLI/MCP surfaces, and any
 * UI that consumes session query results.
 *
 * The raw query API in `queries.ts` intentionally exposes artifacts as they are
 * stored on disk. These contracts describe the normalized, presentation-ready
 * shape layered on top of those artifacts: verdict summaries, issue counts,
 * cost telemetry, and degraded-run signals.
 */

export type SessionReviewDecision = 'ACCEPT' | 'REJECT' | 'NEEDS_HUMAN';

export interface SessionReviewDecisionEvidenceCard {
  kind: 'must-fix' | 'human-gate';
  source: 'evidence' | 'discussion';
  title: string;
  severity: string;
  filePath: string;
  lineRange: [number, number];
  confidence?: number;
  diffFact: string;
  affectedContract: string;
  check: string;
  expectedActual?: string;
  decisionRule: string;
  complete: boolean;
  missing: string[];
}

export interface ReviewDecisionBrief {
  decision: SessionReviewDecision;
  reviewedScope: {
    files: string[];
    areas: string[];
    contracts: string[];
    checks: string[];
    uncertainty: string;
  };
  completedChecks: string[];
  evidenceCards: SessionReviewDecisionEvidenceCard[];
  requiredActions: string[];
  followUpCount: number;
  auditCount: number;
  demotedCount: number;
}

export interface SessionSeverityCounts {
  HARSHLY_CRITICAL?: number;
  CRITICAL?: number;
  WARNING?: number;
  SUGGESTION?: number;
}

export interface SessionTopIssue {
  severity: string;
  filePath: string;
  lineRange: [number, number];
  title: string;
  confidence?: number;
}

export interface SessionSummary {
  id: string;
  date: string;
  sessionId: string;
  status: 'completed' | 'failed' | 'interrupted' | 'in_progress' | 'unknown';
  dirPath?: string;
  /** Raw/stored verdict from the session artifact. */
  decision?: SessionReviewDecision;
  /** Public merge decision after evidence-promotion gates. */
  publicDecision?: SessionReviewDecision;
  reasoning?: string;
  severityCounts?: SessionSeverityCounts;
  topIssues?: SessionTopIssue[];
  updatedAt?: string;
}

export interface SessionCostSummary {
  known: boolean;
  formattedTotalCost: string;
  totalCost?: number;
  callCount?: number;
  totalTokens?: number;
  source?: string;
}

export interface SessionDetailView extends SessionSummary {
  /** Public decision brief. Contains promoted evidence only, no raw diff text. */
  decisionBrief?: ReviewDecisionBrief;
  findings?: SessionTopIssue[];
  markdown?: string;
  evidenceCount?: number;
  discussionsCount?: number;
  degraded?: boolean;
  degradedReasons?: string[];
  costSummary?: SessionCostSummary;
}
