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
  LiveDoctorStatus,
  McpStatus,
  GitHubActionStatus,
  EvidenceStatus,
  RepoInfo,
  DesktopCommandContract,
  NotificationPreferences,
  DesktopBridgeError,
  SeverityCounts,
  TopIssue,
  SessionCostSummary,
  ReviewDecision,
  ReviewDecisionBrief,
  ReviewDecisionEvidenceCard,
} from './desktop-bridge.types.js';
export type * from './desktop-bridge.types.js';
import {
  fallbackSessions,
  fallbackSessionDetail,
  fallbackSessionExport,
  fallbackConfig,
  fallbackConfigValidation,
  fallbackProviderStatus,
  fallbackLiveDoctorStatus,
  fallbackMcpStatus,
  fallbackGitHubActionStatus,
  fallbackEvidenceStatus,
  fallbackRepoInfo,
  fallbackCommandContract,
} from './desktop-fallbacks.js';

// ── tauriCall wrapper ────────────────────────────────────────────

/** Whether the app is running inside a Tauri shell. */
export const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const DESKTOP_PREVIEW_DISABLED = 'DESKTOP_PREVIEW_DISABLED';

export class DesktopPreviewDisabledError extends Error implements DesktopBridgeError {
  code: 'DESKTOP_PREVIEW_DISABLED' = DESKTOP_PREVIEW_DISABLED;

  constructor(operation: string) {
    super(`${operation} requires the CodeAgora Desktop shell. Browser preview is read-only.`);
    this.name = 'DesktopPreviewDisabledError';
  }
}

/**
 * Call a Tauri IPC command, returning `null` if not in a Tauri context.
 * When in Tauri, real errors propagate to the caller so the UI can
 * surface failures instead of silently falling through to mock data.
 */
async function tauriCall<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!IS_TAURI) return null;
  return invoke<T>(cmd, args);
}

function previewDisabled(operation: string): never {
  throw new DesktopPreviewDisabledError(operation);
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

function redactDesktopString(value: string): string {
  return value
    .replace(/(["'])([A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)|(?:api[_-]?key|token|secret|password))\1\s*:\s*(["'])([^"'\r\n,}\]]+)\3/gi, (_match, keyQuote: string, key: string, valueQuote: string) => `${keyQuote}${key}${keyQuote}: ${valueQuote}[REDACTED]${valueQuote}`)
    .replace(/\b([A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)|(?:api[_-]?key|token|secret|password))\s*[:=]\s*(["']?)([^\s"']+)\2/gi, (_match, key: string) => `${key}=[REDACTED]`)
    .replace(/\b(Authorization\s*:\s*Bearer\s+)([^\s"']+)/gi, (_match, prefix: string) => `${prefix}[REDACTED]`)
    .replace(/\b(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, (_match, prefix: string) => `${prefix}[REDACTED]`)
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|AIza[0-9A-Za-z_-]{12,})\b/g, '[REDACTED]');
}

function redactDesktopValue<T>(value: T): T {
  if (typeof value === 'string') return redactDesktopString(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactDesktopValue(item)) as T;
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = redactDesktopValue(item);
    }
    return output as T;
  }
  return value;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeDecision(value: unknown): ReviewDecision | undefined {
  return value === 'ACCEPT' || value === 'REJECT' || value === 'NEEDS_HUMAN'
    ? value
    : undefined;
}

function normalizeLineRange(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value)) return undefined;
  const start = Number(value[0] ?? 0);
  const end = Number(value[1] ?? value[0] ?? 0);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) {
    return undefined;
  }
  return [start, end];
}

function normalizeEvidenceCard(value: unknown): ReviewDecisionEvidenceCard | undefined {
  const card = asObject(value);
  if (!card) return undefined;
  const kind = card.kind === 'must-fix' || card.kind === 'human-gate' ? card.kind : undefined;
  const source = card.source === 'evidence' || card.source === 'discussion' ? card.source : undefined;
  const title = asString(card.title).trim();
  const filePath = asString(card.filePath).trim();
  const diffFact = asString(card.diffFact).trim();
  const affectedContract = asString(card.affectedContract).trim();
  const check = asString(card.check).trim();
  const decisionRule = asString(card.decisionRule).trim();
  const lineRange = normalizeLineRange(card.lineRange);
  const missing = asStringArray(card.missing);
  if (
    card.complete !== true ||
    missing.length > 0 ||
    !kind ||
    !source ||
    !title ||
    !filePath ||
    !lineRange ||
    !diffFact ||
    !affectedContract ||
    !check ||
    !decisionRule
  ) {
    return undefined;
  }
  return redactDesktopValue({
    kind,
    source,
    title,
    severity: asString(card.severity, 'SUGGESTION'),
    filePath,
    lineRange,
    confidence: asNumber(card.confidence),
    diffFact,
    affectedContract,
    check,
    expectedActual: asString(card.expectedActual) || undefined,
    decisionRule,
    complete: true,
    missing,
  });
}

function normalizeDecisionBrief(value: unknown): ReviewDecisionBrief | undefined {
  const brief = asObject(value);
  const decision = normalizeDecision(brief?.decision);
  const scope = asObject(brief?.reviewedScope);
  if (!brief || !decision || !scope) return undefined;
  const evidenceCards = Array.isArray(brief.evidenceCards)
    ? brief.evidenceCards.map(normalizeEvidenceCard).filter((card): card is ReviewDecisionEvidenceCard => Boolean(card))
    : [];
  return redactDesktopValue({
    decision,
    reviewedScope: {
      files: asStringArray(scope.files),
      areas: asStringArray(scope.areas),
      contracts: asStringArray(scope.contracts),
      checks: asStringArray(scope.checks),
      uncertainty: asString(scope.uncertainty),
    },
    completedChecks: asStringArray(brief.completedChecks),
    evidenceCards,
    requiredActions: asStringArray(brief.requiredActions),
    followUpCount: asNumber(brief.followUpCount) ?? 0,
    auditCount: asNumber(brief.auditCount) ?? 0,
    demotedCount: asNumber(brief.demotedCount) ?? 0,
  });
}

function resolvePublicDecision(input: {
  publicDecision?: unknown;
  decisionBrief?: ReviewDecisionBrief;
  rawDecision?: ReviewDecision;
}): ReviewDecision | undefined {
  return normalizeDecision(input.publicDecision) ?? input.decisionBrief?.decision ?? input.rawDecision;
}

function verdictDecision(verdict?: JsonObject): ReviewDecision | undefined {
  const summary = asObject(verdict?.summary);
  return normalizeDecision(verdict?.decision ?? verdict?.verdict ?? summary?.decision);
}

function verdictReasoning(verdict?: JsonObject): string {
  const summary = asObject(verdict?.summary);
  return asString(verdict?.reasoning ?? summary?.reasoning ?? verdict?.summary);
}

type CliSessionList = { sessions?: CliSessionEntry[] };
type CliSessionEntry = Record<string, unknown>;
type CliSessionDetail = Record<string, unknown>;

function extractIssues(verdict?: JsonObject): JsonObject[] {
  if (!verdict) return [];
  const evidenceDocs = verdict.evidenceDocs;
  if (Array.isArray(evidenceDocs) && evidenceDocs.length > 0) {
    return evidenceDocs.filter((item): item is JsonObject => typeof item === 'object' && item !== null);
  }

  for (const key of ['issues', 'findings', 'items']) {
    const value = verdict[key];
    if (Array.isArray(value) && value.length > 0) {
      return value.filter((item): item is JsonObject => typeof item === 'object' && item !== null);
    }
  }

  const summary = asObject(verdict.summary);
  const topIssues = summary?.topIssues;
  if (Array.isArray(topIssues) && topIssues.length > 0) {
    return topIssues.filter((item): item is JsonObject => typeof item === 'object' && item !== null);
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
  const decisionBrief = normalizeDecisionBrief(entry.decisionBrief ?? verdict?.['decisionBrief']);
  const decision = normalizeDecision(entry.decision) ?? verdictDecision(verdict);
  const publicDecision = resolvePublicDecision({
    publicDecision: entry.publicDecision ?? verdict?.['publicDecision'],
    decisionBrief,
    rawDecision: decision,
  });
  return {
    id,
    date,
    sessionId,
    status: asString(entry.status, 'unknown') as SessionSummary['status'],
    dirPath: asString(entry.dirPath) || undefined,
    decision,
    publicDecision,
    reasoning: asString(entry.reasoning) || verdictReasoning(verdict) || undefined,
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
  const rawEntry = asObject(detail['entry']) ?? {};
  const entry = normalizeEntry(rawEntry);
  const verdict = asObject(detail['verdict']);
  const metadata = asObject(detail['metadata']);
  const issues = extractIssues(verdict);
  const decisionBrief = normalizeDecisionBrief(detail['decisionBrief'] ?? verdict?.['decisionBrief'] ?? rawEntry.decisionBrief);
  const decision = normalizeDecision(entry.decision) ?? verdictDecision(verdict);
  const publicDecision = resolvePublicDecision({
    publicDecision: detail['publicDecision'] ?? entry.publicDecision ?? verdict?.['publicDecision'],
    decisionBrief,
    rawDecision: decision,
  });
  const reasoning = asString(entry.reasoning) || verdictReasoning(verdict);
  return {
    ...entry,
    decision,
    publicDecision,
    decisionBrief,
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
      `Decision: ${publicDecision || decision || entry.status}`,
      '',
      reasoning || 'No reasoning available.',
    ].join('\n'),
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
  return previewDisabled('runReview');
}

export async function startReviewRun(staged: boolean): Promise<ReviewRunSnapshot> {
  const result = await tauriCall<ReviewRunSnapshot>('start_review_run', { staged });
  if (result) return result;
  return previewDisabled('startReviewRun');
}

export async function getReviewRun(runId: string): Promise<ReviewRunSnapshot> {
  const result = await tauriCall<ReviewRunSnapshot>('get_review_run', { runId });
  if (result) return result;
  return previewDisabled('getReviewRun');
}

export async function cancelReviewRun(runId: string): Promise<ReviewRunSnapshot> {
  const result = await tauriCall<ReviewRunSnapshot>('cancel_review_run', { runId });
  if (result) return result;
  return previewDisabled('cancelReviewRun');
}

export async function readConfig(): Promise<DesktopConfig> {
  const result = await tauriCall<DesktopConfig>('read_config');
  if (result) return result;
  return fallbackConfig();
}

export async function writeConfig(raw: string): Promise<DesktopConfig> {
  const result = await tauriCall<DesktopConfig>('write_config', { raw });
  if (result) return result;
  return previewDisabled('writeConfig');
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

export async function getLiveDoctorStatus(): Promise<LiveDoctorStatus> {
  const result = await tauriCall<LiveDoctorStatus>('get_live_doctor_status');
  if (result) return result;
  return fallbackLiveDoctorStatus();
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

export async function getRepoInfo(): Promise<RepoInfo> {
  const result = await tauriCall<RepoInfo>('get_repo_info');
  if (result) return result;
  return fallbackRepoInfo();
}

export async function openRepository(path: string): Promise<RepoInfo> {
  const result = await tauriCall<RepoInfo>('open_repository', { path });
  if (result) return result;
  return previewDisabled('openRepository');
}

export function isApprovedExternalUrl(raw: string): boolean {
  const url = raw.trim();
  if (!url || url !== raw) return false;
  if (!url.toLowerCase().startsWith('https://')) return false;
  if (/[\s\\\u0000-\u001f\u007f]/u.test(url)) return false;

  const authority = url.slice('https://'.length).split(/[/?#]/u, 1)[0] ?? '';
  if (!authority || authority.includes('@') || authority.startsWith('.') || authority.endsWith('.')) {
    return false;
  }
  return true;
}

export async function openExternalLink(url: string): Promise<void> {
  if (!isApprovedExternalUrl(url)) {
    throw new Error('Unsupported external link URL. CodeAgora Desktop only opens https links externally.');
  }

  const opened = await tauriCall<boolean>('open_external_link', { url });
  if (opened) return;

  throw new Error('External link opening requires the CodeAgora Desktop shell.');
}

export async function selectRepositoryDirectory(title: string, defaultPath?: string): Promise<string | undefined> {
  if (!IS_TAURI) {
    const selected = window.prompt(title, defaultPath ?? fallbackRepoInfo().path);
    return selected?.trim() || undefined;
  }

  const selected = await invoke<string | string[] | null>('plugin:dialog|open', {
    options: {
      title,
      directory: true,
      multiple: false,
      defaultPath,
    },
  });
  if (Array.isArray(selected)) return typeof selected[0] === 'string' ? selected[0] : undefined;
  return typeof selected === 'string' ? selected : undefined;
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
