/**
 * Session filtering, sorting, and comparison utilities.
 * Pure functions — no side effects, easy to test.
 */

export interface SessionMetadata {
  sessionId: string;
  date: string;
  timestamp: number;
  diffPath: string;
  status: 'in_progress' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
}

export interface SessionFilters {
  search: string;
  status: 'all' | 'in_progress' | 'completed' | 'failed';
  dateFrom: string;
  dateTo: string;
}

export type SortColumn = 'date' | 'sessionId' | 'status' | 'duration' | 'diffPath';
export type SortDirection = 'asc' | 'desc';

/**
 * Session detail returned by GET /api/sessions/:date/:id.
 */
export interface SessionDetail {
  metadata: SessionMetadata;
  reviews: SessionReview[];
  discussions: Record<string, unknown>[];
  verdict: SessionVerdict | null;
}

export interface SessionReview {
  reviewerId: string;
  model: string;
  group: string;
  rawResponse: string;
  status: string;
  issues?: SessionIssue[];
}

export interface SessionIssue {
  title: string;
  severity: string;
  file?: string;
  line?: number;
}

export interface SessionVerdict {
  decision: string;
  issues?: SessionIssue[];
}

export interface CompareResult {
  newIssues: SessionIssue[];
  resolvedIssues: SessionIssue[];
  unchanged: SessionIssue[];
}

/**
 * Apply text search, status filter, and date range to sessions.
 */
export function filterSessions(
  sessions: readonly SessionMetadata[],
  filters: SessionFilters,
): SessionMetadata[] {
  return sessions.filter((session) => {
    // Text search — matches sessionId, diffPath, or date
    if (filters.search) {
      const query = filters.search.toLowerCase();
      const matchesSearch =
        session.sessionId.toLowerCase().includes(query) ||
        session.diffPath.toLowerCase().includes(query) ||
        session.date.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // Status filter
    if (filters.status !== 'all' && session.status !== filters.status) {
      return false;
    }

    // Date range — from
    if (filters.dateFrom && session.date < filters.dateFrom) {
      return false;
    }

    // Date range — to
    if (filters.dateTo && session.date > filters.dateTo) {
      return false;
    }

    return true;
  });
}

/**
 * Compute session duration in milliseconds. Returns 0 if incomplete.
 */
function getSessionDuration(session: SessionMetadata): number {
  if (session.completedAt && session.startedAt) {
    return session.completedAt - session.startedAt;
  }
  return 0;
}

/**
 * Sort sessions by a given column and direction.
 */
export function sortSessions(
  sessions: readonly SessionMetadata[],
  column: SortColumn,
  direction: SortDirection,
): SessionMetadata[] {
  const sorted = [...sessions];
  const multiplier = direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (column) {
      case 'date':
        return multiplier * a.date.localeCompare(b.date);
      case 'sessionId':
        return multiplier * a.sessionId.localeCompare(b.sessionId);
      case 'status':
        return multiplier * a.status.localeCompare(b.status);
      case 'duration': {
        const durA = getSessionDuration(a);
        const durB = getSessionDuration(b);
        return multiplier * (durA - durB);
      }
      case 'diffPath':
        return multiplier * a.diffPath.localeCompare(b.diffPath);
      default:
        return 0;
    }
  });

  return sorted;
}

/**
 * Extract all issues from a session detail.
 */
function extractIssues(detail: SessionDetail): SessionIssue[] {
  const issues: SessionIssue[] = [];

  // Collect from verdict if available
  if (detail.verdict?.issues) {
    issues.push(...detail.verdict.issues);
  }

  // Collect from reviews
  for (const review of detail.reviews) {
    if (review.issues) {
      issues.push(...review.issues);
    }
  }

  return issues;
}

/**
 * Build a stable key for an issue for comparison purposes.
 */
function issueKey(issue: SessionIssue): string {
  return `${issue.severity}::${issue.file ?? ''}::${issue.line ?? ''}::${issue.title}`;
}

/**
 * Compare two session details, identifying new, resolved, and unchanged issues.
 */
export function compareSessions(
  session1: SessionDetail,
  session2: SessionDetail,
): CompareResult {
  const issues1 = extractIssues(session1);
  const issues2 = extractIssues(session2);

  const keys1 = new Set(issues1.map(issueKey));
  const keys2 = new Set(issues2.map(issueKey));

  const issueMap1 = new Map(issues1.map((i) => [issueKey(i), i]));
  const issueMap2 = new Map(issues2.map((i) => [issueKey(i), i]));

  const newIssues: SessionIssue[] = [];
  const resolvedIssues: SessionIssue[] = [];
  const unchanged: SessionIssue[] = [];

  // Issues in session2 but not session1 = new
  for (const key of keys2) {
    if (!keys1.has(key)) {
      const issue = issueMap2.get(key);
      if (issue) newIssues.push(issue);
    }
  }

  // Issues in session1 but not session2 = resolved
  for (const key of keys1) {
    if (!keys2.has(key)) {
      const issue = issueMap1.get(key);
      if (issue) resolvedIssues.push(issue);
    }
  }

  // Issues in both = unchanged
  for (const key of keys1) {
    if (keys2.has(key)) {
      const issue = issueMap1.get(key);
      if (issue) unchanged.push(issue);
    }
  }

  return { newIssues, resolvedIssues, unchanged };
}

/**
 * Format a duration in milliseconds as a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '--';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Count active filters (non-default values).
 */
export function countActiveFilters(filters: SessionFilters): number {
  let count = 0;
  if (filters.search) count++;
  if (filters.status !== 'all') count++;
  if (filters.dateFrom) count++;
  if (filters.dateTo) count++;
  return count;
}
