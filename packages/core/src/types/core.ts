/**
 * V3 Core Type Definitions
 * Based on 3-layer architecture: L1 Reviewers → L2 Moderator+Supporters → L3 Head
 */

import { z } from 'zod';

// ============================================================================
// Result Type (functional error handling)
// ============================================================================

export type Result<T, E = string> =
  | { success: true; data: T }
  | { success: false; error: E };

export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

export function err<E = string>(error: E): Result<never, E> {
  return { success: false, error };
}

// ============================================================================
// Severity System (V3)
// ============================================================================

export const SeveritySchema = z.enum([
  'HARSHLY_CRITICAL',
  'CRITICAL',
  'WARNING',
  'SUGGESTION',
]);
export type Severity = z.infer<typeof SeveritySchema>;

export const SEVERITY_ORDER = ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION'] as const;

// ============================================================================
// Evidence Document (L1 Reviewer Output)
// ============================================================================

export const EvidenceDocumentSchema = z.object({
  issueTitle: z.string(),
  problem: z.string(),
  evidence: z.array(z.string()),
  severity: SeveritySchema,
  suggestion: z.string(),
  filePath: z.string(),
  lineRange: z.tuple([z.number(), z.number()]),
  source: z.enum(['llm', 'rule']).optional(),
  confidence: z.number().min(0).max(100).optional(),
});
export type EvidenceDocument = z.infer<typeof EvidenceDocumentSchema>;

// ============================================================================
// Review Output (L1)
// ============================================================================

export interface ReviewOutput {
  reviewerId: string;
  model: string;
  group: string; // Which file group this review covers
  evidenceDocs: EvidenceDocument[];
  rawResponse: string;
  status: 'success' | 'forfeit' | 'error';
  error?: string;
  chunkIndex?: number; // Set when diff is split into multiple chunks
}

// ============================================================================
// Discussion (L2)
// ============================================================================

export interface Discussion {
  id: string; // d001, d002, etc.
  severity: Severity;
  issueTitle: string;
  filePath: string;
  lineRange: [number, number];
  codeSnippet: string; // ±10 lines
  evidenceDocs: string[]; // Paths to reviewer evidence .md files
  status: 'pending' | 'in_progress' | 'resolved' | 'escalated';
}

export interface DiscussionRound {
  round: number;
  moderatorPrompt: string;
  supporterResponses: Array<{
    supporterId: string;
    response: string;
    stance: 'agree' | 'disagree' | 'neutral';
  }>;
}

export interface DiscussionVerdict {
  discussionId: string;
  filePath: string;
  lineRange: [number, number];
  finalSeverity: Severity | 'DISMISSED';
  reasoning: string;
  consensusReached: boolean;
  rounds: number;
}

// ============================================================================
// Moderator Report (L2 → L3)
// ============================================================================

export interface ModeratorReport {
  discussions: DiscussionVerdict[];
  /** Per-discussion round data (supporter stances, responses, moderator prompts) */
  roundsPerDiscussion: Record<string, DiscussionRound[]>;
  unconfirmedIssues: EvidenceDocument[]; // 1 reviewer only
  suggestions: EvidenceDocument[]; // SUGGESTION severity
  summary: {
    totalDiscussions: number;
    resolved: number;
    escalated: number;
  };
}

// ============================================================================
// Head Verdict (L3 Final)
// ============================================================================

export interface HeadVerdict {
  decision: 'ACCEPT' | 'REJECT' | 'NEEDS_HUMAN';
  reasoning: string;
  codeChanges?: Array<{
    filePath: string;
    changes: string;
  }>;
  questionsForHuman?: string[];
}

// ============================================================================
// Session Metadata
// ============================================================================

export interface SessionMetadata {
  sessionId: string; // 001, 002, etc.
  date: string; // YYYY-MM-DD
  timestamp: number;
  diffPath: string;
  status: 'in_progress' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
}
