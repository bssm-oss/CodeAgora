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
  decision?: SessionReviewDecision;
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
  findings?: SessionTopIssue[];
  markdown?: string;
  evidenceCount?: number;
  discussionsCount?: number;
  degraded?: boolean;
  degradedReasons?: string[];
  costSummary?: SessionCostSummary;
}
