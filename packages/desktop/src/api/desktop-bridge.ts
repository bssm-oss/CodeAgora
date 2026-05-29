import { invoke } from '@tauri-apps/api/core';
import type {
  SessionSummary,
  SessionDetail,
  SessionExport,
  RunReviewResult,
  ReviewRunSnapshot,
  DesktopConfig,
  ConfigValidation,
  ProviderStatus,
  McpStatus,
  GitHubActionStatus,
  EvidenceStatus,
  AnalyticsStatus,
  RepoInfo,
  DesktopCommandContract,
  NotificationPreferences,
  SeverityCounts,
  TopIssue,
  SessionCostSummary,
} from './desktop-bridge.types.js';
export type * from './desktop-bridge.types.js';
import {
  fallbackSessions,
  fallbackSessionDetail,
  fallbackSessionExport,
  fallbackReviewRun,
  fallbackConfig,
  fallbackConfigValidation,
  fallbackProviderStatus,
  fallbackMcpStatus,
  fallbackGitHubActionStatus,
  fallbackEvidenceStatus,
  fallbackAnalyticsStatus,
  fallbackRepoInfo,
  fallbackCommandContract,
} from './desktop-fallbacks.js';

// ── tauriCall wrapper ────────────────────────────────────────────

/** Whether the app is running inside a Tauri shell. */
export const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Call a Tauri IPC command, returning `null` if not in a Tauri context.
 * When in Tauri, real errors propagate to the caller so the UI can
 * surface failures instead of silently falling through to mock data.
 */
async function tauriCall<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!IS_TAURI) return null;
  return invoke<T>(cmd, args);
}

// ── JSON normalisation helpers ───────────────────────────────────

type JsonObject = Record<string, unknown>;

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : undefined;
}

type CliSessionList = { sessions?: CliSessionEntry[] };
type CliSessionEntry = Record<string, unknown>;
type CliSessionDetail = Record<string, unknown>;

function extractIssues(verdict?: JsonObject): JsonObject[] {
  if (!verdict) return [];
  for (const key of ['issues', 'findings', 'items']) {
    const value = verdict[key];
    if (Array.isArray(value)) return value.filter((item): item is JsonObject => typeof item === 'object' && item !== null);
  }
  return [];
}

function severityCountsFromValue(value: unknown, verdict?: JsonObject): SeverityCounts {
  const raw = asObject(value);
  if (!raw) return severityCountsFromVerdict(verdict);
  const counts: SeverityCounts = {};
  for (const key of ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION'] as const) {
    const count = raw[key];
    if (typeof count === 'number') counts[key] = count;
  }
  return counts;
}

function severityCountsFromVerdict(verdict?: JsonObject): SeverityCounts {
  const counts: SeverityCounts = {};
  for (const issue of extractIssues(verdict)) {
    const severity = asString(issue.severity, 'SUGGESTION') as keyof SeverityCounts;
    counts[severity] = (counts[severity] ?? 0) + 1;
  }
  return counts;
}

function normalizeIssue(issue: JsonObject): TopIssue {
  return {
    severity: asString(issue['severity'], 'SUGGESTION'),
    filePath: asString(issue['filePath'] ?? issue['file'] ?? issue['path'], 'unknown'),
    lineRange: Array.isArray(issue['lineRange'])
      ? [Number(issue['lineRange'][0] ?? 0), Number(issue['lineRange'][1] ?? issue['lineRange'][0] ?? 0)]
      : [Number(issue['line'] ?? issue['lineNumber'] ?? 0), Number(issue['line'] ?? issue['lineNumber'] ?? 0)],
    title: asString(issue['title'] ?? issue['description'] ?? issue['message'], JSON.stringify(issue)),
    confidence: asNumber(issue['confidence']),
  };
}

function normalizeTopIssues(value: unknown, verdict?: JsonObject): TopIssue[] {
  const issues = Array.isArray(value)
    ? value.filter((item): item is JsonObject => typeof item === 'object' && item !== null)
    : extractIssues(verdict).slice(0, 5);
  return issues.map(normalizeIssue);
}

function normalizeEntry(entry: CliSessionEntry): SessionSummary {
  const date = asString(entry.date);
  const sessionId = asString(entry.sessionId);
  const id = asString(entry.id, date && sessionId ? `${date}/${sessionId}` : 'unknown');
  const verdict = asObject(entry['verdict']);
  const decision = asString(entry.decision ?? verdict?.['decision'] ?? verdict?.['verdict']) as SessionSummary['decision'] | '';
  return {
    id,
    date,
    sessionId,
    status: asString(entry.status, 'unknown') as SessionSummary['status'],
    dirPath: asString(entry.dirPath) || undefined,
    decision: decision || undefined,
    reasoning: asString(entry.reasoning ?? verdict?.['reasoning'] ?? verdict?.['summary']) || undefined,
    severityCounts: severityCountsFromValue(entry.severityCounts, verdict),
    topIssues: normalizeTopIssues(entry.topIssues, verdict),
    updatedAt: asString(entry.updatedAt) || undefined,
  };
}

function timestampFromMetadata(metadata?: JsonObject): string | undefined {
  const raw = metadata?.['completedAt'] ?? metadata?.['startedAt'] ?? metadata?.['timestamp'];
  if (typeof raw === 'number') return new Date(raw).toISOString();
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return new Date(Number(raw)).toISOString();
  return typeof raw === 'string' ? raw : undefined;
}

function normalizeDetail(detail: CliSessionDetail): SessionDetail {
  const entry = normalizeEntry(asObject(detail['entry']) ?? {});
  const verdict = asObject(detail['verdict']);
  const metadata = asObject(detail['metadata']);
  const issues = extractIssues(verdict);
  const decision = asString(entry.decision ?? verdict?.['decision'] ?? verdict?.['verdict']) as SessionDetail['decision'] | '';
  const reasoning = asString(entry.reasoning ?? verdict?.['reasoning'] ?? verdict?.['summary']);
  return {
    ...entry,
    decision: decision || undefined,
    reasoning,
    severityCounts: entry.severityCounts ?? severityCountsFromVerdict(verdict),
    topIssues: entry.topIssues?.length ? entry.topIssues : normalizeTopIssues(undefined, verdict),
    findings: normalizeTopIssues(detail['findings'], verdict),
    updatedAt: entry.updatedAt ?? timestampFromMetadata(metadata),
    evidenceCount: asNumber(detail['evidenceCount']) ?? issues.length,
    discussionsCount: asNumber(detail['discussionsCount']) ?? (Array.isArray(verdict?.['discussions']) ? verdict['discussions'].length : undefined),
    degraded: typeof detail['degraded'] === 'boolean' ? detail['degraded'] : undefined,
    degradedReasons: Array.isArray(detail['degradedReasons']) ? detail['degradedReasons'].filter((item): item is string => typeof item === 'string') : undefined,
    costSummary: asObject(detail['costSummary']) as SessionCostSummary | undefined,
    markdown: asString(detail['markdown']) || [
      `# Review ${entry.id}`,
      '',
      `Decision: ${decision || entry.status}`,
      '',
      reasoning || 'No reasoning available.',
    ].join('\n'),
  };
}

function normalizeAnalyticsStatus(value: unknown): AnalyticsStatus {
  const raw = asObject(value) ?? {};
  const breakdown = Array.isArray(raw.breakdown) ? raw.breakdown : [];
  const trends = Array.isArray(raw.trends) ? raw.trends : [];
  const leaderboard = Array.isArray(raw.leaderboard) ? raw.leaderboard : [];
  return {
    sessionCount: asNumber(raw.sessionCount) ?? 0,
    sessionsWithKnownCost: asNumber(raw.sessionsWithKnownCost) ?? 0,
    unknownCostSessions: asNumber(raw.unknownCostSessions) ?? 0,
    totalCost: asNumber(raw.totalCost) ?? 0,
    formattedTotalCost: asString(raw.formattedTotalCost, 'unknown'),
    averageCost: asNumber(raw.averageCost) ?? 0,
    formattedAverageCost: asString(raw.formattedAverageCost, 'unknown'),
    breakdown: breakdown.map((item) => {
      const entry = asObject(item) ?? {};
      return {
        provider: asString(entry.provider, 'unknown'),
        model: asString(entry.model, 'unknown'),
        calls: asNumber(entry.calls) ?? 0,
        sessions: asNumber(entry.sessions) ?? 0,
        tokens: asNumber(entry.tokens) ?? 0,
        failures: asNumber(entry.failures) ?? 0,
        cost: asNumber(entry.cost) ?? 0,
        formattedCost: asString(entry.formattedCost, 'unknown'),
        knownCostEntries: asNumber(entry.knownCostEntries) ?? 0,
      };
    }),
    trends: trends.map((item) => {
      const entry = asObject(item) ?? {};
      return {
        date: asString(entry.date, 'unknown'),
        sessions: asNumber(entry.sessions) ?? 0,
        cost: asNumber(entry.cost) ?? 0,
        formattedCost: asString(entry.formattedCost, 'unknown'),
      };
    }),
    leaderboard: leaderboard.map((item) => {
      const entry = asObject(item) ?? {};
      return {
        model: asString(entry.model, 'unknown'),
        winRate: asNumber(entry.winRate) ?? 0,
        reviews: asNumber(entry.reviews) ?? 0,
        alpha: asNumber(entry.alpha) ?? 0,
        beta: asNumber(entry.beta) ?? 0,
      };
    }),
  };
}

// ── Bridge API ───────────────────────────────────────────────────

export async function listSessions(forceRefresh = false): Promise<SessionSummary[]> {
  const result = await tauriCall<CliSessionList | CliSessionEntry[]>('list_sessions', { forceRefresh });
  if (result) {
    const sessions = Array.isArray(result) ? result : result.sessions ?? [];
    return sessions.map(normalizeEntry);
  }
  return fallbackSessions();
}

export async function getSessionDetail(id: string, forceRefresh = false): Promise<SessionDetail> {
  const result = await tauriCall<CliSessionDetail>('get_session_detail', { id, forceRefresh });
  if (result) return normalizeDetail(result);
  return fallbackSessionDetail(id, await listSessions());
}

export async function exportSession(id: string, format: 'markdown' | 'json' | 'sarif'): Promise<SessionExport> {
  const result = await tauriCall<SessionExport>('export_session', { id, format });
  if (result) return result;
  const detail = await getSessionDetail(id);
  return fallbackSessionExport(id, format, detail);
}

export async function runReview(staged: boolean): Promise<RunReviewResult> {
  const result = await tauriCall<RunReviewResult>('run_review', { staged });
  if (result) return result;
  await new Promise((resolve) => setTimeout(resolve, 500));
  return {
    ok: true,
    message: staged ? 'Preview mode: staged review would start.' : 'Preview mode: working tree review would start.',
    sessionId: 'preview',
  };
}

export async function startReviewRun(staged: boolean): Promise<ReviewRunSnapshot> {
  const result = await tauriCall<ReviewRunSnapshot>('start_review_run', { staged });
  if (result) return result;
  return fallbackReviewRun(staged);
}

export async function getReviewRun(runId: string): Promise<ReviewRunSnapshot> {
  const result = await tauriCall<ReviewRunSnapshot>('get_review_run', { runId });
  if (result) return result;
  return fallbackReviewRun(true);
}

export async function cancelReviewRun(runId: string): Promise<ReviewRunSnapshot> {
  const result = await tauriCall<ReviewRunSnapshot>('cancel_review_run', { runId });
  if (result) return result;
  return { ...fallbackReviewRun(true), status: 'cancelled' };
}

export async function readConfig(): Promise<DesktopConfig> {
  const result = await tauriCall<DesktopConfig>('read_config');
  if (result) return result;
  return fallbackConfig();
}

export async function writeConfig(raw: string): Promise<DesktopConfig> {
  const result = await tauriCall<DesktopConfig>('write_config', { raw });
  if (result) return result;
  window.localStorage.setItem('codeagora.desktop.config', raw);
  return { path: '.ca/config.json', raw };
}

export async function validateConfig(raw: string, configPath?: string): Promise<ConfigValidation> {
  const result = await tauriCall<ConfigValidation>('validate_config', { raw, configPath });
  if (result) return result;
  return fallbackConfigValidation(raw);
}

export async function getProviderStatus(): Promise<ProviderStatus[]> {
  const result = await tauriCall<ProviderStatus[]>('get_provider_status');
  if (result) return result;
  return fallbackProviderStatus();
}

export async function getMcpStatus(): Promise<McpStatus> {
  const result = await tauriCall<McpStatus>('get_mcp_status');
  if (result) return result;
  return fallbackMcpStatus();
}

export async function getGitHubActionStatus(): Promise<GitHubActionStatus> {
  const result = await tauriCall<GitHubActionStatus>('get_github_action_status');
  if (result) return result;
  return fallbackGitHubActionStatus();
}

export async function getEvidenceStatus(): Promise<EvidenceStatus> {
  const result = await tauriCall<EvidenceStatus>('get_evidence_status');
  if (result) return result;
  return fallbackEvidenceStatus();
}

export async function getAnalyticsStatus(): Promise<AnalyticsStatus> {
  const result = await tauriCall<unknown>('get_analytics_status');
  if (result) return normalizeAnalyticsStatus(result);
  return fallbackAnalyticsStatus();
}

export async function getRepoInfo(): Promise<RepoInfo> {
  const result = await tauriCall<RepoInfo>('get_repo_info');
  if (result) return result;
  return fallbackRepoInfo();
}

export async function openRepository(path: string): Promise<RepoInfo> {
  const result = await tauriCall<RepoInfo>('open_repository', { path });
  if (result) return result;
  return { ...fallbackRepoInfo(), path };
}

export async function getCommandContract(): Promise<DesktopCommandContract[]> {
  const result = await tauriCall<DesktopCommandContract[]>('get_command_contract');
  if (result) return result;
  return fallbackCommandContract();
}

export async function setNotificationPreferences(preferences: NotificationPreferences): Promise<NotificationPreferences> {
  const result = await tauriCall<NotificationPreferences>('set_notification_preferences', { preferences });
  return result ?? preferences;
}
