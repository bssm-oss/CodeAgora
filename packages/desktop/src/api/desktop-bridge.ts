export type ReviewDecision = 'ACCEPT' | 'REJECT' | 'NEEDS_HUMAN';

export interface SeverityCounts {
  HARSHLY_CRITICAL?: number;
  CRITICAL?: number;
  WARNING?: number;
  SUGGESTION?: number;
}

export interface TopIssue {
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
  decision?: ReviewDecision;
  reasoning?: string;
  severityCounts?: SeverityCounts;
  topIssues?: TopIssue[];
  updatedAt?: string;
}

export interface SessionDetail extends SessionSummary {
  markdown?: string;
  evidenceCount?: number;
  discussionsCount?: number;
}

export interface RunReviewResult {
  ok: boolean;
  message: string;
  sessionId?: string;
}

export interface DesktopConfig {
  raw: string;
  path: string;
}

export interface RepoInfo {
  path: string;
}

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type JsonObject = Record<string, unknown>;

interface CliSessionList {
  sessions?: CliSessionEntry[];
}

interface CliSessionEntry {
  id?: unknown;
  date?: unknown;
  sessionId?: unknown;
  status?: unknown;
  dirPath?: unknown;
  decision?: unknown;
  reasoning?: unknown;
  severityCounts?: unknown;
  topIssues?: unknown;
  updatedAt?: unknown;
}

interface CliSessionDetail {
  entry?: CliSessionEntry;
  metadata?: JsonObject;
  verdict?: JsonObject;
  markdown?: unknown;
  evidenceCount?: unknown;
  discussionsCount?: unknown;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke?: TauriInvoke;
    };
    __TAURI__?: {
      core?: {
        invoke?: TauriInvoke;
      };
    };
  }
}

function getInvoke(): TauriInvoke | undefined {
  return window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke;
}

function fallbackSessions(): SessionSummary[] {
  return [
    {
      id: '2026-04-27/001',
      date: '2026-04-27',
      sessionId: '001',
      status: 'completed',
      decision: 'REJECT',
      reasoning: 'Two high-confidence findings need changes before merge.',
      severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 1, WARNING: 2, SUGGESTION: 1 },
      topIssues: [
        {
          severity: 'CRITICAL',
          filePath: 'packages/core/src/pipeline/orchestrator.ts',
          lineRange: [156, 180],
          title: 'Pipeline error path skips result persistence',
          confidence: 91,
        },
      ],
      updatedAt: '2026-04-27T09:30:00.000Z',
    },
    {
      id: '2026-04-26/003',
      date: '2026-04-26',
      sessionId: '003',
      status: 'completed',
      decision: 'ACCEPT',
      reasoning: 'No blocking issues found across reviewers.',
      severityCounts: { HARSHLY_CRITICAL: 0, CRITICAL: 0, WARNING: 0, SUGGESTION: 2 },
      topIssues: [],
      updatedAt: '2026-04-26T18:12:00.000Z',
    },
  ];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : undefined;
}

function severityCountsFromVerdict(verdict?: JsonObject): SeverityCounts {
  const counts: SeverityCounts = {};
  for (const issue of extractIssues(verdict)) {
    const severity = asString(issue.severity, 'SUGGESTION') as keyof SeverityCounts;
    counts[severity] = (counts[severity] ?? 0) + 1;
  }
  return counts;
}

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

function timestampFromValue(raw: unknown): string | undefined {
  if (typeof raw === 'number') return new Date(raw).toISOString();
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return new Date(Number(raw)).toISOString();
  return typeof raw === 'string' ? raw : undefined;
}

function timestampFromMetadata(metadata?: JsonObject): string | undefined {
  const raw = metadata?.['completedAt'] ?? metadata?.['startedAt'] ?? metadata?.['timestamp'];
  return timestampFromValue(raw);
}

function normalizeEntry(entry: CliSessionEntry): SessionSummary {
  const date = asString(entry.date);
  const sessionId = asString(entry.sessionId);
  const id = asString(entry.id, date && sessionId ? `${date}/${sessionId}` : 'unknown');
  const verdict = asObject((entry as JsonObject)['verdict']);
  const decision = asString(entry.decision ?? verdict?.['decision'] ?? verdict?.['verdict']) as ReviewDecision | '';
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
    updatedAt: timestampFromValue(entry.updatedAt),
  };
}

function normalizeDetail(detail: CliSessionDetail): SessionDetail {
  const entry = normalizeEntry(detail.entry ?? {});
  const verdict = detail.verdict;
  const metadata = detail.metadata;
  const issues = extractIssues(verdict);
  const decision = asString(entry.decision ?? verdict?.['decision'] ?? verdict?.['verdict']) as ReviewDecision | '';
  const reasoning = asString(entry.reasoning ?? verdict?.['reasoning'] ?? verdict?.['summary']);
  return {
    ...entry,
    decision: decision || undefined,
    reasoning,
    severityCounts: entry.severityCounts ?? severityCountsFromVerdict(verdict),
    topIssues: entry.topIssues?.length ? entry.topIssues : normalizeTopIssues(undefined, verdict),
    updatedAt: entry.updatedAt ?? timestampFromMetadata(metadata),
    evidenceCount: asNumber(detail.evidenceCount) ?? issues.length,
    discussionsCount: asNumber(detail.discussionsCount) ?? (Array.isArray(verdict?.['discussions']) ? verdict['discussions'].length : undefined),
    markdown: asString(detail.markdown) || [
      `# Review ${entry.id}`,
      '',
      `Decision: ${decision || entry.status}`,
      '',
      reasoning || 'No reasoning available.',
    ].join('\n'),
  };
}

export async function listSessions(): Promise<SessionSummary[]> {
  const invoke = getInvoke();
  if (invoke) {
    const response = await invoke<CliSessionList | CliSessionEntry[]>('list_sessions');
    const sessions = Array.isArray(response) ? response : response.sessions ?? [];
    return sessions.map(normalizeEntry);
  }
  return fallbackSessions();
}

export async function getSessionDetail(id: string): Promise<SessionDetail> {
  const invoke = getInvoke();
  if (invoke) {
    return normalizeDetail(await invoke<CliSessionDetail>('get_session_detail', { id }));
  }
  const session = fallbackSessions().find((item) => item.id === id) ?? fallbackSessions()[0]!;
  return {
    ...session,
    evidenceCount: session.topIssues?.length ?? 0,
    discussionsCount: session.severityCounts?.CRITICAL ? 1 : 0,
    markdown: [
      `# Review ${session.id}`,
      '',
      `Decision: ${session.decision ?? 'unknown'}`,
      '',
      session.reasoning ?? 'No reasoning available.',
    ].join('\n'),
  };
}

export async function runReview(staged: boolean): Promise<RunReviewResult> {
  const invoke = getInvoke();
  if (invoke) return invoke<RunReviewResult>('run_review', { staged });
  await new Promise((resolve) => setTimeout(resolve, 500));
  return {
    ok: true,
    message: staged ? 'Preview mode: staged review would start.' : 'Preview mode: working tree review would start.',
    sessionId: 'preview',
  };
}

export async function readConfig(): Promise<DesktopConfig> {
  const invoke = getInvoke();
  if (invoke) return invoke<DesktopConfig>('read_config');
  return {
    path: '.ca/config.json',
    raw: window.localStorage.getItem('codeagora.desktop.config') ?? '{\n  "language": "en",\n  "reviewers": []\n}',
  };
}

export async function writeConfig(raw: string): Promise<DesktopConfig> {
  const invoke = getInvoke();
  if (invoke) return invoke<DesktopConfig>('write_config', { raw });
  window.localStorage.setItem('codeagora.desktop.config', raw);
  return { path: '.ca/config.json', raw };
}

export async function getRepoInfo(): Promise<RepoInfo> {
  const invoke = getInvoke();
  if (invoke) return invoke<RepoInfo>('get_repo_info');
  return { path: window.location.pathname.includes('/packages/desktop/') ? 'browser preview' : window.location.pathname };
}
