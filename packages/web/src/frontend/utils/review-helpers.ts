/**
 * Pure utility functions for the review detail dashboard.
 * Separated from React components so they can be unit-tested in Node environment.
 */

// ============================================================================
// Types
// ============================================================================

type Severity = 'HARSHLY_CRITICAL' | 'CRITICAL' | 'WARNING' | 'SUGGESTION';

interface EvidenceDoc {
  issueTitle: string;
  problem: string;
  evidence: string[];
  severity: Severity;
  suggestion: string;
  filePath: string;
  lineRange: [number, number];
  confidence?: number;
}

interface ReviewEntry {
  reviewerId: string;
  model: string;
  group: string;
  evidenceDocs: EvidenceDoc[];
  status: 'success' | 'forfeit' | 'error';
}

interface AggregatedIssue {
  issueTitle: string;
  problem: string;
  evidence: string[];
  severity: Severity;
  suggestion: string;
  filePath: string;
  lineRange: [number, number];
  confidence?: number;
  reviewers: string[];
}

interface DiffIssueMarker {
  issueTitle: string;
  severity: Severity;
  lineStart: number;
  lineEnd: number;
}

interface ParsedDiffLine {
  type: 'added' | 'removed' | 'context' | 'header';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

// ============================================================================
// Severity maps
// ============================================================================

const severityClassMap: Record<Severity, string> = {
  HARSHLY_CRITICAL: 'severity-badge--harshly-critical',
  CRITICAL: 'severity-badge--critical',
  WARNING: 'severity-badge--warning',
  SUGGESTION: 'severity-badge--suggestion',
};

const severityLabelMap: Record<Severity, string> = {
  HARSHLY_CRITICAL: 'Harshly Critical',
  CRITICAL: 'Critical',
  WARNING: 'Warning',
  SUGGESTION: 'Suggestion',
};

// ============================================================================
// Decision maps
// ============================================================================

type Decision = 'ACCEPT' | 'REJECT' | 'NEEDS_HUMAN';

const decisionClassMap: Record<Decision, string> = {
  ACCEPT: 'verdict-banner--accept',
  REJECT: 'verdict-banner--reject',
  NEEDS_HUMAN: 'verdict-banner--needs-human',
};

const decisionLabelMap: Record<Decision, string> = {
  ACCEPT: 'Accepted',
  REJECT: 'Rejected',
  NEEDS_HUMAN: 'Needs Human Review',
};

// ============================================================================
// Diff parser
// ============================================================================

function parseDiffLines(diffText: string): ParsedDiffLine[] {
  const rawLines = diffText.split('\n');
  const parsed: ParsedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of rawLines) {
    if (raw.startsWith('@@')) {
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      parsed.push({ type: 'header', content: raw, oldLineNumber: null, newLineNumber: null });
    } else if (raw.startsWith('---') || raw.startsWith('+++') || raw.startsWith('diff ') || raw.startsWith('index ')) {
      parsed.push({ type: 'header', content: raw, oldLineNumber: null, newLineNumber: null });
    } else if (raw.startsWith('+')) {
      parsed.push({ type: 'added', content: raw.slice(1), oldLineNumber: null, newLineNumber: newLine });
      newLine++;
    } else if (raw.startsWith('-')) {
      parsed.push({ type: 'removed', content: raw.slice(1), oldLineNumber: oldLine, newLineNumber: null });
      oldLine++;
    } else {
      const content = raw.startsWith(' ') ? raw.slice(1) : raw;
      parsed.push({ type: 'context', content, oldLineNumber: oldLine, newLineNumber: newLine });
      oldLine++;
      newLine++;
    }
  }

  return parsed;
}

// ============================================================================
// Issue aggregation
// ============================================================================

function aggregateIssues(reviews: ReviewEntry[]): AggregatedIssue[] {
  const issueMap = new Map<string, AggregatedIssue>();

  for (const review of reviews) {
    if (review.status !== 'success') continue;
    for (const doc of review.evidenceDocs) {
      const key = `${doc.filePath}:${doc.lineRange[0]}-${doc.lineRange[1]}:${doc.issueTitle}`;
      const existing = issueMap.get(key);
      if (existing) {
        existing.reviewers.push(review.reviewerId);
      } else {
        issueMap.set(key, {
          ...doc,
          reviewers: [review.reviewerId],
        });
      }
    }
  }

  return Array.from(issueMap.values());
}

function computeSeverityCounts(issues: AggregatedIssue[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    HARSHLY_CRITICAL: 0,
    CRITICAL: 0,
    WARNING: 0,
    SUGGESTION: 0,
  };
  for (const issue of issues) {
    counts[issue.severity]++;
  }
  return counts;
}

function issuesToMarkers(issues: AggregatedIssue[]): DiffIssueMarker[] {
  return issues.map((issue) => ({
    issueTitle: issue.issueTitle,
    severity: issue.severity,
    lineStart: issue.lineRange[0],
    lineEnd: issue.lineRange[1],
  }));
}

// ============================================================================
// Formatting
// ============================================================================

function formatDuration(startMs: number, endMs?: number): string {
  const end = endMs ?? Date.now();
  const seconds = Math.round((end - startMs) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

// ============================================================================
// Exports
// ============================================================================

export {
  parseDiffLines,
  aggregateIssues,
  computeSeverityCounts,
  issuesToMarkers,
  formatDuration,
  formatDate,
  severityClassMap,
  severityLabelMap,
  decisionClassMap,
  decisionLabelMap,
};

export type {
  Severity,
  Decision,
  EvidenceDoc,
  ReviewEntry,
  AggregatedIssue,
  DiffIssueMarker,
  ParsedDiffLine,
};
