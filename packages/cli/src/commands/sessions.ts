/**
 * Sessions Command
 * List, show, and diff past review sessions.
 */

import { statusColor, severityColor } from '../utils/colors.js';
import pc from 'picocolors';

// Data access and types live in core; re-export for backward compatibility
export type {
  SessionEntry,
  SessionDetail,
  SessionDiff,
  ListOptions,
  SessionStats,
} from '@codeagora/core/session/queries.js';
export {
  listSessions,
  getSessionStats,
  showSession,
  diffSessions,
} from '@codeagora/core/session/queries.js';

// Re-import types for use in formatters
import type {
  SessionEntry,
  SessionDetail,
  SessionDiff,
  SessionStats,
} from '@codeagora/core/session/queries.js';
import { AGENT_CONTRACT_VERSION } from '../utils/agent-contract.js';

import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// CLI-only types
// ============================================================================

export interface PruneResult {
  deleted: number;
  errors: number;
}

// ============================================================================
// Helpers (formatter-internal)
// ============================================================================

function colorStatus(status: string): string {
  if (status === 'completed') return statusColor.pass(status);
  if (status === 'failed') return statusColor.fail(status);
  if (status === 'in_progress') return statusColor.warn(status);
  return status;
}

function extractIssueObjects(verdict: Record<string, unknown>): Array<{ title: string; severity?: string }> {
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

// ============================================================================
// Prune (CLI-only, not needed by MCP)
// ============================================================================

/**
 * Delete sessions older than maxAgeDays from baseDir/.ca/sessions/.
 * Returns counts of deleted and errored sessions.
 */
export async function pruneSessions(
  baseDir: string,
  maxAgeDays: number = 30
): Promise<PruneResult> {
  const sessionsDir = path.join(baseDir, '.ca', 'sessions');
  const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10); // 'YYYY-MM-DD'

  let deleted = 0;
  let errors = 0;

  let dateDirs: string[];
  try {
    const entries = await fs.readdir(sessionsDir);
    dateDirs = entries.filter(d => !d.includes('..'));
  } catch {
    return { deleted, errors };
  }

  for (const dateDir of dateDirs) {
    // Only prune date directories older than the cutoff
    if (dateDir >= cutoffDate) continue;

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
      try {
        await fs.rm(sessionPath, { recursive: true, force: true });
        deleted++;
      } catch {
        errors++;
      }
    }

    // Remove empty date directory
    try {
      const remaining = await fs.readdir(datePath);
      if (remaining.length === 0) {
        await fs.rmdir(datePath);
      }
    } catch {
      // Non-fatal
    }
  }

  return { deleted, errors };
}

// ============================================================================
// Formatters
// ============================================================================

export function formatSessionList(sessions: SessionEntry[]): string {
  if (sessions.length === 0) {
    return 'No sessions found.';
  }

  const COL_SESSION = 28;
  const COL_DATE = 14;

  const header =
    'Session'.padEnd(COL_SESSION) +
    'Date'.padEnd(COL_DATE) +
    'Status';
  const divider = '\u2500'.repeat(COL_SESSION + COL_DATE + 12);

  const rows = sessions.map((s) => {
    return s.id.padEnd(COL_SESSION) + s.date.padEnd(COL_DATE) + colorStatus(s.status);
  });

  return [header, divider, ...rows].join('\n');
}

export function formatSessionListJson(sessions: SessionEntry[]): string {
  return JSON.stringify({ schemaVersion: AGENT_CONTRACT_VERSION, sessions }, null, 2);
}

export function formatSessionDetail(detail: SessionDetail): string {
  const lines: string[] = [];
  lines.push(`Session: ${detail.entry.id}`);
  lines.push(`Status:  ${colorStatus(detail.entry.status)}`);
  lines.push(`Date:    ${detail.entry.date}`);

  if (detail.metadata) {
    const m = detail.metadata;
    if (typeof m['diffPath'] === 'string') {
      lines.push(`Diff:    ${m['diffPath']}`);
    }
    if (typeof m['timestamp'] === 'number') {
      lines.push(`Started: ${new Date(m['timestamp']).toISOString()}`);
    }
    if (typeof m['completedAt'] === 'number') {
      lines.push(`Completed: ${new Date(m['completedAt']).toISOString()}`);
    }
  }

  if (detail.verdict) {
    const unified = extractIssueObjects(detail.verdict);
    lines.push(`Issues:  ${unified.length}`);
    if (unified.length > 0) {
      for (const { title, severity } of unified.slice(0, 5)) {
        const coloredSeverity = severity
          ? (severity in severityColor
              ? severityColor[severity as keyof typeof severityColor](severity)
              : severity) + ' '
          : '';
        lines.push(`  - ${coloredSeverity}${title}`);
      }
      if (unified.length > 5) {
        lines.push(`  ... and ${unified.length - 5} more`);
      }
    }
  }

  return lines.join('\n');
}

export function formatSessionDetailJson(detail: SessionDetail): string {
  return JSON.stringify({ schemaVersion: AGENT_CONTRACT_VERSION, ...detail }, null, 2);
}

export function formatSessionDiff(diff: SessionDiff): string {
  const lines: string[] = [];
  lines.push(`Comparing ${diff.session1} vs ${diff.session2}`);
  lines.push(`New: ${diff.added.length}, Resolved: ${diff.removed.length}, Unchanged: ${diff.unchanged}`);

  if (diff.added.length > 0) {
    lines.push('');
    lines.push('New issues:');
    for (const issue of diff.added) {
      lines.push(`  + ${issue}`);
    }
  }

  if (diff.removed.length > 0) {
    lines.push('');
    lines.push('Resolved issues:');
    for (const issue of diff.removed) {
      lines.push(`  - ${issue}`);
    }
  }

  return lines.join('\n');
}

export function formatSessionStats(stats: SessionStats): string {
  const lines: string[] = [];
  const divider1 = '\u2500'.repeat(17);
  const divider2 = '\u2500'.repeat(21);

  lines.push(pc.bold('Review Statistics'));
  lines.push(divider1);

  const pct = (n: number) =>
    stats.totalSessions > 0
      ? ` (${((n / stats.totalSessions) * 100).toFixed(1)}%)`
      : '';

  lines.push(`Total sessions:  ${stats.totalSessions}`);
  lines.push(`Completed:       ${statusColor.pass(String(stats.completed))} (${stats.successRate.toFixed(1)}%)`);
  lines.push(`Failed:          ${statusColor.fail(String(stats.failed))}${pct(stats.failed)}`);
  lines.push(`In Progress:     ${statusColor.warn(String(stats.inProgress))}${pct(stats.inProgress)}`);

  lines.push('');
  lines.push(pc.bold('Severity Distribution'));
  lines.push(divider2);

  const severityKeys = Object.keys(stats.severityDistribution);
  if (severityKeys.length === 0) {
    lines.push('No issues recorded.');
  } else {
    for (const sev of severityKeys) {
      const count = stats.severityDistribution[sev];
      const label = sev in severityColor
        ? severityColor[sev as keyof typeof severityColor](sev)
        : sev;
      lines.push(`${label}:`.padEnd(20) + `  ${count}`);
    }
  }

  return lines.join('\n');
}
