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
import { showSession } from '@codeagora/core/session/queries.js';
import { AGENT_CONTRACT_VERSION } from '../utils/agent-contract.js';

import fs from 'fs/promises';
import path from 'path';
import type { EvidenceDocument, Severity } from '@codeagora/core/types/core.js';
import { REVIEW_SEVERITIES } from '@codeagora/shared/contracts/stable.js';
import { buildSarifReport, serializeSarif } from '@codeagora/github/sarif.js';

// ============================================================================
// CLI-only types
// ============================================================================

export interface PruneResult {
  deleted: number;
  errors: number;
}

export interface SessionExportResult {
  format: 'markdown' | 'json' | 'sarif';
  fileName: string;
  content: string;
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

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}

function issueObjectFromUnknown(item: unknown): { title: string; severity?: string } {
  const obj = recordFromUnknown(item);
  if (!obj) return { title: String(item) };
  return {
    title: String(obj['title'] ?? obj['issueTitle'] ?? obj['description'] ?? obj['message'] ?? JSON.stringify(item)),
    severity: typeof obj['severity'] === 'string' ? obj['severity'] : undefined,
  };
}

function extractIssueObjects(verdict: Record<string, unknown>): Array<{ title: string; severity?: string }> {
  const evidenceDocs = verdict['evidenceDocs'];
  if (Array.isArray(evidenceDocs) && evidenceDocs.length > 0) {
    return evidenceDocs.map(issueObjectFromUnknown);
  }

  for (const key of ['issues', 'findings', 'items']) {
    const val = verdict[key];
    if (Array.isArray(val) && val.length > 0) {
      return val.map(issueObjectFromUnknown);
    }
  }

  const summary = recordFromUnknown(verdict['summary']);
  const topIssues = summary?.['topIssues'];
  if (Array.isArray(topIssues) && topIssues.length > 0) {
    return topIssues.map(issueObjectFromUnknown);
  }

  return [];
}

function sessionDirFor(baseDir: string, sessionPath: string): { date: string; sessionId: string; dirPath: string } {
  const parts = sessionPath.split('/');
  if (parts.length !== 2) {
    throw new Error(`Invalid session path format: "${sessionPath}". Expected "YYYY-MM-DD/NNN".`);
  }
  const [date, sessionId] = parts;
  return {
    date,
    sessionId,
    dirPath: path.join(baseDir, '.ca', 'sessions', date, sessionId),
  };
}

async function readOptionalText(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return undefined;
  }
}

async function readOptionalJson(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function readSessionVerdict(dirPath: string): Promise<Record<string, unknown> | undefined> {
  const result = await readOptionalJson(path.join(dirPath, 'result.json'));
  const headVerdict = await readOptionalJson(path.join(dirPath, 'head-verdict.json'));
  if (result && (result['status'] !== 'error' || !headVerdict)) return result;
  return headVerdict ?? result;
}

function normalizedSeverity(value: unknown): Severity {
  return typeof value === 'string' && (REVIEW_SEVERITIES as readonly string[]).includes(value)
    ? value as Severity
    : 'SUGGESTION';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function lineRangeFrom(value: Record<string, unknown>): [number, number] {
  if (Array.isArray(value['lineRange'])) {
    const start = Number(value['lineRange'][0] ?? 1);
    const end = Number(value['lineRange'][1] ?? value['lineRange'][0] ?? 1);
    return [Math.max(1, start || 1), Math.max(1, end || start || 1)];
  }
  const line = Number(value['line'] ?? value['lineNumber'] ?? 1);
  return [Math.max(1, line || 1), Math.max(1, line || 1)];
}

function evidenceDocumentFromUnknown(item: unknown): EvidenceDocument {
  const record = recordFromUnknown(item) ?? { title: String(item) };
  const title = String(record['title'] ?? record['issueTitle'] ?? record['description'] ?? record['message'] ?? 'CodeAgora finding');
  const confidence = typeof record['confidence'] === 'number'
    ? Math.max(0, Math.min(100, record['confidence']))
    : undefined;
  const source = record['source'] === 'llm' || record['source'] === 'rule' ? record['source'] : undefined;
  const suggestionVerified = record['suggestionVerified'] === 'passed'
    || record['suggestionVerified'] === 'failed'
    || record['suggestionVerified'] === 'skipped'
    ? record['suggestionVerified']
    : undefined;
  const confidenceTrace = recordFromUnknown(record['confidenceTrace']) as EvidenceDocument['confidenceTrace'];
  return {
    issueTitle: title,
    problem: String(record['problem'] ?? record['description'] ?? record['message'] ?? title),
    evidence: stringArray(record['evidence']),
    severity: normalizedSeverity(record['severity']),
    suggestion: String(record['suggestion'] ?? record['fix'] ?? record['recommendation'] ?? ''),
    filePath: String(record['filePath'] ?? record['file'] ?? record['path'] ?? 'unknown'),
    lineRange: lineRangeFrom(record),
    ...(typeof record['reviewerId'] === 'string' ? { reviewerId: record['reviewerId'] } : {}),
    ...(source ? { source } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(confidenceTrace ? { confidenceTrace } : {}),
    ...(suggestionVerified ? { suggestionVerified } : {}),
  };
}

function evidenceDocumentsFromVerdict(verdict: Record<string, unknown> | undefined): EvidenceDocument[] {
  if (!verdict) return [];
  const evidenceDocs = verdict['evidenceDocs'];
  if (Array.isArray(evidenceDocs) && evidenceDocs.length > 0) {
    return evidenceDocs.map(evidenceDocumentFromUnknown);
  }

  for (const key of ['issues', 'findings', 'items']) {
    const value = verdict[key];
    if (!Array.isArray(value) || value.length === 0) continue;
    return value.map(evidenceDocumentFromUnknown);
  }

  const summary = recordFromUnknown(verdict['summary']);
  const topIssues = summary?.['topIssues'];
  if (Array.isArray(topIssues) && topIssues.length > 0) {
    return topIssues.map(evidenceDocumentFromUnknown);
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
    if (typeof m['artifactContract'] === 'string') {
      lines.push(`Artifact Contract: ${m['artifactContract']}`);
    }
    if (typeof m['diffPath'] === 'string') {
      lines.push(`Diff:    ${m['diffPath']}`);
    }
    if (Array.isArray(m['includedFiles'])) {
      const includedFiles = m['includedFiles'] as string[];
      lines.push(`Included Files: ${includedFiles.length}`);
      for (const file of includedFiles.slice(0, 6)) {
        lines.push(`  + ${file}`);
      }
      if (includedFiles.length > 6) {
        lines.push(`  ... and ${includedFiles.length - 6} more`);
      }
    }
    if (Array.isArray(m['excludedFiles'])) {
      const excludedFiles = m['excludedFiles'] as string[];
      lines.push(`Excluded Files: ${excludedFiles.length}`);
      for (const file of excludedFiles.slice(0, 6)) {
        lines.push(`  - ${file}`);
      }
      if (excludedFiles.length > 6) {
        lines.push(`  ... and ${excludedFiles.length - 6} more`);
      }
    }
    if (typeof m['diffChunking'] === 'object' && m['diffChunking'] !== null) {
      const diffChunking = m['diffChunking'] as Record<string, string[]>;
      const builtin = diffChunking['excludedByBuiltinPatterns']?.length ?? 0;
      const reviewIgnore = diffChunking['excludedByReviewIgnorePatterns']?.length ?? 0;
      const contextIgnore = diffChunking['excludedByContextIgnorePatterns']?.length ?? 0;
      lines.push(`Diff Filtering:`);
      lines.push(`  Built-in artifacts: ${builtin}`);
      lines.push(`  .reviewignore: ${reviewIgnore}`);
      lines.push(`  reviewContext.ignorePatterns: ${contextIgnore}`);
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

export async function exportSession(
  baseDir: string,
  sessionPath: string,
  format: string,
): Promise<SessionExportResult> {
  const normalized = format.trim().toLowerCase();
  const detail = await showSession(baseDir, sessionPath);
  const { date, sessionId, dirPath } = sessionDirFor(baseDir, sessionPath);
  const fileBase = `codeagora-session-${sessionPath.replace('/', '-')}`;

  if (normalized === 'markdown' || normalized === 'md') {
    const content = await readOptionalText(path.join(dirPath, 'report.md'))
      ?? await readOptionalText(path.join(dirPath, 'result.md'))
      ?? await readOptionalText(path.join(dirPath, 'suggestions.md'))
      ?? formatSessionDetail(detail);
    return { format: 'markdown', fileName: `${fileBase}.md`, content };
  }

  if (normalized === 'json') {
    return { format: 'json', fileName: `${fileBase}.json`, content: formatSessionDetailJson(detail) };
  }

  if (normalized === 'sarif') {
    const verdict = await readSessionVerdict(dirPath) ?? detail.verdict;
    const report = buildSarifReport(evidenceDocumentsFromVerdict(verdict), sessionId, date);
    return { format: 'sarif', fileName: `${fileBase}.sarif`, content: serializeSarif(report) };
  }

  throw new Error(`Unsupported export format: ${format}`);
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
