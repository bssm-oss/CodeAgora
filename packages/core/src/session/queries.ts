/**
 * Session query functions — pure data access, no CLI formatting.
 * Extracted from @codeagora/cli so that core consumers like MCP can import
 * without depending on the presentation layer.
 */

import fs from 'fs/promises';
import path from 'path';
import { validateDiffPath } from '@codeagora/shared/utils/path-validation.js';

// ============================================================================
// Types
// ============================================================================

export interface SessionEntry {
  id: string;        // "2026-03-13/001"
  date: string;
  sessionId: string;
  status: string;    // from metadata
  dirPath: string;
}

export interface SessionDetail {
  entry: SessionEntry;
  metadata?: Record<string, unknown>;
  verdict?: Record<string, unknown>;
}

export interface SessionDiff {
  session1: string;
  session2: string;
  added: string[];    // issues only in session2
  removed: string[];  // issues only in session1
  unchanged: number;
}

export interface ListOptions {
  limit?: number;
  status?: string;   // 'completed' | 'failed' | 'in_progress' | 'interrupted'
  after?: string;    // 'YYYY-MM-DD'
  before?: string;   // 'YYYY-MM-DD'
  sort?: string;     // 'date' (default) | 'status' | 'issues'
  keyword?: string;  // case-insensitive substring search across metadata + verdict
}

export interface SessionStats {
  totalSessions: number;
  completed: number;
  failed: number;
  inProgress: number;
  interrupted: number;
  /** Percentage 0-100, one decimal precision */
  successRate: number;
  severityDistribution: Record<string, number>;
}

// ============================================================================
// Helpers
// ============================================================================

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractIssueObjects(verdict: Record<string, unknown>): Array<{ title: string; severity?: string }> {
  // Try common verdict shapes: issues[], findings[], items[]
  for (const key of ['issues', 'findings', 'items']) {
    const val = verdict[key];
    if (Array.isArray(val)) {
      return val.map((item: unknown) => {
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          return {
            title: String(obj['title'] ?? obj['description'] ?? obj['message'] ?? JSON.stringify(item)),
            severity: typeof obj['severity'] === 'string' ? obj['severity'] : undefined,
          };
        }
        return { title: String(item) };
      });
    }
  }
  return [];
}

function extractIssues(verdict: Record<string, unknown>): string[] {
  return extractIssueObjects(verdict).map((o) => o.title);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * List sessions under baseDir/.ca/sessions/, newest first, up to limit (default 10).
 * Supports filtering by status, date range, and sorting.
 */
export async function listSessions(
  baseDir: string,
  options?: ListOptions
): Promise<SessionEntry[]> {
  const limit = options?.limit ?? 10;
  const sessionsDir = path.join(baseDir, '.ca', 'sessions');

  let dateDirs: string[];
  try {
    const entries = await fs.readdir(sessionsDir);
    dateDirs = entries.filter(d => !d.includes('..')).sort().reverse(); // newest date first
  } catch {
    return [];
  }

  const results: SessionEntry[] = [];

  for (const dateDir of dateDirs) {
    const datePath = path.join(sessionsDir, dateDir);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(datePath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    let sessionIds: string[];
    try {
      const entries = await fs.readdir(datePath);
      sessionIds = entries.sort().reverse(); // newest session first within date
    } catch {
      continue;
    }

    for (const sessionId of sessionIds) {
      const sessionPath = path.join(datePath, sessionId);
      let sStat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        sStat = await fs.stat(sessionPath);
      } catch {
        continue;
      }
      if (!sStat.isDirectory()) continue;

      const metadataPath = path.join(sessionPath, 'metadata.json');
      const metadata = await readJsonFile(metadataPath);
      const status = metadata && typeof metadata['status'] === 'string'
        ? metadata['status']
        : 'unknown';

      results.push({
        id: `${dateDir}/${sessionId}`,
        date: dateDir,
        sessionId,
        status,
        dirPath: sessionPath,
      });
    }
  }

  // Apply filters
  let filtered = results;
  if (options?.status) {
    filtered = filtered.filter((e) => e.status === options.status);
  }
  if (options?.after) {
    filtered = filtered.filter((e) => e.date >= options.after!);
  }
  if (options?.before) {
    filtered = filtered.filter((e) => e.date <= options.before!);
  }

  // Apply keyword search (case-insensitive substring match across metadata + verdict)
  if (options?.keyword) {
    const kw = options.keyword.toLowerCase();
    const matched: SessionEntry[] = [];
    for (const entry of filtered) {
      const metadata = await readJsonFile(path.join(entry.dirPath, 'metadata.json'));
      const verdict = await readJsonFile(path.join(entry.dirPath, 'head-verdict.json'));
      const haystack = (
        (metadata ? JSON.stringify(metadata) : '') +
        (verdict ? JSON.stringify(verdict) : '')
      ).toLowerCase();
      if (haystack.includes(kw)) {
        matched.push(entry);
      }
    }
    filtered = matched;
  }

  // Apply sort
  const sort = options?.sort ?? 'date';
  if (sort === 'status') {
    filtered = filtered.slice().sort((a, b) => a.status.localeCompare(b.status));
  } else if (sort === 'issues') {
    // Read verdict files to count issues, then sort descending
    const withCounts = await Promise.all(
      filtered.map(async (entry) => {
        const verdict = await readJsonFile(path.join(entry.dirPath, 'head-verdict.json'));
        const count = verdict ? extractIssueObjects(verdict).length : 0;
        return { entry, count };
      })
    );
    withCounts.sort((a, b) => b.count - a.count);
    filtered = withCounts.map((x) => x.entry);
  }
  // 'date' is already sorted newest first from collection order

  return filtered.slice(0, limit);
}

/**
 * Return aggregate statistics across all sessions under baseDir/.ca/sessions/.
 */
export async function getSessionStats(baseDir: string): Promise<SessionStats> {
  const sessionsDir = path.join(baseDir, '.ca', 'sessions');

  let dateDirs: string[];
  try {
    const entries = await fs.readdir(sessionsDir);
    dateDirs = entries.filter(d => !d.includes('..')).sort();
  } catch {
    return {
      totalSessions: 0,
      completed: 0,
      failed: 0,
      inProgress: 0,
      interrupted: 0,
      successRate: 0,
      severityDistribution: {},
    };
  }

  let totalSessions = 0;
  let completed = 0;
  let failed = 0;
  let inProgress = 0;
  let interrupted = 0;
  const severityDistribution: Record<string, number> = {};

  for (const dateDir of dateDirs) {
    const datePath = path.join(sessionsDir, dateDir);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(datePath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    let sessionIds: string[];
    try {
      sessionIds = await fs.readdir(datePath);
    } catch {
      continue;
    }

    for (const sessionId of sessionIds) {
      const sessionPath = path.join(datePath, sessionId);
      let sStat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        sStat = await fs.stat(sessionPath);
      } catch {
        continue;
      }
      if (!sStat.isDirectory()) continue;

      totalSessions++;

      const metadata = await readJsonFile(path.join(sessionPath, 'metadata.json'));
      const status = metadata && typeof metadata['status'] === 'string'
        ? metadata['status']
        : 'unknown';

      if (status === 'completed') completed++;
      else if (status === 'failed') failed++;
      else if (status === 'in_progress') inProgress++;
      else if (status === 'interrupted') interrupted++;

      const verdict = await readJsonFile(path.join(sessionPath, 'head-verdict.json'));
      if (verdict) {
        for (const issue of extractIssueObjects(verdict)) {
          const severity = issue.severity ?? 'unknown';
          severityDistribution[severity] = (severityDistribution[severity] ?? 0) + 1;
        }
      }
    }
  }

  const successRate = totalSessions > 0
    ? Math.round((completed / totalSessions) * 1000) / 10
    : 0;

  return { totalSessions, completed, failed, inProgress, interrupted, successRate, severityDistribution };
}

/**
 * Show details for a session identified by "YYYY-MM-DD/NNN".
 * Throws if the session directory does not exist.
 */
export async function showSession(
  baseDir: string,
  sessionPath: string
): Promise<SessionDetail> {
  const parts = sessionPath.split('/');
  if (parts.length !== 2) {
    throw new Error(`Invalid session path format: "${sessionPath}". Expected "YYYY-MM-DD/NNN".`);
  }
  const date = parts[0];
  const sessionId = parts[1];

  const allowedRoot = path.join(baseDir, '.ca', 'sessions');
  const dirPath = path.join(allowedRoot, date, sessionId);
  const validation = validateDiffPath(dirPath, { allowedRoots: [allowedRoot] });
  if (!validation.success) {
    throw new Error(`Invalid session path: "${sessionPath}".`);
  }

  try {
    await fs.access(dirPath);
  } catch {
    throw new Error(`Session not found: ${sessionPath}`);
  }

  const metadata = await readJsonFile(path.join(dirPath, 'metadata.json')) ?? undefined;
  const verdict = await readJsonFile(path.join(dirPath, 'head-verdict.json')) ?? undefined;

  const status = metadata && typeof metadata['status'] === 'string'
    ? metadata['status']
    : 'unknown';

  const entry: SessionEntry = {
    id: sessionPath,
    date,
    sessionId,
    status,
    dirPath,
  };

  return { entry, metadata, verdict };
}

/**
 * Format session statistics as plain-text output (no ANSI color codes).
 */
export function formatSessionStats(stats: SessionStats): string {
  const lines: string[] = [];
  const divider1 = '\u2500'.repeat(17);
  const divider2 = '\u2500'.repeat(21);

  lines.push('Review Statistics');
  lines.push(divider1);

  const pct = (n: number) =>
    stats.totalSessions > 0
      ? ` (${((n / stats.totalSessions) * 100).toFixed(1)}%)`
      : '';

  lines.push(`Total sessions:  ${stats.totalSessions}`);
  lines.push(`Completed:       ${stats.completed} (${stats.successRate.toFixed(1)}%)`);
  lines.push(`Failed:          ${stats.failed}${pct(stats.failed)}`);
  lines.push(`Interrupted:     ${stats.interrupted}${pct(stats.interrupted)}`);
  lines.push(`In Progress:     ${stats.inProgress}${pct(stats.inProgress)}`);

  lines.push('');
  lines.push('Severity Distribution');
  lines.push(divider2);

  const severityKeys = Object.keys(stats.severityDistribution);
  if (severityKeys.length === 0) {
    lines.push('No issues recorded.');
  } else {
    for (const sev of severityKeys) {
      const count = stats.severityDistribution[sev];
      lines.push(`${sev}:`.padEnd(20) + `  ${count}`);
    }
  }

  return lines.join('\n');
}

/**
 * Diff two sessions, comparing their verdict issue titles.
 */
export async function diffSessions(
  baseDir: string,
  session1: string,
  session2: string
): Promise<SessionDiff> {
  const [detail1, detail2] = await Promise.all([
    showSession(baseDir, session1),
    showSession(baseDir, session2),
  ]);

  const issues1 = detail1.verdict ? extractIssues(detail1.verdict) : [];
  const issues2 = detail2.verdict ? extractIssues(detail2.verdict) : [];

  const set1 = new Set(issues1);
  const set2 = new Set(issues2);

  const removed = issues1.filter((t) => !set2.has(t));
  const added = issues2.filter((t) => !set1.has(t));
  const unchanged = issues1.filter((t) => set2.has(t)).length;

  return { session1, session2, added, removed, unchanged };
}
