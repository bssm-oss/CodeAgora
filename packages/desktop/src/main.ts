import { getLocale, setLocale, t } from '@codeagora/shared/i18n/index.js';
import { activeReviewerCount, evaluateConfigPolicy, isEnabledConfigEntry } from './readiness.js';
import { isCompactMobileViewport, resolveRunMobileStep, type RunMobileStep, type SessionMobileTab } from './layout.js';
import { logoDataUri } from './logo.js';
import {
  getRepoInfo,
  cancelReviewRun,
  getEvidenceStatus,
  exportSession,
  getGitHubActionStatus,
  getLiveDoctorStatus,
  getMcpStatus,
  getProviderStatus,
  getReviewRun,
  getSessionDetail,
  listSessions,
  openRepository,
  readConfig,
  selectRepositoryDirectory,
  setNotificationPreferences,
  startReviewRun,
  validateConfig,
  writeConfig,
  IS_TAURI,
  type ConfigValidation,
  type EvidenceStatus,
  type GitHubActionStatus,
  type LiveDoctorStatus,
  type McpStatus,
  type NotificationPreferences,
  type ProviderStatus,
  type RepoInfo,
  type ReviewRunEvent,
  type ReviewRunSnapshot,
  type SessionDetail,
  type SessionSummary,
} from './api/desktop-bridge.js';

type View = 'sessions' | 'run' | 'config' | 'setup';
type DesktopLocale = 'en' | 'ko';
type DesktopLocalePreference = DesktopLocale | 'auto';
type DesktopThemePreference = 'system' | 'light' | 'dark';
interface RunReadiness {
  ready: boolean;
  reasons: string[];
  nextSteps: string[];
}
const sessionPageSize = 50;

const recentReposKey = 'codeagora.desktop.recentRepos';
const localePreferenceKey = 'codeagora.desktop.locale';
const themePreferenceKey = 'codeagora.desktop.theme';
const notificationPreferenceKey = 'codeagora.desktop.notifications';
const defaultNotificationPreferences: NotificationPreferences = {
  enabled: true,
  notifySuccess: false,
  notifyFailure: true,
  sound: false,
  badge: true,
};
const defaultWorkspaceConfig = {
  mode: 'pragmatic',
  language: 'en',
  reviewers: [
    {
      id: 'r-mimo',
      model: 'xiaomi/mimo-v2.5',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
  ],
  supporters: {
    pool: [
      {
        id: 's-glm',
        model: 'z-ai/glm-5.1',
        backend: 'api',
        provider: 'openrouter',
        enabled: true,
        timeout: 180,
      },
    ],
    pickCount: 1,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 'da-grok',
      model: 'x-ai/grok-4.3',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 180,
    },
    personaPool: ['.ca/personas/strict.md'],
    personaAssignment: 'random',
  },
  moderator: {
    model: 'openai/gpt-5.3-codex',
    backend: 'api',
    provider: 'openrouter',
  },
  discussion: {
    maxRounds: 1,
    registrationThreshold: {
      HARSHLY_CRITICAL: 1,
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: null,
    },
    codeSnippetRange: 10,
  },
  head: {
    backend: 'api',
    model: 'qwen/qwen3.7-max',
    provider: 'openrouter',
    enabled: true,
  },
  errorHandling: {
    maxRetries: 2,
    forfeitThreshold: 0.7,
  },
};

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  createdAt: number;
}

interface AppState {
  view: View;
  sessions: SessionSummary[];
  selected?: SessionDetail;
  activeMobileTab: SessionMobileTab;
  runMobileStep: RunMobileStep;
  repoPath: string;
  repoInfo?: RepoInfo;
  repoInput: string;
  recentRepoPaths: string[];
  activeRun?: ReviewRunSnapshot;
  sessionSearch: string;
  sessionStatus: 'all' | SessionSummary['status'];
  sessionSort: 'date-desc' | 'date-asc' | 'decision' | 'severity';
  sessionVisibleCount: number;
  configRaw: string;
  configPath: string;
  configValidation?: ConfigValidation;
  configDirty: boolean;
  configOriginal: string;
  providers: ProviderStatus[];
  liveDoctorStatus?: LiveDoctorStatus;
  liveDoctorLoading: boolean;
  liveDoctorError?: string;
  mcpStatus?: McpStatus;
  githubActionStatus?: GitHubActionStatus;
  evidenceStatus?: EvidenceStatus;
  notice?: string;
  toasts: Toast[];
  localePreference: DesktopLocalePreference;
  themePreference: DesktopThemePreference;
  notificationPreferences: NotificationPreferences;
  attentionCount: number;
  busy: boolean;
}

const state: AppState = {
  view: 'sessions',
  sessions: [],
  repoPath: '',
  repoInput: '',
  recentRepoPaths: loadRecentRepoPaths(),
  activeMobileTab: 'history',
  runMobileStep: 1,
  sessionSearch: '',
  sessionStatus: 'all',
  sessionSort: 'date-desc',
  sessionVisibleCount: sessionPageSize,
  configRaw: '',
  configPath: '.ca/config.json',
  configDirty: false,
  configOriginal: '',
  providers: [],
  liveDoctorLoading: false,
  localePreference: loadLocalePreference(),
  themePreference: loadThemePreference(),
  notificationPreferences: loadNotificationPreferences(),
  attentionCount: 0,
  busy: false,
  toasts: [],
};

function resetConfigState(): void {
  state.configRaw = '';
  state.configPath = '.ca/config.json';
  state.configOriginal = '';
  state.configDirty = false;
  state.configValidation = undefined;
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');
const appRoot = app;
let reviewPollHandle: number | undefined;
let lastView: View | undefined;
let pollRetryCount = 0;
let pollInFlight = false;
const maxPollRetries = 5;
let mediaQuery: MediaQueryList | null = null;
let lastMobileLayout = isCompactMobileViewport(window.innerWidth);
let preferencesMenuCleanup: (() => void) | undefined;

function onThemeChange(): void {
  if (state.themePreference === 'system') applyDesktopTheme();
}

function onViewportChange(): void {
  const compact = isCompactMobileViewport(window.innerWidth);
  if (compact === lastMobileLayout) return;
  lastMobileLayout = compact;
  render();
}

function canNavigateToView(view: View): boolean {
  if (state.view === 'config' && state.configDirty && view !== 'config') {
    return confirm(t('desktop.confirm.discardUnsavedConfig'));
  }
  return true;
}

function resetSessionFilters(): boolean {
  const hadFilters = Boolean(state.sessionSearch) || state.sessionStatus !== 'all' || state.sessionSort !== 'date-desc';
  if (!hadFilters) return false;
  state.sessionSearch = '';
  state.sessionStatus = 'all';
  state.sessionSort = 'date-desc';
  state.sessionVisibleCount = sessionPageSize;
  render();
  return true;
}

function onKeyDown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement;
  if (event.key === 'Escape') {
    if (target instanceof HTMLInputElement && target.dataset.testid === 'session-filter-input' && state.sessionSearch) {
      state.sessionSearch = '';
      state.sessionVisibleCount = sessionPageSize;
      render();
      event.preventDefault();
      return;
    }
    if (state.view === 'sessions' && resetSessionFilters()) {
      event.preventDefault();
      return;
    }
    if (state.toasts.length > 0) {
      removeToast(state.toasts[state.toasts.length - 1].id)
      event.preventDefault()
      return
    }
    if (state.notice) {
      state.notice = undefined
      render()
      event.preventDefault()
      return
    }
    if (state.selected) {
      state.selected = undefined
      render()
      event.preventDefault()
      return
    }
  }

  if (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return;
  }

  const isMeta = event.metaKey || event.ctrlKey;

  if (isMeta && event.key === 'r') {
    event.preventDefault();
    if (!state.busy && runReadiness().ready) {
      void startReview(true);
    }
    return;
  }

  if (isMeta && event.key === ',') {
    event.preventDefault();
    setView('config');
    if (!state.configRaw) void loadConfig();
    return;
  }

  if (isMeta && event.key === '1') {
    event.preventDefault();
    setView('sessions');
    return;
  }

  if (isMeta && event.key === '2') {
    event.preventDefault();
    setView('run');
    return;
  }

  if (isMeta && event.key === '3') {
    event.preventDefault();
    setView('config');
    if (!state.configRaw) void loadConfig();
    return;
  }

  if (isMeta && event.key === '4') {
    event.preventDefault();
    setView('setup');
    if (state.providers.length === 0) void loadSetup();
    return;
  }

}

function normalizeLocale(value?: string): DesktopLocale | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'ko' || normalized.startsWith('ko-') || normalized.startsWith('ko_')) return 'ko';
  if (normalized === 'en' || normalized.startsWith('en-') || normalized.startsWith('en_')) return 'en';
  return undefined;
}

function configLocale(raw: string): DesktopLocale | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    const language = (parsed as { language?: unknown }).language;
    return typeof language === 'string' ? normalizeLocale(language) : undefined;
  } catch {
    return undefined;
  }
}

function browserLocales(): string[] {
  return [...(navigator.languages ?? []), navigator.language].filter((language): language is string => Boolean(language));
}

function resolveDesktopLocale(raw: string, preference: DesktopLocalePreference, languages = browserLocales()): DesktopLocale {
  if (preference === 'en' || preference === 'ko') return preference;
  return configLocale(raw) ?? languages.map(normalizeLocale).find((locale): locale is DesktopLocale => Boolean(locale)) ?? 'ko';
}

function resolveDesktopTheme(preference: DesktopThemePreference): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyDesktopTheme(preference = state.themePreference): void {
  const root = document.documentElement;
  if (preference === 'light' || preference === 'dark') {
    root.dataset.theme = preference;
    root.style.colorScheme = preference;
    return;
  }
  delete root.dataset.theme;
  root.style.colorScheme = resolveDesktopTheme(preference);
}

function applyDesktopLocale(raw = state.configRaw): void {
  setLocale(resolveDesktopLocale(raw, state.localePreference));
  document.documentElement.lang = getLocale();
}

function severityTotal(session: SessionSummary): number {
  const counts = session.severityCounts ?? {};
  return Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);
}

function sortSessions(sessions: SessionSummary[]): SessionSummary[] {
  const sorted = [...sessions];
  switch (state.sessionSort) {
    case 'date-desc':
      return sorted.sort((a, b) => timestampValue(b.updatedAt) - timestampValue(a.updatedAt));
    case 'date-asc':
      return sorted.sort((a, b) => timestampValue(a.updatedAt) - timestampValue(b.updatedAt));
    case 'decision': {
      const order = { ACCEPT: 0, REJECT: 1, NEEDS_HUMAN: 2 };
      return sorted.sort((a, b) => (order[a.decision as keyof typeof order] ?? 3) - (order[b.decision as keyof typeof order] ?? 3));
    }
    case 'severity': {
      const sev = (s: SessionSummary) =>
        (s.severityCounts?.CRITICAL ?? 0) * 100 +
        (s.severityCounts?.WARNING ?? 0) * 10 +
        (s.severityCounts?.SUGGESTION ?? 0);
      return sorted.sort((a, b) => sev(b) - sev(a));
    }
  }
  return sorted;
}

function filteredSessions(): SessionSummary[] {
  let result = state.sessions;
  if (state.sessionSearch.trim()) {
    const q = state.sessionSearch.toLowerCase();
    result = result.filter((s) => {
      const issueMatch = s.topIssues?.some((issue) =>
        issue.filePath.toLowerCase().includes(q) ||
        issue.title.toLowerCase().includes(q) ||
        issue.severity.toLowerCase().includes(q),
      );
      return Boolean(
        s.id.toLowerCase().includes(q) ||
        (s.decision ?? '').toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q) ||
        s.reasoning?.toLowerCase().includes(q) ||
        issueMatch,
      );
    });
  }
  if (state.sessionStatus !== 'all') {
    result = result.filter((s) => s.status === state.sessionStatus);
  }
  return sortSessions(result);
}

function decisionClass(decision?: string): string {
  if (decision === 'ACCEPT') return 'ca-decision ca-accept';
  if (decision === 'REJECT') return 'ca-decision ca-reject';
  if (decision === 'NEEDS_HUMAN') return 'ca-decision ca-human';
  return 'ca-decision';
}

type SeverityKey = 'HARSHLY_CRITICAL' | 'CRITICAL' | 'WARNING' | 'SUGGESTION';

type SeveritySource = {
  severityCounts?: Partial<Record<SeverityKey, number>>;
};

type CockpitTone = 'good' | 'warn' | 'danger' | 'info';

interface CockpitStatus {
  tone: CockpitTone;
  label: string;
  title: string;
  body: string;
  primaryLabel: string;
  primaryView: View;
  secondaryLabel: string;
  secondaryView: View;
}

function severityCount(source: SeveritySource, key: SeverityKey): number {
  return source.severityCounts?.[key] ?? 0;
}

function blockerCount(source: SeveritySource): number {
  return severityCount(source, 'HARSHLY_CRITICAL') + severityCount(source, 'CRITICAL');
}

function latestSession(): SessionSummary | undefined {
  return [...state.sessions].sort((a, b) => timestampValue(b.updatedAt) - timestampValue(a.updatedAt))[0];
}

function plainDecision(decision?: string, fallback?: string): string {
  if (decision === 'ACCEPT') return t('desktop.decision.accept');
  if (decision === 'REJECT') return t('desktop.decision.reject');
  if (decision === 'NEEDS_HUMAN') return t('desktop.decision.needsHuman');
  return fallback ?? decision ?? t('desktop.value.unknown');
}

function plainSessionStatus(status?: SessionSummary['status'] | SessionDetail['status']): string {
  if (status === 'completed') return t('desktop.sessions.status.completed');
  if (status === 'failed') return t('desktop.sessions.status.failed');
  if (status === 'interrupted') return t('desktop.sessions.status.interrupted');
  if (status === 'in_progress') return t('desktop.sessions.status.inProgress');
  if (status === 'unknown') return t('desktop.sessions.status.unknown');
  return t('desktop.value.unknown');
}

function sessionDisplayTitle(session: SessionSummary): string {
  if (session.status === 'in_progress') return t('desktop.sessions.rowTitleRunning');
  if (session.decision === 'ACCEPT') return t('desktop.sessions.rowTitleAccepted');
  if (session.decision === 'NEEDS_HUMAN') return t('desktop.sessions.rowTitleHuman');
  const blockers = blockerCount(session);
  if (session.decision === 'REJECT' || blockers > 0) return t('desktop.sessions.rowTitleBlocked', { count: blockers });
  return t('desktop.sessions.rowTitleReview');
}

function severityLabel(severity: SeverityKey | string): string {
  switch (severity) {
    case 'HARSHLY_CRITICAL':
      return t('desktop.severity.blocker');
    case 'CRITICAL':
      return t('desktop.severity.critical');
    case 'WARNING':
      return t('desktop.severity.warning');
    case 'SUGGESTION':
      return t('desktop.severity.suggestion');
    default:
      return severity;
  }
}

function decisionTone(session: Pick<SessionSummary, 'decision' | 'status' | 'severityCounts'>): CockpitTone {
  if (session.decision === 'ACCEPT') return 'good';
  if (session.decision === 'REJECT' || blockerCount(session) > 0) return 'danger';
  if (session.decision === 'NEEDS_HUMAN') return 'warn';
  if (session.status === 'failed' || session.status === 'interrupted') return 'danger';
  if (session.status === 'in_progress') return 'info';
  return 'warn';
}

function runReadiness(): RunReadiness {
  const reasons: string[] = [];
  const nextSteps = new Set<string>();
  const repo = state.repoInfo;
  if (!repo) {
    reasons.push(t('desktop.readiness.reason.repoUnknown'));
    nextSteps.add(t('desktop.readiness.next.selectRepo'));
  }
  if (repo && !repo.isGitRepo) {
    reasons.push(t('desktop.readiness.reason.notGitRepo'));
    nextSteps.add(t('desktop.readiness.next.selectRepo'));
  }
  if (repo && !repo.trusted) {
    reasons.push(repo.trustReason || t('desktop.readiness.reason.notTrusted'));
    nextSteps.add(t('desktop.readiness.next.trustedRepo'));
  }
  if (repo && !repo.hasConfig) {
    reasons.push(t('desktop.readiness.reason.configMissing'));
    nextSteps.add(t('desktop.readiness.next.initConfig'));
  }
  if (state.configValidation?.valid === false) {
    reasons.push(t('desktop.readiness.reason.configInvalid'));
    nextSteps.add(t('desktop.readiness.next.fixConfig'));
  }
  if (state.configValidation?.valid !== false && repo?.hasConfig !== false && state.configRaw.trim()) {
    const policy = evaluateConfigPolicy(state.configRaw);
    if (policy.validJson && !policy.complete) {
      reasons.push(t('desktop.readiness.reason.noActiveReviewers'));
      nextSteps.add(t('desktop.readiness.next.addReviewer'));
    }
  }
  if (reasons.length > 0) {
    nextSteps.add(t('desktop.readiness.next.liveDoctor'));
  }
  return { ready: reasons.length === 0, reasons, nextSteps: [...nextSteps] };
}

function readinessBlockedReason(readiness = runReadiness()): string {
  return readiness.reasons[0] ?? t('desktop.readiness.blockedBody');
}

function repoNeedsConfig(): boolean {
  return Boolean(state.repoInfo?.trusted && state.repoInfo.isGitRepo && !state.repoInfo.hasConfig);
}

function defaultWorkspaceConfigRaw(): string {
  return JSON.stringify(defaultWorkspaceConfig, null, 2);
}

function isPlaceholderConfig(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { reviewers?: unknown };
    return Array.isArray(parsed.reviewers) && parsed.reviewers.length === 0;
  } catch {
    return false;
  }
}

function sessionHasDegradedSignal(session?: SessionDetail): boolean {
  return Boolean(session?.degraded || (session?.degradedReasons && session.degradedReasons.length > 0));
}

function runHasDegradedSignal(run?: ReviewRunSnapshot): boolean {
  if (!run) return false;
  return run.events.some((event) => /degraded/i.test(event.kind) || /degraded/i.test(event.message));
}

function cockpitStatus(latest: SessionSummary | undefined, readiness: RunReadiness): CockpitStatus {
  if (state.activeRun && isReviewRunning(state.activeRun)) {
    return {
      tone: 'info',
      label: t('desktop.cockpit.status.runningLabel'),
      title: t('desktop.cockpit.status.runningTitle'),
      body: state.activeRun.message || t('desktop.cockpit.status.runningBody'),
      primaryLabel: t('desktop.action.openTimeline'),
      primaryView: 'run',
      secondaryLabel: t('desktop.action.reviewResults'),
      secondaryView: 'sessions',
    };
  }

  if (!readiness.ready) {
    return {
      tone: 'warn',
      label: t('desktop.cockpit.status.setupLabel'),
      title: t('desktop.cockpit.status.setupTitle'),
      body: readiness.reasons[0] ?? t('desktop.readiness.blockedBody'),
      primaryLabel: t('desktop.action.fixSetup'),
      primaryView: 'setup',
      secondaryLabel: t('desktop.action.openRepository'),
      secondaryView: 'run',
    };
  }

  if (!latest) {
    return {
      tone: 'info',
      label: t('desktop.cockpit.status.noReviewLabel'),
      title: t('desktop.cockpit.status.noReviewTitle'),
      body: t('desktop.cockpit.status.noReviewBody'),
      primaryLabel: t('desktop.action.runStagedReview'),
      primaryView: 'run',
      secondaryLabel: t('desktop.action.checkSetup'),
      secondaryView: 'setup',
    };
  }

  if (latest.decision === 'ACCEPT') {
    return {
      tone: 'good',
      label: plainDecision(latest.decision),
      title: t('desktop.cockpit.status.acceptTitle'),
      body: latest.reasoning ?? t('desktop.cockpit.status.acceptBody'),
      primaryLabel: t('desktop.action.reviewResults'),
      primaryView: 'sessions',
      secondaryLabel: t('desktop.action.runAgain'),
      secondaryView: 'run',
    };
  }

  if (latest.decision === 'REJECT' || blockerCount(latest) > 0) {
    return {
      tone: 'danger',
      label: plainDecision(latest.decision, t('desktop.cockpit.status.blockedLabel')),
      title: t('desktop.cockpit.status.rejectTitle', { count: blockerCount(latest) }),
      body: latest.reasoning ?? t('desktop.cockpit.status.rejectBody'),
      primaryLabel: t('desktop.action.reviewFindings'),
      primaryView: 'sessions',
      secondaryLabel: t('desktop.action.rerunReview'),
      secondaryView: 'run',
    };
  }

  return {
    tone: 'warn',
    label: plainDecision(latest.decision),
    title: t('desktop.cockpit.status.needsHumanTitle'),
    body: latest.reasoning ?? t('desktop.cockpit.status.needsHumanBody'),
    primaryLabel: t('desktop.action.reviewFindings'),
    primaryView: 'sessions',
    secondaryLabel: t('desktop.action.exportDecision'),
    secondaryView: 'sessions',
  };
}

function timestampValue(value?: string): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function appendMetric(parent: HTMLElement, label: string, value: string, tone = ''): void {
  const card = el('div', tone ? `ca-metric-card ${tone}` : 'ca-metric-card');
  card.append(el('span', '', label));
  card.append(el('strong', '', value));
  parent.append(card);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void, className = 'ca-button', testId?: string): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  node.dataset.testid = testId ?? `button-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  node.disabled = state.busy;
  node.addEventListener('click', onClick);
  return node;
}

function checkboxControl(label: string, checked: boolean, onChange: (checked: boolean) => void, testId: string): HTMLLabelElement {
  const control = el('label', 'ca-toolbar-checkbox') as HTMLLabelElement;
  const input = el('input', '') as HTMLInputElement;
  input.type = 'checkbox';
  input.checked = checked;
  input.disabled = state.busy;
  input.dataset.testid = testId;
  input.setAttribute('aria-label', label);
  input.addEventListener('change', () => onChange(input.checked));
  control.append(input, el('span', '', label));
  return control;
}

function isCompactMobileLayout(): boolean {
  return isCompactMobileViewport(window.innerWidth);
}

function setView(view: View): void {
  if (!canNavigateToView(view)) return;
  state.view = view;
  if (view === 'sessions') {
    state.attentionCount = 0;
    updateBadgeState();
    state.activeMobileTab = 'history';
  }
  render();
}

function loadRecentRepoPaths(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(recentReposKey) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

function rememberRepoPath(path: string): void {
  const next = [path, ...state.recentRepoPaths.filter((item) => item !== path)].slice(0, 5);
  state.recentRepoPaths = next;
  window.localStorage.setItem(recentReposKey, JSON.stringify(next));
}

function loadLocalePreference(): DesktopLocalePreference {
  try {
    const value = window.localStorage.getItem(localePreferenceKey);
    if (value === 'en' || value === 'ko' || value === 'auto') return value;
  } catch {
    return 'ko';
  }
  return 'ko';
}

function saveLocalePreference(preference: DesktopLocalePreference): void {
  try {
    if (preference === 'auto') {
      window.localStorage.removeItem(localePreferenceKey);
      return;
    }
    window.localStorage.setItem(localePreferenceKey, preference);
  } catch {
    return;
  }
}

function loadThemePreference(): DesktopThemePreference {
  try {
    const value = window.localStorage.getItem(themePreferenceKey);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    return 'system';
  }
  return 'system';
}

function saveThemePreference(preference: DesktopThemePreference): void {
  try {
    if (preference === 'system') {
      window.localStorage.removeItem(themePreferenceKey);
      return;
    }
    window.localStorage.setItem(themePreferenceKey, preference);
  } catch {
    return;
  }
}

function loadNotificationPreferences(): NotificationPreferences {
  try {
    const raw = window.localStorage.getItem(notificationPreferenceKey);
    if (!raw) return defaultNotificationPreferences;
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : defaultNotificationPreferences.enabled,
      notifySuccess: typeof parsed.notifySuccess === 'boolean' ? parsed.notifySuccess : defaultNotificationPreferences.notifySuccess,
      notifyFailure: typeof parsed.notifyFailure === 'boolean' ? parsed.notifyFailure : defaultNotificationPreferences.notifyFailure,
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : defaultNotificationPreferences.sound,
      badge: typeof parsed.badge === 'boolean' ? parsed.badge : defaultNotificationPreferences.badge,
    };
  } catch {
    return defaultNotificationPreferences;
  }
}

function saveNotificationPreferences(preferences: NotificationPreferences): void {
  try {
    window.localStorage.setItem(notificationPreferenceKey, JSON.stringify(preferences));
  } catch {
    // Ignore unavailable storage.
  }
  void setNotificationPreferences(preferences).catch((error) => {
    pushToast(error instanceof Error ? error.message : String(error), 'warning');
  });
}

function updateNotificationPreferences(next: Partial<NotificationPreferences>): void {
  state.notificationPreferences = { ...state.notificationPreferences, ...next };
  if (!state.notificationPreferences.badge) state.attentionCount = 0;
  updateBadgeState();
  saveNotificationPreferences(state.notificationPreferences);
  render();
}

function shouldNotifyForStatus(status: ReviewRunSnapshot['status']): boolean {
  const preferences = state.notificationPreferences;
  if (!preferences.enabled) return false;
  if (status === 'completed') return preferences.notifySuccess;
  if (status === 'failed' || status === 'cancelled') return preferences.notifyFailure;
  return false;
}

function playCompletionSound(): void {
  if (!state.notificationPreferences.sound) return;
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const context = new AudioContextCtor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.2);
  window.setTimeout(() => void context.close(), 250);
}

function updateBadgeState(): void {
  const baseTitle = repoSubtitle();
  document.title = state.attentionCount > 0 && state.notificationPreferences.badge
    ? `(${state.attentionCount}) ${baseTitle}`
    : baseTitle;
}

function markReviewAttention(status: ReviewRunSnapshot['status']): void {
  if (!shouldNotifyForStatus(status)) return;
  if (state.notificationPreferences.badge) {
    state.attentionCount = Math.max(1, state.attentionCount + 1);
    updateBadgeState();
  }
  playCompletionSound();
}

function announce(message: string): void {
  ensureAnnouncer().textContent = message
}

function ensureAnnouncer(): HTMLElement {
  const existing = document.getElementById('a11y-announcer');
  if (existing) return existing;
  const announcer = el('div', 'ca-visually-hidden') as HTMLDivElement;
  announcer.id = 'a11y-announcer';
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  appRoot.append(announcer);
  return announcer;
}

function pushToast(message: string, type: Toast['type'] = 'info'): void {
  const id = `toast-${Date.now()}`
  state.toasts.push({ id, message, type, createdAt: Date.now() })
  if (state.toasts.length > 3) state.toasts.shift()
  window.setTimeout(() => removeToast(id), 4000)
  announce(message)
  render()
}

function removeToast(id: string): void {
  const toastEl = document.getElementById(id)
  if (toastEl) {
    toastEl.classList.add('is-exiting')
    window.setTimeout(() => {
      toastEl.remove()
      state.toasts = state.toasts.filter((toast) => toast.id !== id)
      render()
    }, 250)
    return
  }
  state.toasts = state.toasts.filter((toast) => toast.id !== id)
  render()
}

async function refreshSessions(selectFirst = false, forceRefresh = false): Promise<void> {
  state.busy = true;
  render();
  try {
    state.sessions = await listSessions(forceRefresh);
    state.sessionVisibleCount = sessionPageSize;
    if (selectFirst && state.sessions[0]) {
      state.selected = await getSessionDetail(state.sessions[0].id, forceRefresh);
    }
  } catch (error) {
    pushToast(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    state.busy = false;
    render();
  }
}

function sessionCandidatesFromRun(run: ReviewRunSnapshot): string[] {
  const candidates = [run.sessionId, ...run.events.map((event) => event.sessionId)]
    .filter((candidate): candidate is string => Boolean(candidate?.trim()));
  return [...new Set(candidates)];
}

function findSessionForRun(run: ReviewRunSnapshot): SessionSummary | undefined {
  const candidates = sessionCandidatesFromRun(run);
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    const match = state.sessions.find((session) =>
      session.id === normalized ||
      session.sessionId === normalized ||
      session.id.endsWith(`/${normalized}`),
    );
    if (match) return match;
  }
  const latest = latestSession();
  const runStarted = timestampValue(run.startedAt);
  return run.status === 'completed' && latest && timestampValue(latest.updatedAt) >= runStarted
    ? latest
    : undefined;
}

async function openReviewResultFromRun(run: ReviewRunSnapshot, forceRefresh = true): Promise<boolean> {
  if (forceRefresh) {
    state.sessions = await listSessions(true);
    state.sessionVisibleCount = sessionPageSize;
  }
  const match = findSessionForRun(run);
  if (!match) {
    pushToast(t('desktop.notice.reviewResultMissing'), 'warning');
    return false;
  }
  state.selected = await getSessionDetail(match.id, forceRefresh);
  state.attentionCount = 0;
  setView('sessions');
  pushToast(t('desktop.notice.reviewResultReady'), 'success');
  return true;
}

async function loadRepoInfo(): Promise<void> {
  try {
    state.repoInfo = await getRepoInfo();
    state.repoPath = state.repoInfo.path;
    updateBadgeState();
  } catch (error) {
    state.repoPath = '';
    state.repoInfo = undefined;
    pushToast(error instanceof Error ? error.message : String(error), 'error');
  }
  render();
}

async function openRepo(path: string): Promise<void> {
  if (state.configDirty) {
    if (!confirm(t('desktop.confirm.discardUnsavedConfig'))) return;
  }
  state.busy = true;
  state.notice = undefined;
  render();
  try {
    state.repoInfo = await openRepository(path);
    state.repoPath = state.repoInfo.path;
    state.repoInput = state.repoInfo.path;
    rememberRepoPath(state.repoInfo.path);
    state.selected = undefined;
    state.attentionCount = 0;
    state.liveDoctorStatus = undefined;
    state.liveDoctorError = undefined;
    updateBadgeState();
    resetConfigState();
    await refreshSessions(true, true);
    await loadConfig();
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function chooseRepo(currentPath: string): Promise<void> {
  if (state.busy) return;
  try {
    const selected = await selectRepositoryDirectory(t('desktop.action.openRepository'), currentPath || state.repoPath);
    if (!selected) return;
    state.repoInput = selected;
    await openRepo(selected);
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
    render();
  }
}

async function loadLiveDoctorStatus(): Promise<void> {
  if (state.liveDoctorLoading) return;
  state.liveDoctorLoading = true;
  state.liveDoctorError = undefined;
  render();
  try {
    state.liveDoctorStatus = await getLiveDoctorStatus();
  } catch (error) {
    state.liveDoctorStatus = undefined;
    state.liveDoctorError = error instanceof Error ? error.message : String(error);
  } finally {
    state.liveDoctorLoading = false;
    render();
  }
}

async function loadSetup(): Promise<void> {
  state.busy = true;
  render();
  try {
    const [providers, mcp, githubAction, evidence] = await Promise.allSettled([
      getProviderStatus(),
      getMcpStatus(),
      getGitHubActionStatus(),
      getEvidenceStatus(),
    ]);
    state.providers = providers.status === 'fulfilled' ? providers.value : [];
    state.mcpStatus = mcp.status === 'fulfilled' ? mcp.value : undefined;
    state.githubActionStatus = githubAction.status === 'fulfilled' ? githubAction.value : undefined;
    state.evidenceStatus = evidence.status === 'fulfilled' ? evidence.value : undefined;
    for (const result of [providers, mcp, githubAction, evidence]) {
      if (result.status === 'rejected') console.warn(result.reason);
    }
  } catch (error) {
    console.warn(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function selectSession(id: string): Promise<void> {
  state.busy = true;
  render();
  try {
    state.selected = await getSessionDetail(id);
    if (isCompactMobileLayout()) state.activeMobileTab = 'detail';
  } catch (error) {
    pushToast(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    state.busy = false;
    render();
  }
}

async function loadConfig(): Promise<void> {
  state.busy = true;
  render();
  try {
    const config = await readConfig();
    const raw = repoNeedsConfig() && isPlaceholderConfig(config.raw) ? defaultWorkspaceConfigRaw() : config.raw;
    state.configRaw = raw;
    state.configPath = config.path;
    state.configOriginal = raw;
    state.configDirty = false;
    applyDesktopLocale(raw);
    state.configValidation = await validateConfig(raw, config.path);
    if (state.configPath.endsWith('.yml') || state.configPath.endsWith('.yaml')) {
      pushToast(t('desktop.notice.yamlReadOnly'), 'warning');
    }
  } catch (error) {
    pushToast(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    state.busy = false;
    render();
  }
}

async function saveConfig(raw: string): Promise<void> {
  if (state.configPath.endsWith('.yml') || state.configPath.endsWith('.yaml')) {
    pushToast(t('desktop.notice.yamlSaveBlocked'), 'error');
    return;
  }
  state.busy = true;
  render();
  try {
    const validation = await validateConfig(raw, state.configPath);
    state.configValidation = validation;
    if (!validation.valid) {
      pushToast(t('desktop.notice.invalidConfig', { errors: validation.errors.join('; ') }), 'error')
      return;
    }
    const config = await writeConfig(raw);
    state.configRaw = config.raw;
    state.configPath = config.path;
    state.configOriginal = config.raw;
    state.configDirty = false;
    applyDesktopLocale(config.raw);
    state.repoInfo = await getRepoInfo();
    state.repoPath = state.repoInfo.path;
    pushToast(t('desktop.notice.savedConfig', { path: config.path }), 'success')
  } catch (error) {
    pushToast(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    state.busy = false;
    render();
  }
}

async function createWorkspaceConfig(): Promise<void> {
  let raw = state.configRaw;
  if (!raw.trim() || isPlaceholderConfig(raw)) {
    const config = await readConfig();
    raw = isPlaceholderConfig(config.raw) ? defaultWorkspaceConfigRaw() : config.raw;
    state.configPath = config.path;
    state.configRaw = raw;
    state.configOriginal = raw;
  }
  await saveConfig(raw);
}

async function validateConfigEditor(raw: string): Promise<void> {
  state.configRaw = raw;
  state.busy = true;
  render();
  try {
    applyDesktopLocale(raw);
    state.configValidation = await validateConfig(raw, state.configPath);
    if (state.configValidation.valid) {
      pushToast(t('desktop.notice.configValidates'), 'success')
    } else {
      pushToast(t('desktop.notice.configErrors'), 'error')
    }
  } catch (error) {
    pushToast(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    state.busy = false;
    render();
  }
}

async function startReview(staged: boolean): Promise<void> {
  if (state.busy) return;
  const readiness = runReadiness();
  if (!readiness.ready) {
    state.notice = readiness.reasons[0] ?? t('desktop.readiness.blockedBody');
    render();
    return;
  }
  if (state.activeRun && isReviewRunning(state.activeRun)) {
    state.notice = t('desktop.notice.reviewAlreadyRunning', { runId: state.activeRun.runId });
    render();
    return;
  }
  state.busy = true;
  pushToast(staged ? t('desktop.notice.startingStaged') : t('desktop.notice.startingWorkingTree'), 'success')
  render();
  try {
    pollRetryCount = 0;
    state.activeRun = await startReviewRun(staged);
    if (isCompactMobileLayout()) state.runMobileStep = 3;
    pushToast(state.activeRun.message, 'success')
    scheduleReviewPoll();
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    render();
  }
}

function isReviewRunning(run: ReviewRunSnapshot): boolean {
  return run.status === 'running' || run.status === 'cancelling';
}

function reviewProgress(events: ReviewRunEvent[]): { stage: string; percent: number } {
  for (const event of [...events].reverse()) {
    if (event.schemaVersion === 'codeagora.review.v1' && event.type === 'progress' && typeof event.progress === 'number') {
      const label = event.stage ? reviewStageLabel(event.stage) : 'Review';
      return { stage: label, percent: Math.max(0, Math.min(100, Math.round(event.progress))) };
    }
  }

  const kinds = events.map((e) => e.kind);
  if (kinds.includes('completed')) return { stage: t('desktop.run.stageVerdict'), percent: 100 };
  if (kinds.includes('pipeline-complete')) return { stage: t('desktop.run.stageComplete'), percent: 100 };
  if (kinds.includes('stage-complete')) return { stage: t('desktop.run.stageReview'), percent: 100 };
  if (kinds.includes('l3')) return { stage: t('desktop.run.stageVerdict'), percent: 90 };
  if (kinds.includes('l2')) return { stage: t('desktop.run.stageDiscuss'), percent: 70 };
  if (kinds.includes('l1')) return { stage: t('desktop.run.stageReview'), percent: 40 };
  if (kinds.includes('l0')) return { stage: t('desktop.run.stagePrepare'), percent: 20 };
  if (kinds.includes('started')) return { stage: t('desktop.run.stagePrepare'), percent: 10 };
  return { stage: t('desktop.run.stageStarting'), percent: 0 };
}

function reviewStageLabel(stage: string): string {
  switch (stage) {
    case 'init':
      return t('desktop.run.stageStarting');
    case 'review':
      return t('desktop.run.stageReview');
    case 'discuss':
      return t('desktop.run.stageDiscuss');
    case 'verdict':
      return t('desktop.run.stageVerdict');
    case 'complete':
      return t('desktop.run.stageComplete');
    default:
      return t('desktop.value.unknown');
  }
}

function plainRunStatus(status: string): string {
  if (status === 'running') return t('desktop.run.statusRunning');
  if (status === 'completed') return t('desktop.run.statusCompleted');
  if (status === 'failed') return t('desktop.run.statusFailed');
  if (status === 'cancelled') return t('desktop.run.statusCancelled');
  if (status === 'cancelling') return t('desktop.run.statusCancelling');
  return status;
}

function reviewEventKindLabel(kind: string): string {
  if (kind === 'started') return t('desktop.run.eventStarted');
  if (kind === 'completed' || kind === 'pipeline-complete') return t('desktop.run.eventCompleted');
  if (kind === 'failed') return t('desktop.run.eventFailed');
  if (kind === 'stage-complete') return t('desktop.run.eventStageComplete');
  if (kind === 'l0') return t('desktop.run.stagePrepare');
  if (kind === 'l1') return t('desktop.run.stageReview');
  if (kind === 'l2') return t('desktop.run.stageDiscuss');
  if (kind === 'l3') return t('desktop.run.stageVerdict');
  return kind;
}

function scheduleReviewPoll(): void {
  if (!state.activeRun || !isReviewRunning(state.activeRun)) return;
  window.clearTimeout(reviewPollHandle);
  reviewPollHandle = window.setTimeout(() => void pollReviewRun(state.activeRun!.runId), 700);
}

async function pollReviewRun(runId: string): Promise<void> {
  if (pollInFlight) return;
  pollInFlight = true;
  window.clearTimeout(reviewPollHandle);
  try {
    const snapshot = await getReviewRun(runId);
    pollRetryCount = 0;
    state.activeRun = snapshot;
    const terminal = ['completed', 'failed', 'cancelled'];
    if (!terminal.includes(snapshot.status)) {
      reviewPollHandle = window.setTimeout(() => pollReviewRun(runId), 2000);
    } else {
      if (snapshot.status === 'completed') {
        const opened = await openReviewResultFromRun(snapshot);
        if (!opened) markReviewAttention(snapshot.status);
      } else {
        markReviewAttention(snapshot.status);
      }
    }
  } catch (error) {
    pollRetryCount++;
    if (pollRetryCount <= maxPollRetries) {
      const backoff = Math.min(1000 * Math.pow(2, pollRetryCount - 1), 8000);
      reviewPollHandle = window.setTimeout(() => pollReviewRun(runId), backoff);
    } else {
      pushToast(error instanceof Error ? error.message : String(error), 'error');
    }
  } finally {
    pollInFlight = false;
    render();
  }
}

async function cancelActiveReview(): Promise<void> {
  const runId = state.activeRun?.runId;
  if (!runId) return;
  if (!confirm(t('desktop.confirm.cancelReview'))) return;
  state.busy = true;
  render();
  try {
    pollRetryCount = 0;
    state.activeRun = await cancelReviewRun(runId);
    pushToast(state.activeRun.message, 'success')
    scheduleReviewPoll();
  } catch (error) {
    pushToast(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    state.busy = false;
    render();
  }
}

async function exportSelected(format: 'markdown' | 'json' | 'sarif'): Promise<void> {
  const id = state.selected?.id;
  if (!id) return;
  state.busy = true;
  render();
  try {
    const output = await exportSession(id, format);
    await window.navigator.clipboard?.writeText(output.content);
    pushToast(t('desktop.notice.copiedExport', { fileName: output.fileName }), 'success')
  } catch (error) {
    pushToast(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    state.busy = false;
    render();
  }
}

function renderShell(): HTMLElement {
  const shell = el('div', 'ca-shell');
  shell.dataset.testid = 'desktop-shell';
  const sidebar = el('aside', 'ca-sidebar');
  const brand = el('div', 'ca-brand');
  const brandMark = el('img', 'ca-brand-mark') as HTMLImageElement;
  brandMark.alt = '';
  brandMark.src = logoDataUri;
  brandMark.width = 42;
  brandMark.height = 42;
  brand.append(brandMark);
  const brandText = el('div');
  brandText.append(el('strong', '', 'CodeAgora'));
  brandText.append(el('span', '', t('desktop.brand.surface')));
  brand.append(brandText);
  sidebar.append(brand);

  const nav = el('nav', 'ca-nav');
  const navItems: Array<[View, string, string]> = [
    ['sessions', t('desktop.nav.cockpit'), 'button-sessions'],
    ['run', t('desktop.nav.runReview'), 'button-run-review'],
    ['config', t('desktop.nav.config'), 'button-config'],
    ['setup', t('desktop.nav.setup'), 'button-setup'],
  ];
  for (const [view, label, testId] of navItems) {
    const navButton = button(label, () => {
      setView(view);
      if (view === 'config' && !state.configRaw) void loadConfig();
      if (view === 'setup' && state.providers.length === 0) void loadSetup();
    }, state.view === view ? 'ca-nav-button ca-active' : 'ca-nav-button', testId);
    nav.append(navButton);
  }
  sidebar.append(nav);
  shell.append(sidebar);

  const main = el('main', 'ca-main');
  main.append(renderToolbar());
  main.append(renderContent());
  shell.append(main);
  return shell;
}

function renderToolbar(): HTMLElement {
  if (preferencesMenuCleanup) {
    preferencesMenuCleanup();
    preferencesMenuCleanup = undefined;
  }
  const toolbar = el('header', 'ca-toolbar');
  ensureFavicon();
  const title = el('div', 'ca-toolbar-title');
  title.append(el('h1', '', viewTitle()));
  title.append(el('p', 'ca-repo-subtitle', repoSubtitle()));
  toolbar.append(title);

  const actions = el('div', 'ca-toolbar-actions');
  const preferences = el('div', 'ca-toolbar-preferences');

  const localeControl = el('label', 'ca-toolbar-select') as HTMLLabelElement;
  localeControl.append(el('span', 'ca-toolbar-select-label', t('desktop.preferences.language')));
  const localeSelect = el('select', 'ca-toolbar-select-input') as HTMLSelectElement;
  localeSelect.dataset.testid = 'locale-select';
  localeSelect.setAttribute('aria-label', t('desktop.preferences.language'));
  for (const [value, key] of [
    ['auto', 'desktop.preferences.locale.auto'],
    ['en', 'desktop.preferences.locale.en'],
    ['ko', 'desktop.preferences.locale.ko'],
  ] as const) {
    const option = el('option') as HTMLOptionElement;
    option.value = value;
    option.textContent = t(key);
    option.selected = state.localePreference === value;
    localeSelect.append(option);
  }
  localeSelect.disabled = state.busy;
  localeSelect.addEventListener('change', () => {
    const next = localeSelect.value;
    state.localePreference = next === 'en' || next === 'ko' ? next : 'auto';
    saveLocalePreference(state.localePreference);
    applyDesktopLocale();
    render();
  });
  localeControl.append(localeSelect);

  const themeControl = el('label', 'ca-toolbar-select') as HTMLLabelElement;
  themeControl.append(el('span', 'ca-toolbar-select-label', t('desktop.preferences.theme')));
  const themeSelect = el('select', 'ca-toolbar-select-input') as HTMLSelectElement;
  themeSelect.dataset.testid = 'theme-select';
  themeSelect.setAttribute('aria-label', t('desktop.preferences.theme'));
  for (const [value, key] of [
    ['system', 'desktop.preferences.theme.system'],
    ['light', 'desktop.preferences.theme.light'],
    ['dark', 'desktop.preferences.theme.dark'],
  ] as const) {
    const option = el('option') as HTMLOptionElement;
    option.value = value;
    option.textContent = t(key);
    option.selected = state.themePreference === value;
    themeSelect.append(option);
  }
  themeSelect.disabled = state.busy;
  themeSelect.addEventListener('change', () => {
    const next = themeSelect.value;
    state.themePreference = next === 'light' || next === 'dark' ? next : 'system';
    saveThemePreference(state.themePreference);
    applyDesktopTheme();
    render();
  });
  themeControl.append(themeSelect);

  const notificationControl = el('label', 'ca-toolbar-select') as HTMLLabelElement;
  notificationControl.append(el('span', 'ca-toolbar-select-label', t('desktop.preferences.notifications')));
  const notificationSelect = el('select', 'ca-toolbar-select-input') as HTMLSelectElement;
  notificationSelect.dataset.testid = 'notification-select';
  notificationSelect.setAttribute('aria-label', t('desktop.preferences.notifications'));
  const notificationValue = !state.notificationPreferences.enabled
    ? 'off'
    : state.notificationPreferences.notifySuccess && state.notificationPreferences.notifyFailure
      ? 'all'
      : state.notificationPreferences.notifyFailure
        ? 'failures'
        : 'off';
  for (const [value, key] of [
    ['failures', 'desktop.preferences.notifications.failures'],
    ['all', 'desktop.preferences.notifications.all'],
    ['off', 'desktop.preferences.notifications.off'],
  ] as const) {
    const option = el('option', '', t(key)) as HTMLOptionElement;
    option.value = value;
    option.selected = notificationValue === value;
    notificationSelect.append(option);
  }
  notificationSelect.disabled = state.busy;
  notificationSelect.addEventListener('change', () => {
    const next = notificationSelect.value;
    updateNotificationPreferences({
      enabled: next !== 'off',
      notifySuccess: next === 'all',
      notifyFailure: next === 'all' || next === 'failures',
    });
  });
  notificationControl.append(notificationSelect);

  const soundControl = checkboxControl(
    t('desktop.preferences.sound'),
    state.notificationPreferences.sound,
    (checked) => updateNotificationPreferences({ sound: checked }),
    'notification-sound-checkbox',
  );
  const badgeControl = checkboxControl(
    t('desktop.preferences.badge'),
    state.notificationPreferences.badge,
    (checked) => updateNotificationPreferences({ badge: checked }),
    'notification-badge-checkbox',
  );

  preferences.append(localeControl, themeControl, notificationControl, soundControl, badgeControl);
  const preferenceMenu = el('details', 'ca-preferences-menu') as HTMLDetailsElement;
  const preferenceSummary = el('summary', 'ca-button', t('desktop.preferences.display'));
  preferenceSummary.setAttribute('role', 'button');
  preferenceSummary.setAttribute('aria-label', t('desktop.preferences.display'));
  preferenceMenu.append(preferenceSummary);
  preferenceMenu.append(preferences);
  actions.append(preferenceMenu);
  const teardownPreferenceMenu = (): void => {
    document.removeEventListener('click', onOutsideClick, true);
    document.removeEventListener('keydown', onEscapeKey, true);
  };
  const closePreferenceMenu = (): void => {
    if (!preferenceMenu.open) return;
    preferenceMenu.open = false;
    teardownPreferenceMenu();
  };
  const onOutsideClick = (event: MouseEvent): void => {
    if (!preferenceMenu.open) return;
    const target = event.target as Node | null;
    if (target && preferenceMenu.contains(target)) return;
    closePreferenceMenu();
  };
  const onEscapeKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !preferenceMenu.open) return;
    closePreferenceMenu();
  };
  preferenceMenu.addEventListener('toggle', () => {
    if (preferenceMenu.open) {
      document.addEventListener('click', onOutsideClick, true);
      document.addEventListener('keydown', onEscapeKey, true);
    } else {
      teardownPreferenceMenu();
    }
  });
  preferencesMenuCleanup = teardownPreferenceMenu;

  actions.append(button(t('desktop.action.refresh'), () => void refreshSessions(state.view === 'sessions' && !state.selected, true), 'ca-button', 'button-refresh'));
  const quickReview = button(t('desktop.action.quickReview'), () => void startReview(true), 'ca-button ca-primary', 'button-quick-review');
  const readiness = runReadiness();
  quickReview.disabled = state.busy || !readiness.ready;
  if (!readiness.ready) {
    const reason = readinessBlockedReason(readiness);
    quickReview.title = reason;
    quickReview.setAttribute('aria-label', t('desktop.a11y.quickReviewBlocked', { reason }));
  }
  actions.append(quickReview);
  toolbar.append(actions);
  return toolbar;
}

function ensureFavicon(): void {
  const existing = document.querySelector<HTMLLinkElement>('link[data-codeagora-favicon="true"]');
  if (existing) {
    existing.href = logoDataUri;
    return;
  }
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.type = 'image/svg+xml';
  icon.href = logoDataUri;
  icon.dataset.codeagoraFavicon = 'true';
  document.head.appendChild(icon);
}

function viewTitle(): string {
  if (state.view === 'sessions') return t('desktop.title.cockpit');
  if (state.view === 'run') return t('desktop.title.launch');
  if (state.view === 'config') return t('desktop.title.config');
  return t('desktop.title.setup');
}

function repoSubtitle(): string {
  const repo = state.repoInfo;
  if (!repo) return state.repoPath ? shortRepoLabel(state.repoPath) : t('desktop.repo.loading');
  const branch = repo.branch ? ` · ${repo.branch}` : '';
  const head = repo.headSha ? ` @ ${repo.headSha.slice(0, 10)}` : '';
  return `${shortRepoLabel(repo.path)}${branch}${head}`;
}

function shortRepoLabel(repoPath: string): string {
  const normalized = repoPath.replace(/[/\\]+$/, '');
  const parts = normalized.split(/[/\\]/).filter(Boolean);
  return parts.at(-1) || repoPath;
}

function renderSkeleton(view: View): HTMLElement {
  const shell = el('div', 'ca-skeleton-shell');
  if (view === 'sessions') {
    const sidebar = el('div', 'ca-skeleton-sidebar');
    sidebar.append(el('div', 'ca-skeleton ca-skeleton-title'));
    sidebar.append(el('div', 'ca-skeleton ca-skeleton-text'));
    sidebar.append(el('div', 'ca-skeleton-sidebar-nav'));
    sidebar.append(el('div', 'ca-skeleton ca-skeleton-nav-item'));
    sidebar.append(el('div', 'ca-skeleton ca-skeleton-nav-item'));
    sidebar.append(el('div', 'ca-skeleton ca-skeleton-nav-item'));
    sidebar.append(el('div', 'ca-skeleton ca-skeleton-nav-item'));
    shell.append(sidebar);
    const main = el('div', 'ca-skeleton-main');
    main.append(el('div', 'ca-skeleton ca-skeleton-title'));
    main.append(el('div', 'ca-skeleton ca-skeleton-text'));
    main.append(el('div', 'ca-skeleton-grid'));
    main.append(el('div', 'ca-skeleton ca-skeleton-cell'));
    main.append(el('div', 'ca-skeleton ca-skeleton-cell'));
    shell.append(main);
  } else {
    const main = el('div', 'ca-skeleton-main');
    main.append(el('div', 'ca-skeleton ca-skeleton-title'));
    main.append(el('div', 'ca-skeleton ca-skeleton-text'));
    main.append(el('div', 'ca-skeleton ca-skeleton-card'));
    main.append(el('div', 'ca-skeleton ca-skeleton-card'));
    main.append(el('div', 'ca-skeleton ca-skeleton-card'));
    shell.append(main);
  }
  return shell;
}

function renderContent(): HTMLElement {
  const content = el('section', 'ca-content');
  content.dataset.testid = `view-${state.view}`;
  if (state.notice) {
    const notice = el('div', 'ca-notice', state.notice);
    notice.append(button(t('desktop.action.dismiss'), () => {
      state.notice = undefined;
      render();
    }, 'ca-ghost', 'button-dismiss'));
    content.append(notice);
  }
  if (state.busy) content.append(renderSkeleton(state.view));
  else {
    if (state.view === 'sessions') content.append(renderSessions());
    if (state.view === 'run') content.append(renderRunReview());
    if (state.view === 'config') content.append(renderConfig());
    if (state.view === 'setup') content.append(renderSetup());
  }
  return content;
}

function renderSessions(): HTMLElement {
  const wrapper = el('div', 'ca-cockpit-page');
  wrapper.append(renderCockpitOverview());

  const mobile = isCompactMobileLayout();
  if (mobile) wrapper.append(renderSessionMobileTabs());

  const layout = el('div', 'ca-sessions-layout');
  layout.dataset.testid = 'sessions-layout';
  const listPanel = el('div', 'ca-session-list');
  const listHeader = el('div', 'ca-panel-heading');
  listHeader.append(el('span', 'ca-eyebrow', t('desktop.sessions.historyEyebrow')));
  listHeader.append(el('h2', '', t('desktop.sessions.recentTitle')));
  listPanel.append(listHeader);

  const controls = el('div', 'ca-session-controls');
  const search = el('input', 'ca-filter-input') as HTMLInputElement;
  search.dataset.testid = 'session-filter-input';
  search.type = 'search';
  search.placeholder = t('desktop.sessions.filterPlaceholder');
  search.setAttribute('aria-label', t('desktop.sessions.filterAria'));
  search.value = state.sessionSearch;
  let searchDebounce: number | undefined;
  search.addEventListener('input', () => {
    window.clearTimeout(searchDebounce);
    searchDebounce = window.setTimeout(() => {
      state.sessionSearch = search.value;
      state.sessionVisibleCount = sessionPageSize;
      render();
    }, 150);
  });
  if (state.sessionSearch) {
    const clearBtn = button('×', () => {
      state.sessionSearch = '';
      state.sessionVisibleCount = sessionPageSize;
      render();
    }, 'ca-button ca-button-ghost', 'button-clear-search');
    clearBtn.style.fontSize = '18px';
    clearBtn.style.lineHeight = '1';
    controls.append(clearBtn);
  }
  const status = el('select', 'ca-filter-select') as HTMLSelectElement;
  status.dataset.testid = 'session-status-filter';
  status.setAttribute('aria-label', t('desktop.sessions.statusFilterAria'));
  for (const option of ['all', 'completed', 'failed', 'interrupted', 'in_progress', 'unknown'] as const) {
    const node = el('option') as HTMLOptionElement;
    node.value = option;
    node.textContent = option === 'all' ? t('desktop.sessions.allStatuses') : plainSessionStatus(option);
    node.selected = state.sessionStatus === option;
    status.append(node);
  }
  status.addEventListener('change', () => {
    state.sessionStatus = status.value as AppState['sessionStatus'];
    state.sessionVisibleCount = sessionPageSize;
    render();
  });
  const sortSelect = el('select', 'ca-filter-select') as HTMLSelectElement;
  sortSelect.dataset.testid = 'session-sort-select';
  const sortOptions = [
    { value: 'date-desc', label: t('desktop.sessions.sortDateDesc') },
    { value: 'date-asc', label: t('desktop.sessions.sortDateAsc') },
    { value: 'decision', label: t('desktop.sessions.sortDecision') },
    { value: 'severity', label: t('desktop.sessions.sortSeverity') },
  ];
  for (const option of sortOptions) {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    if (state.sessionSort === option.value) opt.selected = true;
    sortSelect.append(opt);
  }
  sortSelect.addEventListener('change', () => {
    state.sessionSort = sortSelect.value as AppState['sessionSort'];
    state.sessionVisibleCount = sessionPageSize;
    render();
  });
  controls.append(search, status, sortSelect);
  listPanel.append(controls);

  const sessions = filteredSessions();
  const visibleSessions = sessions.slice(0, state.sessionVisibleCount);
  const summary = el('div', 'ca-list-summary', t('desktop.sessions.visibleSummary', { visible: visibleSessions.length, total: sessions.length }));
  listPanel.append(summary);
  if (state.sessions.length === 0) {
    const empty = el('div', 'ca-empty-state ca-padded');
    empty.append(el('strong', '', t('desktop.sessions.emptyTitle')));
    empty.append(el('p', '', t('desktop.sessions.emptyBody')));
    empty.append(button(t('desktop.action.startReview'), () => setView('run'), 'ca-button ca-primary', 'button-start-review'));
    listPanel.append(empty);
  } else if (sessions.length === 0) {
    listPanel.append(el('p', 'ca-empty ca-padded', t('desktop.sessions.noFilterMatch')));
  }
  for (const session of visibleSessions) {
    const item = button('', () => {
      if (state.selected?.id === session.id) {
        state.selected = undefined;
        state.activeMobileTab = 'history';
        render();
      } else {
        void selectSession(session.id);
      }
    }, state.selected?.id === session.id ? 'ca-session-row is-selected' : 'ca-session-row');
    item.dataset.testid = `session-row-${session.id.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
    const top = el('div', 'ca-session-row-top');
    top.append(el('strong', '', sessionDisplayTitle(session)));
    top.append(el('span', decisionClass(session.decision), plainDecision(session.decision, plainSessionStatus(session.status))));
    item.append(top);
    item.append(el('span', 'ca-session-meta', t('desktop.sessions.rowMeta', { blockers: blockerCount(session), findings: severityTotal(session), updated: formatTimestamp(session.updatedAt) })));
    item.append(el('span', 'ca-session-meta ca-session-id-inline', t('desktop.sessions.rowId', { id: session.id })));
    listPanel.append(item);
  }
  if (visibleSessions.length < sessions.length) {
    const pagination = el('div', 'ca-session-pagination');
    pagination.append(el('span', '', t('desktop.sessions.paginationSummary', { visible: visibleSessions.length, total: sessions.length })));
    pagination.append(button(t('desktop.action.showMore'), () => {
      state.sessionVisibleCount += sessionPageSize;
      render();
    }, 'ca-button ca-button-ghost', 'button-show-more-sessions'));
    listPanel.append(pagination);
  }
  if (mobile) {
    if (state.activeMobileTab === 'detail') {
      layout.append(renderSessionDetail());
    } else {
      layout.append(listPanel);
    }
  } else {
    layout.append(listPanel);
    layout.append(renderSessionDetail());
  }
  wrapper.append(layout);
  return wrapper;
}

function renderSessionMobileTabs(): HTMLElement {
  const tabs = el('div', 'ca-mobile-tabs');
  tabs.dataset.testid = 'session-mobile-tabs';
  tabs.setAttribute('role', 'tablist');

  const historyTab = button(t('desktop.sessions.mobileHistoryTab'), () => {
    state.activeMobileTab = 'history';
    render();
  }, state.activeMobileTab === 'history' ? 'ca-button ca-primary ca-mobile-tab is-active' : 'ca-button ca-button-ghost ca-mobile-tab', 'button-session-history-tab');
  historyTab.setAttribute('role', 'tab');
  historyTab.setAttribute('aria-selected', String(state.activeMobileTab === 'history'));

  const detailTab = button(t('desktop.sessions.mobileDetailTab'), () => {
    if (!state.selected) return;
    state.activeMobileTab = 'detail';
    render();
  }, state.activeMobileTab === 'detail' ? 'ca-button ca-primary ca-mobile-tab is-active' : 'ca-button ca-button-ghost ca-mobile-tab', 'button-session-detail-tab');
  detailTab.setAttribute('role', 'tab');
  detailTab.setAttribute('aria-selected', String(state.activeMobileTab === 'detail'));
  detailTab.disabled = detailTab.disabled || !state.selected;
  if (!state.selected) detailTab.title = t('desktop.sessions.mobileDetailHint');

  tabs.append(historyTab, detailTab);
  return tabs;
}

function renderCockpitOverview(): HTMLElement {
  const section = el('section', 'ca-cockpit-overview');
  section.dataset.testid = 'cockpit-overview';
  const latest = latestSession();
  const repo = state.repoInfo;
  const readiness = runReadiness();
  const status = cockpitStatus(latest, readiness);
  const hero = el('div', 'ca-cockpit-hero');
  const labelRow = el('div', 'ca-status-label-row');
  labelRow.append(el('span', 'ca-eyebrow', t('desktop.cockpit.eyebrow')));
  labelRow.append(el('span', `ca-status-label ca-${status.tone}`, status.label));
  hero.append(labelRow);
  hero.append(el('h2', '', status.title));
  hero.append(el('p', '', status.body));
  const actions = el('div', 'ca-cockpit-actions');
  actions.append(button(status.primaryLabel, () => setView(status.primaryView), 'ca-button ca-primary', 'button-cockpit-primary-action'));
  actions.append(button(status.secondaryLabel, () => {
    setView(status.secondaryView);
    if (status.secondaryView === 'setup' && state.providers.length === 0) void loadSetup();
    if (status.secondaryView === 'config' && !state.configRaw) void loadConfig();
  }, 'ca-button', 'button-cockpit-secondary-action'));
  hero.append(actions);
  section.append(hero);

  const actionPanel = el('div', `ca-decision-panel ca-${status.tone}`);
  actionPanel.dataset.testid = 'cockpit-decision-panel';
  actionPanel.append(el('span', 'ca-eyebrow', t('desktop.cockpit.nextActionEyebrow')));
  actionPanel.append(el('strong', '', status.primaryLabel));
  actionPanel.append(el('p', '', t('desktop.cockpit.nextActionBody')));
  const flow = el('div', 'ca-review-flow');
  const flowItems = [
    [t('desktop.flow.workspace'), repo?.trusted ? t('desktop.value.ready') : t('desktop.value.needsFixes'), repo?.trusted ? 'good' : 'warn'],
    [t('desktop.flow.review'), latest ? plainDecision(latest.decision, plainSessionStatus(latest.status)) : t('desktop.value.notStarted'), latest ? status.tone : 'info'],
    [t('desktop.flow.acceptance'), latest?.decision === 'ACCEPT' ? t('desktop.value.ready') : t('desktop.value.pending'), latest?.decision === 'ACCEPT' ? 'good' : 'warn'],
  ] as const;
  for (const [label, value, tone] of flowItems) {
    const step = el('div', `ca-flow-step ca-${tone}`);
    step.append(el('span', '', label));
    step.append(el('strong', '', value));
    flow.append(step);
  }
  actionPanel.append(flow);
  section.append(actionPanel);

  const metrics = el('div', 'ca-cockpit-metrics');
  appendMetric(metrics, t('desktop.metric.workspace'), repo?.trusted ? t('desktop.value.trusted') : t('desktop.value.needsTrust'), repo?.trusted ? 'ca-good' : 'ca-warn');
  appendMetric(metrics, t('desktop.metric.branch'), repo?.branch || t('desktop.value.unknown'));
  appendMetric(metrics, t('desktop.metric.dirtyFiles'), repo ? String(repo.dirtyFileCount) : '...');
  appendMetric(metrics, t('desktop.metric.sessions'), String(state.sessions.length));
  appendMetric(metrics, t('desktop.metric.currentBlockers'), latest ? String(blockerCount(latest)) : '0', latest && blockerCount(latest) > 0 ? 'ca-danger' : 'ca-good');
  appendMetric(metrics, t('desktop.metric.latestUpdated'), latest ? formatTimestamp(latest.updatedAt) : t('desktop.value.noSessions'));
  section.append(metrics);

  const links = el('div', 'ca-quick-links');
  links.append(button(t('desktop.action.refreshEvidence'), () => void refreshSessions(true, true), 'ca-button', 'button-refresh-evidence'));
  links.append(button(t('desktop.nav.config'), () => {
    setView('config');
    if (!state.configRaw) void loadConfig();
  }, 'ca-button', 'button-cockpit-config'));
  links.append(button(t('desktop.nav.setup'), () => {
    setView('setup');
    if (state.providers.length === 0) void loadSetup();
  }, 'ca-button', 'button-cockpit-setup'));
  section.append(links);
  return section;
}

function formatTimestamp(value?: string): string {
  if (!value) return t('desktop.value.noTimestamp');
  const normalized = /^\d+$/.test(value)
    ? new Date(Number(value.length <= 10 ? `${value}000` : value))
    : new Date(value);
  const date = normalized;
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function decisionSummaryText(selected: SessionDetail): string {
  const lines = [
    t('desktop.detail.decisionSummaryTitle'),
    '',
    `- Session: ${selected.id}`,
    `- Verdict: ${plainDecision(selected.decision, plainSessionStatus(selected.status))}`,
    `- Blockers: ${blockerCount(selected)}`,
    `- Findings: ${severityTotal(selected)}`,
    `- Updated: ${formatTimestamp(selected.updatedAt)}`,
    '',
    selected.reasoning ?? t('desktop.detail.noReasoning'),
  ];
  return `${lines.join('\n')}\n`;
}

async function copyDecisionSummary(selected: SessionDetail): Promise<void> {
  try {
    await navigator.clipboard.writeText(decisionSummaryText(selected));
    pushToast(t('desktop.toast.copied'), 'success');
  } catch {
    pushToast(t('desktop.toast.copyFailed'), 'error');
  }
}

function renderSessionDetail(): HTMLElement {
  const detail = el('article', 'ca-detail ca-insight-panel');
  detail.dataset.testid = 'session-detail';
  const selected = state.selected;
  if (!selected) {
    const empty = el('div', 'ca-empty-state');
    empty.append(el('span', 'ca-eyebrow', t('desktop.detail.eyebrow')));
    empty.append(el('h2', '', t('desktop.detail.emptyTitle')));
    empty.append(el('p', '', t('desktop.detail.emptyBody')));
    if (isCompactMobileLayout()) {
      empty.append(button(t('desktop.sessions.mobileBackToHistory'), () => {
        state.activeMobileTab = 'history';
        render();
      }, 'ca-button ca-subtle', 'button-session-back-to-history-empty'));
    }
    detail.append(empty);
    return detail;
  }

  if (isCompactMobileLayout()) {
    const mobileHeader = el('div', 'ca-mobile-detail-head');
    mobileHeader.append(el('span', 'ca-eyebrow', t('desktop.sessions.mobileDetailEyebrow')));
    mobileHeader.append(button(t('desktop.sessions.mobileBackToHistory'), () => {
      state.activeMobileTab = 'history';
      render();
    }, 'ca-button ca-button-ghost', 'button-session-back-to-history'));
    detail.append(mobileHeader);
  }

  const banner = el('div', `ca-verdict-banner ${selected.decision === 'REJECT' ? 'ca-danger' : selected.decision === 'ACCEPT' ? 'ca-good' : 'ca-warn'}`);
  const bannerText = el('div');
  bannerText.append(el('span', 'ca-eyebrow', t('desktop.detail.finalVerdict')));
  bannerText.append(el('h2', '', plainDecision(selected.decision, plainSessionStatus(selected.status))));
  bannerText.append(el('p', '', selected.reasoning ?? t('desktop.detail.noReasoning')));
  banner.append(bannerText);
  banner.append(el('span', decisionClass(selected.decision), plainDecision(selected.decision, plainSessionStatus(selected.status))));
  detail.append(banner);
  detail.append(renderAcceptancePanel(selected));

  const detailHeader = el('div', 'ca-detail-header');
  const idRow = el('div', 'ca-session-id-row');
  idRow.append(el('span', 'ca-session-id', selected.id));
  const copyBtn = button(t('desktop.action.copy'), async () => {
    try {
      await navigator.clipboard.writeText(selected.id);
      pushToast(t('desktop.toast.copied'), 'success');
    } catch {
      pushToast(t('desktop.toast.copyFailed'), 'error');
    }
  }, 'ca-button ca-button-ghost', 'button-copy-session-id');
  idRow.append(copyBtn);
  detailHeader.append(idRow);

  const filtered = filteredSessions();
  const currentIndex = filtered.findIndex((s) => s.id === selected.id);
  if (currentIndex > 0) {
    const prevBtn = button(t('desktop.action.previous'), () => void selectSession(filtered[currentIndex - 1].id), 'ca-button ca-button-ghost', 'button-prev-session');
    detailHeader.append(prevBtn);
  }
  if (currentIndex >= 0 && currentIndex < filtered.length - 1) {
    const nextBtn = button(t('desktop.action.next'), () => void selectSession(filtered[currentIndex + 1].id), 'ca-button ca-button-ghost', 'button-next-session');
    detailHeader.append(nextBtn);
  }
  detail.append(detailHeader);

  const meta = el('div', 'ca-detail-meta');
  meta.append(el('span', '', selected.dirPath ?? '.ca/sessions'));
  meta.append(el('span', '', t('desktop.detail.updated', { updated: formatTimestamp(selected.updatedAt) })));
  meta.append(el('span', '', t('desktop.detail.evidenceDocs', { count: selected.evidenceCount ?? 0 })));
  meta.append(el('span', '', t('desktop.detail.discussionFiles', { count: selected.discussionsCount ?? 0 })));
  detail.append(meta);

  const counts = selected.severityCounts ?? {};
  const countGrid = el('div', 'ca-count-grid');
  for (const key of ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION'] as const) {
    const cell = el('div', key === 'HARSHLY_CRITICAL' || key === 'CRITICAL' ? 'ca-count-cell ca-danger' : 'ca-count-cell');
    cell.append(el('span', '', severityLabel(key)));
    cell.append(el('strong', '', String(counts[key] ?? 0)));
    countGrid.append(cell);
  }
  detail.append(countGrid);

  const evidence = el('section', 'ca-evidence-board');
  evidence.append(el('h3', '', t('desktop.detail.consensusEvidence')));
  const evidenceGrid = el('div', 'ca-evidence-grid');
  appendMetric(evidenceGrid, t('desktop.detail.evidenceDocsLabel'), String(selected.evidenceCount ?? 0));
  appendMetric(evidenceGrid, t('desktop.detail.debateFilesLabel'), String(selected.discussionsCount ?? 0));
  appendMetric(evidenceGrid, t('desktop.detail.exportFormats'), 'Markdown · JSON · SARIF');
  appendMetric(evidenceGrid, t('desktop.detail.costLabel'), selected.costSummary?.known ? selected.costSummary.formattedTotalCost : t('desktop.detail.costUnknown'));
  appendMetric(evidenceGrid, t('desktop.detail.callsLabel'), String(selected.costSummary?.callCount ?? 0));
  appendMetric(evidenceGrid, t('desktop.detail.tokensLabel'), selected.costSummary?.totalTokens !== undefined ? String(selected.costSummary.totalTokens) : t('desktop.value.unknown'));
  evidence.append(evidenceGrid);
  detail.append(evidence);

  if (sessionHasDegradedSignal(selected)) {
    const degraded = el('section', 'ca-degraded-signal');
    degraded.dataset.testid = 'session-degraded-signal';
    degraded.append(el('h3', '', t('desktop.degraded.title')));
    degraded.append(el('p', '', t('desktop.degraded.sessionBody')));
    if (selected.degradedReasons && selected.degradedReasons.length > 0) {
      const reasons = el('ul', 'ca-degraded-reasons');
      for (const reason of selected.degradedReasons) {
        reasons.append(el('li', '', reason));
      }
      degraded.append(reasons);
    }
    detail.append(degraded);
  }

  const issues = el('div', 'ca-issues');
  const findings = selected.findings?.length ? selected.findings : selected.topIssues ?? [];
  issues.append(el('h3', '', t('desktop.detail.findingsToTriage', { count: findings.length })));
  if (findings.length === 0) {
    issues.append(el('p', 'ca-empty', t('desktop.detail.noFindings')));
  } else {
    for (const issue of findings) {
      const row = el('div', 'ca-issue-row ca-issue-card');
      const confidence = issue.confidence === undefined ? t('desktop.detail.confidenceUnavailable') : t('desktop.detail.confidencePercent', { confidence: Math.round(issue.confidence) });
      row.append(el('span', 'ca-issue-severity', severityLabel(issue.severity)));
      row.append(el('strong', '', issue.title));
      row.append(el('span', '', `${issue.filePath}:${issue.lineRange[0]} · ${confidence}`));
      issues.append(row);
    }
  }
  detail.append(issues);

  const exportGuide = el('p', 'ca-repo-note', t('desktop.detail.exportGuidance'));
  detail.append(exportGuide);

  const exports = el('div', 'ca-export-actions');
  exports.append(button(t('desktop.action.copyMarkdown'), () => void exportSelected('markdown'), 'ca-button', 'button-copy-markdown'));
  exports.append(button(t('desktop.action.copyJson'), () => void exportSelected('json'), 'ca-button', 'button-copy-json'));
  exports.append(button(t('desktop.action.copySarif'), () => void exportSelected('sarif'), 'ca-button', 'button-copy-sarif'));
  detail.append(exports);

  const nextAction = renderNextActionPanel(selected);
  detail.append(nextAction);

  if (selected.markdown) {
    const reportSection = el('details', 'ca-report-shell') as HTMLDetailsElement;
    const summary = el('summary', '', t('desktop.detail.rawReportPreview'));
    const reportHead = el('div', 'ca-report-shell-head');
    reportHead.append(el('strong', '', t('desktop.detail.rawReportPreview')));
    reportHead.append(button(t('desktop.action.copyMarkdown'), async () => {
      try {
        await navigator.clipboard.writeText(selected.markdown ?? '');
        pushToast(t('desktop.toast.copied'), 'success');
      } catch {
        pushToast(t('desktop.toast.copyFailed'), 'error');
      }
    }, 'ca-button ca-button-ghost', 'button-copy-raw-report'));
    const report = el('pre', 'ca-report ca-report-raw');
    report.textContent = selected.markdown;
    report.tabIndex = 0;
    report.setAttribute('aria-label', t('desktop.a11y.reportScrollable'));
    reportSection.append(summary, reportHead, report);
    detail.append(reportSection);
  }
  return detail;
}

function renderAcceptancePanel(selected: SessionDetail): HTMLElement {
  const blockers = blockerCount(selected);
  const tone = decisionTone(selected);
  const panel = el('section', `ca-acceptance-panel ca-${tone}`);
  panel.dataset.testid = 'acceptance-panel';
  panel.append(el('span', 'ca-eyebrow', t('desktop.acceptance.eyebrow')));

  if (selected.decision === 'ACCEPT' && blockers === 0) {
    panel.append(el('strong', '', t('desktop.acceptance.acceptTitle')));
    panel.append(el('p', '', t('desktop.acceptance.acceptBody')));
  } else if (selected.decision === 'REJECT' || blockers > 0) {
    panel.append(el('strong', '', t('desktop.acceptance.rejectTitle', { count: blockers })));
    panel.append(el('p', '', t('desktop.acceptance.rejectBody')));
  } else if (selected.decision === 'NEEDS_HUMAN') {
    panel.append(el('strong', '', t('desktop.acceptance.humanTitle')));
    panel.append(el('p', '', t('desktop.acceptance.humanBody')));
  } else {
    panel.append(el('strong', '', t('desktop.acceptance.pendingTitle')));
    panel.append(el('p', '', t('desktop.acceptance.pendingBody')));
  }

  const actions = el('div', 'ca-acceptance-actions');
  actions.append(button(t('desktop.action.copyDecisionSummary'), () => void copyDecisionSummary(selected), 'ca-button ca-primary', 'button-copy-decision-summary'));
  actions.append(button(t('desktop.action.copyMarkdown'), () => void exportSelected('markdown'), 'ca-button', 'button-copy-decision-markdown'));
  panel.append(actions);
  return panel;
}

function renderRunReview(): HTMLElement {
  const panel = el('div', 'ca-run-panel');
  panel.dataset.testid = 'run-panel';
  const readiness = runReadiness();
  const mobile = isCompactMobileLayout();
  const intro = el('div', 'ca-launch-intro');
  intro.append(el('span', 'ca-eyebrow', t('desktop.run.eyebrow')));
  intro.append(el('h2', '', t('desktop.run.title')));
  intro.append(el('p', '', t('desktop.run.body')));
  panel.append(intro);

  const readinessPanel = el('section', readiness.ready ? 'ca-readiness-panel ca-ready' : 'ca-readiness-panel ca-blocked');
  readinessPanel.dataset.testid = 'run-readiness';
  readinessPanel.append(el('h3', '', readiness.ready ? t('desktop.readiness.readyTitle') : t('desktop.readiness.blockedTitle')));
  readinessPanel.append(el('p', '', readiness.ready ? t('desktop.readiness.readyBody') : t('desktop.readiness.blockedBody')));
  if (readiness.reasons.length > 0) {
    const list = el('ul', 'ca-readiness-reasons');
    for (const reason of readiness.reasons) {
      list.append(el('li', '', reason));
    }
    readinessPanel.append(list);
  }
  if (readiness.nextSteps.length > 0) {
    readinessPanel.append(el('strong', 'ca-readiness-next-title', t('desktop.readiness.nextTitle')));
    const nextList = el('ul', 'ca-readiness-reasons ca-readiness-next');
    for (const step of readiness.nextSteps) {
      nextList.append(el('li', '', step));
    }
    readinessPanel.append(nextList);
  }
  if (repoNeedsConfig()) {
    const setupActions = el('div', 'ca-config-status-actions');
    setupActions.append(button(t('desktop.action.createConfig'), () => void createWorkspaceConfig(), 'ca-button ca-primary', 'button-create-config'));
    setupActions.append(button(t('desktop.nav.config'), () => setView('config'), 'ca-button', 'button-open-config-from-readiness'));
    readinessPanel.append(setupActions);
  }

  if (mobile) {
    panel.append(renderRunMobileStepper(readiness, Boolean(state.activeRun)));
    panel.append(readinessPanel);
    if (!readiness.ready) return panel;

    const currentStep = resolveRunMobileStep(state.runMobileStep, readiness.ready, Boolean(state.activeRun));
    if (currentStep === 1) {
      panel.append(renderRepositoryPicker());
      const next = button(t('desktop.action.next'), () => {
        state.runMobileStep = 2;
        render();
      }, 'ca-button ca-primary', 'button-run-mobile-next');
      panel.append(next);
      return panel;
    }

    if (currentStep === 2) {
      panel.append(renderRepositoryPicker());
      panel.append(renderRepoFacts());
      panel.append(renderRunLaunchCards());
      return panel;
    }

    panel.append(renderReviewRun());
    return panel;
  }

  panel.append(readinessPanel);
  panel.append(renderRepositoryPicker());
  panel.append(renderRepoFacts());
  panel.append(renderRunLaunchCards());
  panel.append(renderReviewRun());
  return panel;
}

function renderRunMobileStepper(readiness: RunReadiness, hasRun: boolean): HTMLElement {
  const stepper = el('div', 'ca-mobile-stepper');
  stepper.dataset.testid = 'run-mobile-stepper';
  stepper.append(el('span', 'ca-eyebrow', t('desktop.run.mobileStepperEyebrow')));

  const activeStep = resolveRunMobileStep(state.runMobileStep, readiness.ready, hasRun);
  const row = el('div', 'ca-mobile-step-row');
  const steps: Array<[RunMobileStep, string, string, boolean]> = [
    [1, t('desktop.run.mobileStep1Title'), t('desktop.run.mobileStep1Body'), true],
    [2, t('desktop.run.mobileStep2Title'), t('desktop.run.mobileStep2Body'), readiness.ready],
    [3, t('desktop.run.mobileStep3Title'), t('desktop.run.mobileStep3Body'), hasRun],
  ];
  for (const [step, title, body, enabled] of steps) {
    const node = button(`${step}. ${title}`, () => {
      state.runMobileStep = step;
      render();
    }, step === activeStep ? 'ca-button ca-primary ca-mobile-step is-active' : 'ca-button ca-button-ghost ca-mobile-step', `button-run-mobile-step-${step}`);
    node.disabled = node.disabled || !enabled;
    node.setAttribute('aria-pressed', String(step === activeStep));
    node.append(el('span', 'ca-mobile-step-body', body));
    row.append(node);
  }
  stepper.append(row);
  return stepper;
}

function renderRunLaunchCards(): HTMLElement {
  const actions = el('div', 'ca-launch-cards');
  const staged = launchCard(t('desktop.run.stagedTitle'), t('desktop.run.stagedEyebrow'), t('desktop.run.stagedBody'), true, () => void startReview(true), 'button-review-staged-changes');
  const working = launchCard(t('desktop.run.workingTitle'), t('desktop.run.workingEyebrow'), t('desktop.run.workingBody'), false, () => void startReview(false), 'button-review-working-tree');
  actions.append(staged, working);
  if (state.activeRun && isReviewRunning(state.activeRun)) {
    const cancel = button(t('desktop.action.cancelReview'), () => void cancelActiveReview(), 'ca-button ca-danger', 'button-cancel-review');
    actions.append(cancel);
  }
  return actions;
}

function launchCard(label: string, eyebrow: string, description: string, primary: boolean, onClick: () => void, testId: string): HTMLButtonElement {
  const node = el('button', primary ? 'ca-launch-card ca-primary' : 'ca-launch-card');
  node.type = 'button';
  node.dataset.testid = testId;
  const readiness = runReadiness();
  node.disabled = state.busy || !readiness.ready;
  if (!readiness.ready) {
    const reason = readinessBlockedReason(readiness);
    node.title = reason;
    node.setAttribute('aria-label', t('desktop.a11y.reviewLaunchBlocked', { label, reason }));
  }
  node.addEventListener('click', onClick);
  node.append(el('span', 'ca-eyebrow', eyebrow));
  node.append(el('strong', '', label));
  node.append(el('span', '', description));
  return node;
}

function renderReviewRun(): HTMLElement {
  const run = state.activeRun;
  const section = el('section', 'ca-review-run');
  section.dataset.testid = 'review-run';
  section.append(el('h3', '', t('desktop.run.timelineTitle')));
  if (runHasDegradedSignal(run)) {
    const degraded = el('div', 'ca-degraded-signal');
    degraded.dataset.testid = 'review-degraded-signal';
    degraded.append(el('strong', '', t('desktop.degraded.title')));
    degraded.append(el('p', '', t('desktop.degraded.runBody')));
    section.append(degraded);
  }
  if (!run) {
    const empty = el('div', 'ca-empty-state ca-compact');
    empty.append(el('strong', '', t('desktop.run.noActiveTitle')));
    empty.append(el('p', '', t('desktop.run.noActiveBody')));
    if (runReadiness().ready) {
      empty.append(button(t('desktop.action.startReview'), () => void startReview(true), 'ca-button ca-subtle', 'button-start-staged-review-empty'));
    } else {
      empty.append(button(t('desktop.action.fixSetup'), () => {
        setView('setup');
        void loadSetup();
      }, 'ca-button ca-subtle', 'button-fix-setup-empty-run'));
    }
    section.append(empty);
    return section;
  }

  const summary = el('div', 'ca-review-run-summary');
  summary.append(el('span', statusClass(run.status), plainRunStatus(run.status)));
  summary.append(el('strong', '', t('desktop.run.reviewRecord')));
  summary.append(el('span', '', run.staged ? t('desktop.run.stagedDiff') : t('desktop.run.workingTreeDiff')));
  if (run.sessionId) summary.append(el('span', '', t('desktop.run.sessionLabel', { sessionId: run.sessionId })));
  summary.append(el('span', 'ca-run-id', run.runId));
  if (run.status === 'completed') {
    summary.append(button(t('desktop.action.reviewResults'), () => void openReviewResultFromRun(run), 'ca-button ca-subtle', 'button-open-review-result'));
  }
  section.append(summary);
  section.append(el('p', 'ca-repo-note', run.message));
  const outcome = renderRunOutcomePanel(run);
  if (outcome) section.append(outcome);

  if (state.activeRun && isReviewRunning(state.activeRun)) {
    const progress = reviewProgress(state.activeRun.events);
    const progressBar = el('div', 'ca-progress-bar');
    const progressFill = el('div', 'ca-progress-fill');
    progressFill.style.width = `${progress.percent}%`;
    progressBar.append(progressFill);
    const progressLabel = el('div', 'ca-progress-label', `${progress.stage} (${progress.percent}%)`);
    section.append(progressBar, progressLabel);
  }

  const events = el('div', 'ca-event-list timeline');
  events.tabIndex = 0;
  events.setAttribute('aria-label', t('desktop.a11y.eventsScrollable'));
  for (const event of run.events.slice(-12).reverse()) {
    const row = el('div', 'ca-event-row');
    row.append(el('span', 'ca-event-dot', ''));
    row.append(el('span', 'ca-event-kind', reviewEventKindLabel(event.kind)));
    row.append(el('span', '', event.message));
    row.append(el('time', '', formatTimestamp(event.timestamp)));
    events.append(row);
  }
  section.append(events);
  return section;
}

function renderRunOutcomePanel(run: ReviewRunSnapshot): HTMLElement | undefined {
  if (!['failed', 'cancelled', 'completed'].includes(run.status)) return undefined;
  const missingResult = run.status === 'completed' && !run.sessionId;
  if (run.status === 'completed' && !missingResult) return undefined;

  const tone = run.status === 'failed' ? 'danger' : run.status === 'cancelled' ? 'warn' : 'info';
  const panel = el('section', `ca-run-outcome ca-${tone}`);
  panel.dataset.testid = 'review-outcome-panel';
  panel.append(el('span', 'ca-eyebrow', t('desktop.run.outcomeEyebrow')));

  if (run.status === 'failed') {
    panel.append(el('strong', '', t('desktop.run.outcomeFailedTitle')));
    panel.append(el('p', '', t('desktop.run.outcomeFailedBody')));
  } else if (run.status === 'cancelled') {
    panel.append(el('strong', '', t('desktop.run.outcomeCancelledTitle')));
    panel.append(el('p', '', t('desktop.run.outcomeCancelledBody')));
  } else {
    panel.append(el('strong', '', t('desktop.run.outcomeMissingTitle')));
    panel.append(el('p', '', t('desktop.run.outcomeMissingBody')));
  }

  if (run.message) {
    panel.append(el('p', 'ca-run-outcome-detail', t('desktop.run.outcomeDetail', { detail: run.message })));
  }

  const actions = el('div', 'ca-run-outcome-actions');
  if (run.status === 'failed' || run.status === 'cancelled') {
    actions.append(button(t('desktop.action.rerunReview'), () => void startReview(run.staged), 'ca-button ca-primary', 'button-rerun-failed-review'));
    actions.append(button(t('desktop.action.checkSetup'), () => {
      setView('setup');
      void loadSetup();
    }, 'ca-button', 'button-check-setup-after-run'));
  }
  actions.append(button(t('desktop.action.refreshEvidence'), () => void refreshSessions(true, true), 'ca-button ca-subtle', 'button-refresh-after-run'));
  panel.append(actions);
  return panel;
}

function statusClass(status: string): string {
  if (status === 'completed') return 'ca-run-status ca-complete';
  if (status === 'failed') return 'ca-run-status ca-failed';
  if (status === 'cancelled' || status === 'cancelling') return 'ca-run-status ca-cancelled';
  return 'ca-run-status ca-running';
}

function renderRepositoryPicker(): HTMLElement {
  const section = el('section', 'ca-repo-picker');
  const input = el('input', 'ca-repo-path-input') as HTMLInputElement;
  input.dataset.testid = 'repo-path-input';
  input.type = 'text';
  input.placeholder = t('desktop.repo.pathPlaceholder');
  input.setAttribute('aria-label', t('desktop.repo.pathAria'));
  input.value = state.repoInput || state.repoPath;
  input.addEventListener('input', () => {
    state.repoInput = input.value;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void openRepo(input.value)
    }
  })
  section.append(input);
  section.append(button(t('desktop.action.openRepository'), () => void chooseRepo(input.value), 'ca-button ca-primary', 'button-open-repository'));

  if (state.recentRepoPaths.length > 0) {
    const recent = el('div', 'ca-recent-repos');
    recent.append(el('span', '', t('desktop.repo.recent')));
    for (const [index, path] of state.recentRepoPaths.entries()) {
      recent.append(button(path, () => void openRepo(path), 'ca-ghost ca-repo-chip', `button-recent-repo-${index}`));
    }
    section.append(recent);
  }
  return section;
}

function renderRepoFacts(): HTMLElement {
  const repo = state.repoInfo;
  const grid = el('div', 'ca-repo-grid');
  if (!repo) {
    grid.append(el('div', 'ca-repo-card', t('desktop.repo.loadingState')));
    return grid;
  }

  const facts: Array<[string, string, boolean?]> = [
    [t('desktop.repo.fact.trust'), repo.trusted ? t('desktop.repo.value.trustedWorkspace') : t('desktop.repo.value.notTrusted'), repo.trusted],
    [t('desktop.repo.fact.git'), repo.isGitRepo ? t('desktop.repo.value.detected') : t('desktop.repo.value.missing'), repo.isGitRepo],
    [t('desktop.metric.branch'), repo.branch || t('desktop.repo.value.detached')],
    [t('desktop.repo.fact.head'), repo.headSha || t('desktop.value.unknown')],
    [t('desktop.metric.dirtyFiles'), String(repo.dirtyFileCount)],
    [t('desktop.metric.sessions'), String(repo.sessionCount)],
    [t('desktop.nav.config'), repo.configPath || t('desktop.value.notFound'), repo.hasConfig],
    [t('desktop.repo.fact.reviewRules'), repo.reviewRulesPath || t('desktop.value.notFound'), Boolean(repo.reviewRulesPath)],
    [t('desktop.repo.fact.reviewIgnore'), repo.reviewIgnorePath || t('desktop.value.notFound'), Boolean(repo.reviewIgnorePath)],
  ];

  for (const [label, value, healthy] of facts) {
    const card = el('div', healthy === false ? 'ca-repo-card ca-warn' : 'ca-repo-card');
    card.append(el('span', '', label));
    card.append(el('strong', '', value));
    grid.append(card);
  }

  const trust = el('p', repo.trusted ? 'ca-repo-note' : 'ca-repo-note ca-warn', repo.trustReason);
  const wrapper = el('div', 'ca-repo-section');
  wrapper.append(grid, trust);
  return wrapper;
}

function renderConfig(): HTMLElement {
  const panel = el('div', 'ca-config-panel');
  panel.dataset.testid = 'config-panel';
  const header = el('div', 'ca-config-hero');
  header.append(el('span', 'ca-eyebrow', t('desktop.config.eyebrow')));
  header.append(el('h2', '', t('desktop.config.title')));
  header.append(el('p', '', t('desktop.config.body')));
  header.append(el('span', 'ca-config-path', state.configPath));
  panel.append(header);
  panel.append(renderConfigStatusPanel());
  panel.append(renderConfigFacts());
  panel.append(renderConfigValidation());

  if (state.configDirty) {
    const dirtyBanner = el('div', 'ca-dirty-banner', t('desktop.config.unsavedChanges'));
    panel.append(dirtyBanner);
  }

  const isYaml = state.configPath.endsWith('.yml') || state.configPath.endsWith('.yaml');
  if (isYaml) {
    const yamlBanner = el('div', 'ca-yaml-banner', t('desktop.config.yamlReadOnlyBanner'));
    panel.append(yamlBanner);
  }

  const advanced = el('details', 'ca-advanced-config') as HTMLDetailsElement;
  advanced.append(el('summary', '', t('desktop.config.advancedEditor')));
  const textarea = el('textarea', 'ca-config-editor') as HTMLTextAreaElement;
  textarea.dataset.testid = 'config-editor';
  textarea.setAttribute('aria-label', t('desktop.config.editorAria'));
  textarea.value = state.configRaw;
  textarea.addEventListener('input', () => {
    state.configRaw = textarea.value;
    state.configDirty = state.configRaw !== state.configOriginal;
    render();
  });
  advanced.append(textarea);
  const actions = el('div', 'ca-config-actions');
  actions.append(button(t('desktop.action.validateConfig'), () => void validateConfigEditor(textarea.value), 'ca-button', 'button-validate-config'));
  const saveButton = button(t('desktop.action.saveConfig'), () => void saveConfig(textarea.value), 'ca-button ca-primary', 'button-save-config');
  if (isYaml) {
    saveButton.disabled = true;
    saveButton.title = t('desktop.config.yamlReadOnlyBanner');
  }
  actions.append(saveButton);
  advanced.append(actions);
  panel.append(advanced);
  return panel;
}

function renderConfigStatusPanel(): HTMLElement {
  const validation = state.configValidation;
  const readiness = runReadiness();
  const configSyntaxInvalid = validation?.valid === false;
  const policyIncomplete = Boolean(!configSyntaxInvalid && state.configRaw.trim() && !evaluateConfigPolicy(state.configRaw).complete);
  const ready = validation?.valid !== false && readiness.ready;
  const panel = el('section', ready ? 'ca-config-status ca-good' : configSyntaxInvalid ? 'ca-config-status ca-danger' : 'ca-config-status ca-warn');
  panel.dataset.testid = 'config-status-panel';
  panel.append(el('span', 'ca-eyebrow', t('desktop.config.statusEyebrow')));
  panel.append(el('strong', '', ready ? t('desktop.config.statusReadyTitle') : policyIncomplete ? t('desktop.config.noActiveReviewersTitle') : t('desktop.config.statusBlockedTitle')));
  panel.append(el('p', '', ready ? t('desktop.config.statusReadyBody') : readinessBlockedReason(readiness)));
  const actions = el('div', 'ca-config-status-actions');
  actions.append(button(t('desktop.action.validateConfig'), () => void validateConfigEditor(state.configRaw), 'ca-button', 'button-validate-config-status'));
  const runButton = button(t('desktop.nav.runReview'), () => setView('run'), 'ca-button ca-primary', 'button-run-from-config-status');
  runButton.disabled = state.busy || !readiness.ready;
  if (!readiness.ready) {
    const reason = readinessBlockedReason(readiness);
    runButton.title = reason;
    runButton.setAttribute('aria-label', t('desktop.a11y.reviewLaunchBlocked', { label: t('desktop.nav.runReview'), reason }));
  }
  actions.append(runButton);
  panel.append(actions);
  return panel;
}

function renderConfigValidation(): HTMLElement {
  const validation = state.configValidation;
  const panel = el('div', validation?.valid === false ? 'ca-validation-panel ca-invalid' : 'ca-validation-panel');
  if (!validation) {
    panel.append(el('p', 'ca-empty', t('desktop.config.notValidated')));
    return panel;
  }
  panel.append(el('strong', '', validation.valid ? t('desktop.config.valid') : t('desktop.config.invalid')));
  for (const error of validation.errors) {
    panel.append(el('span', 'ca-validation-error', error));
  }
  for (const warning of validation.warnings) {
    panel.append(el('span', 'ca-validation-warning', warning));
  }
  if (validation.errors.length === 0 && validation.warnings.length === 0) {
    panel.append(el('span', 'ca-validation-ok', t('desktop.config.noErrorsOrWarnings')));
  }
  return panel;
}

function renderNextActionPanel(selected: SessionDetail): HTMLElement {
  const panel = el('section', 'ca-next-action-panel');
  panel.dataset.testid = 'next-action-panel';
  panel.append(el('h3', '', t('desktop.next.title')));

  const list = el('ol', 'ca-next-action-list');
  const blockers = blockerCount(selected);
  if (blockers > 0 || selected.decision === 'REJECT') {
    list.append(el('li', '', t('desktop.next.fixBlockers')));
    list.append(el('li', '', t('desktop.next.rerunStaged')));
    list.append(el('li', '', t('desktop.next.exportShare')));
  } else if (selected.decision === 'NEEDS_HUMAN') {
    list.append(el('li', '', t('desktop.next.humanReview')));
    list.append(el('li', '', t('desktop.next.captureDecision')));
    list.append(el('li', '', t('desktop.next.exportShare')));
  } else {
    list.append(el('li', '', t('desktop.next.prepareMerge')));
    list.append(el('li', '', t('desktop.next.exportRecord')));
    list.append(el('li', '', t('desktop.next.monitorNextRun')));
  }
  panel.append(list);
  panel.append(el('p', 'ca-repo-note', t('desktop.next.contractNote')));
  return panel;
}

function renderConfigFacts(): HTMLElement {
  const facts = el('div', 'ca-config-facts ca-summary-cards');
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(state.configRaw) as Record<string, unknown>;
  } catch {
    appendMetric(facts, t('desktop.config.policyStatus'), t('desktop.value.invalid'), 'ca-warn');
    appendMetric(facts, t('desktop.config.reviewDepth'), t('desktop.value.unknown'));
    appendMetric(facts, t('desktop.config.finalJudge'), t('desktop.value.unknown'));
    return facts;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    appendMetric(facts, t('desktop.config.policyStatus'), t('desktop.value.invalidShape'), 'ca-warn');
    appendMetric(facts, t('desktop.config.reviewDepth'), t('desktop.value.unknown'));
    appendMetric(facts, t('desktop.config.finalJudge'), t('desktop.value.unknown'));
    return facts;
  }
  const mode = typeof parsed.mode === 'string' ? parsed.mode : t('desktop.value.unset');
  const reviewers = reviewerCountLabel(parsed.reviewers);
  const supporters = supporterCount(parsed.supporters);
  const finalJudge = agentLabel((parsed.head as Record<string, unknown> | undefined) ?? parsed.moderator);
  const policy = evaluateConfigPolicy(state.configRaw);
  const policyReady = state.configValidation?.valid !== false && policy.complete;
  appendMetric(facts, t('desktop.config.policyStatus'), policyReady ? t('desktop.value.ready') : t('desktop.value.needsFixes'), policyReady ? 'ca-good' : 'ca-warn');
  appendMetric(facts, t('desktop.config.reviewMode'), mode);
  appendMetric(facts, t('desktop.config.reviewDepth'), t('desktop.config.reviewDepthValue', { reviewers, supporters }));
  appendMetric(facts, t('desktop.config.finalJudge'), finalJudge);
  return facts;
}

function reviewerCountLabel(value: unknown): string {
  const count = activeReviewerCount(value);
  return count === undefined ? t('desktop.value.unknown') : String(count);
}

function supporterCount(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return '0';
  const supporters = value as { pool?: unknown; devilsAdvocate?: unknown };
  const pool = Array.isArray(supporters.pool) ? supporters.pool.filter((entry) => isEnabledConfigEntry(entry)).length : 0;
  return String(pool + (supporters.devilsAdvocate ? 1 : 0));
}

function agentLabel(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return t('desktop.value.unknown');
  const agent = value as { backend?: unknown; provider?: unknown; model?: unknown; enabled?: unknown };
  if (agent.enabled === false) return t('desktop.value.disabled');
  const provider = typeof agent.provider === 'string' ? agent.provider : undefined;
  const backend = typeof agent.backend === 'string' ? agent.backend : undefined;
  const model = typeof agent.model === 'string' ? agent.model : undefined;
  return [provider ?? backend, model].filter(Boolean).join(' / ') || t('desktop.value.unknown');
}

function renderSetup(): HTMLElement {
  const panel = el('div', 'ca-setup-panel');
  panel.dataset.testid = 'setup-panel';
  const header = el('div', 'ca-section-head ca-setup-hero');
  const copy = el('div');
  copy.append(el('span', 'ca-eyebrow', t('desktop.setup.eyebrow')));
  copy.append(el('h2', '', t('desktop.setup.title')));
  copy.append(el('p', '', t('desktop.setup.body')));
  header.append(copy);
  header.append(button(t('desktop.action.refreshSetup'), () => void loadSetup(), 'ca-button', 'button-refresh-setup'));
  panel.append(header);
  panel.append(renderSetupOverview());

  const providerDetails = el('details', 'ca-integration-section') as HTMLDetailsElement;
  providerDetails.append(el('summary', '', t('desktop.setup.reviewEngines')));
  const grid = el('div', 'ca-provider-grid');
  for (const provider of state.providers) {
    const card = el('div', provider.configured ? 'ca-provider-card ca-configured ca-checklist-card' : 'ca-provider-card ca-checklist-card');
    const top = el('div', 'ca-provider-card-top');
    top.append(el('span', provider.configured ? 'ca-check-dot ca-good ca-status-pill' : 'ca-check-dot ca-optional ca-status-pill', provider.configured ? t('desktop.value.ready') : t('desktop.value.optional')));
    top.append(el('span', 'ca-provider-kind ca-status-pill ca-neutral', provider.kind));
    card.append(top);
    card.append(el('strong', '', provider.name));
    const status = provider.configured ? t('desktop.setup.configured') : t('desktop.setup.notConfigured');
    card.append(el('span', provider.configured ? 'ca-provider-ok ca-status-pill' : 'ca-provider-missing ca-optional ca-status-pill', status));
    if (provider.envVar) card.append(el('span', 'ca-provider-meta', `${provider.envVar} ${provider.redactedValue ?? ''}`.trim()));
    if (provider.binary) card.append(el('span', 'ca-provider-meta', provider.binary));
    if (provider.envVar) {
      const providerKey = provider.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'provider';
      const copyEnvBtn = button(t('desktop.action.copyEnvVar'), async () => {
        try {
          await navigator.clipboard.writeText(provider.envVar!);
          pushToast(t('desktop.toast.copied'), 'success');
        } catch {
          pushToast(t('desktop.toast.copyFailed'), 'error');
        }
      }, 'ca-button ca-button-ghost', `button-copy-env-${providerKey}`);
      copyEnvBtn.textContent = t('desktop.action.copyEnvVarWithName', { name: provider.name });
      copyEnvBtn.setAttribute('aria-label', t('desktop.a11y.copyProviderEnvVar', { provider: provider.name, envVar: provider.envVar }));
      card.append(copyEnvBtn);
    }
    grid.append(card);
  }
  if (state.providers.length === 0) {
    const empty = el('div', 'ca-empty-state ca-compact');
    empty.append(el('strong', '', t('desktop.setup.providerStatusNotLoaded')));
    empty.append(el('p', '', t('desktop.setup.providerStatusHint')));
    empty.append(button(t('desktop.action.refreshSetup'), () => void loadSetup(), 'ca-button ca-subtle', 'button-refresh-setup-empty'));
    grid.append(empty);
  }
  providerDetails.append(grid);

  const providerHint = el('p', 'ca-setup-hint', t('desktop.setup.providerHint'));
  providerDetails.append(providerHint);
  panel.append(providerDetails);
  panel.append(renderLiveDoctorSetup());

  panel.append(renderMcpSetup());
  panel.append(renderGitHubActionSetup());
  panel.append(renderEvidenceSetup());
  return panel;
}

function renderSetupOverview(): HTMLElement {
  const overview = el('section', 'ca-setup-overview');
  overview.dataset.testid = 'setup-overview';
  const hasConfiguredProvider = state.providers.some((provider) => provider.configured);
  const providerKnown = state.providers.length > 0;
  const requiredGroup = el('section', 'ca-setup-group');
  const requiredHead = el('div', 'ca-setup-group-head');
  requiredHead.append(el('span', 'ca-eyebrow', t('desktop.setup.requiredGroupTitle')));
  requiredHead.append(el('p', '', t('desktop.setup.requiredGroupBody')));
  requiredGroup.append(requiredHead);
  const requiredCards = el('div', 'ca-setup-status-grid');
  appendSetupStatusCard(
    requiredCards,
    t('desktop.setup.localReview'),
    hasConfiguredProvider ? t('desktop.value.ready') : providerKnown ? t('desktop.value.optional') : t('desktop.value.unknown'),
    hasConfiguredProvider ? t('desktop.setup.localReviewReadyBody') : t('desktop.setup.localReviewOptionalBody'),
    hasConfiguredProvider ? 'good' : 'warn',
  );
  const live = state.liveDoctorStatus;
  const liveChecks = live?.liveChecks ?? [];
  const liveOk = liveChecks.filter((check) => check.status === 'ok').length;
  const liveFailed = liveChecks.filter((check) => check.status !== 'ok').length;
  const liveError = state.liveDoctorError;
  appendSetupStatusCard(
    requiredCards,
    t('desktop.setup.liveReview'),
    live
      ? liveChecks.length > 0
        ? `${liveOk}/${liveChecks.length} ${t('desktop.value.ready')}`
        : t('desktop.value.optional')
      : liveError
        ? t('desktop.value.needsFixes')
        : t('desktop.value.unknown'),
    live
      ? liveFailed > 0
        ? t('desktop.setup.liveReviewBlockedBody')
        : t('desktop.setup.liveReviewReadyBody')
      : liveError
        ? liveError
        : t('desktop.setup.liveReviewMissingBody'),
    live ? (liveFailed > 0 ? 'danger' : 'good') : liveError ? 'danger' : 'warn',
  );
  requiredGroup.append(requiredCards);
  overview.append(requiredGroup);

  const optionalGroup = el('section', 'ca-setup-group');
  const optionalHead = el('div', 'ca-setup-group-head');
  optionalHead.append(el('span', 'ca-eyebrow', t('desktop.setup.optionalGroupTitle')));
  optionalHead.append(el('p', '', t('desktop.setup.optionalGroupBody')));
  optionalGroup.append(optionalHead);
  const optionalCards = el('div', 'ca-setup-status-grid');
  const actionReady = Boolean(state.githubActionStatus && state.githubActionStatus.codeagoraWorkflowCount > 0);
  appendSetupStatusCard(
    optionalCards,
    t('desktop.setup.prAutomation'),
    actionReady ? t('desktop.value.ready') : state.githubActionStatus ? t('desktop.value.missing') : t('desktop.value.unknown'),
    actionReady ? t('desktop.setup.prAutomationReadyBody') : t('desktop.setup.prAutomationMissingBody'),
    actionReady ? 'good' : 'warn',
  );
  const evidenceReady = Boolean(state.evidenceStatus?.hasReleaseEvidence && state.evidenceStatus?.hasEvidenceManifest);
  appendSetupStatusCard(
    optionalCards,
    t('desktop.setup.resultEvidence'),
    evidenceReady ? t('desktop.value.ready') : state.evidenceStatus ? t('desktop.value.needsFixes') : t('desktop.value.unknown'),
    evidenceReady ? t('desktop.setup.resultEvidenceReadyBody') : t('desktop.setup.resultEvidenceMissingBody'),
    evidenceReady ? 'good' : 'warn',
  );
  optionalGroup.append(optionalCards);
  overview.append(optionalGroup);
  return overview;
}

function appendSetupStatusCard(parent: HTMLElement, label: string, value: string, body: string, tone: 'good' | 'warn' | 'danger'): void {
  const card = el('div', `ca-setup-status-card ca-${tone}`);
  card.append(el('span', 'ca-eyebrow', label));
  card.append(el('strong', '', value));
  card.append(el('p', '', body));
  parent.append(card);
}

function renderSetupSnippetBlock(title: string, body: string, snippet: string, testId: string): HTMLElement {
  const block = el('div', 'ca-snippet-block');
  block.dataset.testid = testId;
  const head = el('div', 'ca-snippet-head');
  head.append(el('strong', '', title));
  head.append(button(t('desktop.action.copy'), async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      pushToast(t('desktop.toast.copied'), 'success');
    } catch {
      pushToast(t('desktop.toast.copyFailed'), 'error');
    }
  }, 'ca-button ca-button-ghost', `${testId}-copy`));
  block.append(head);
  block.append(el('p', 'ca-repo-note', body));
  const pre = el('pre', 'ca-snippet');
  pre.textContent = snippet;
  block.append(pre);
  return block;
}

function renderLiveDoctorSetup(): HTMLElement {
  const section = el('details', 'ca-integration-section') as HTMLDetailsElement;
  section.append(el('summary', '', t('desktop.setup.liveReviewDetails')));

  const command = el('p', 'ca-repo-note', t('desktop.setup.liveReviewHint'));
  section.append(command);

  const actionRow = el('div', 'ca-cockpit-actions');
  const refresh = button(
    state.liveDoctorLoading ? t('desktop.setup.liveReviewLoading') : t('desktop.setup.liveReviewCheck'),
    () => void loadLiveDoctorStatus(),
    'ca-button ca-primary',
    'button-live-review-check',
  );
  refresh.disabled = state.liveDoctorLoading;
  actionRow.append(refresh);
  section.append(actionRow);

  if (state.liveDoctorError) {
    const error = el('p', 'ca-repo-note ca-warn', state.liveDoctorError);
    section.append(error);
    return section;
  }

  const live = state.liveDoctorStatus;
  if (!live) {
    section.append(el('p', 'ca-empty', t('desktop.setup.liveReviewNotLoaded')));
    return section;
  }

  section.append(el('p', 'ca-repo-note', live.command));
  section.append(
    el(
      'p',
      'ca-repo-note',
      t('desktop.setup.liveReviewSummary', {
        pass: String(live.summary.pass),
        fail: String(live.summary.fail),
        warn: String(live.summary.warn),
      }),
    ),
  );

  const checks = el('div', 'ca-provider-grid');
  if (live.liveChecks.length === 0) {
    const empty = el('div', 'ca-empty-state ca-compact');
    empty.append(el('strong', '', t('desktop.setup.liveReviewNoChecks')));
    empty.append(el('p', '', t('desktop.setup.liveReviewNoChecksBody')));
    checks.append(empty);
  } else {
    for (const check of live.liveChecks) {
      const tone = check.status === 'ok' ? 'good' : check.status === 'timeout' ? 'warn' : 'danger';
      const card = el('div', `ca-provider-card ca-${tone} ca-checklist-card`);
      card.append(el('strong', '', `${check.provider} / ${check.model}`));
      card.append(el('span', '', check.status === 'ok' ? t('desktop.live.status.ok') : check.status === 'timeout' ? t('desktop.live.status.timeout') : t('desktop.live.status.error')));
      if (check.latencyMs !== undefined) {
        card.append(el('span', 'ca-provider-meta', `${check.latencyMs}ms`));
      }
      if (check.error) {
        card.append(el('span', 'ca-provider-meta', check.error));
      }
      checks.append(card);
    }
  }
  section.append(checks);
  return section;
}

function renderMcpSetup(): HTMLElement {
  const section = el('details', 'ca-integration-section') as HTMLDetailsElement;
  section.append(el('summary', '', t('desktop.setup.localAutomationDetails')));
  const mcp = state.mcpStatus;
  if (!mcp) {
    section.append(el('p', 'ca-empty', t('desktop.setup.mcpNotLoaded')));
    return section;
  }
  section.append(el('p', 'ca-repo-note', mcp.command));
  const tools = el('div', 'ca-tool-list');
  for (const tool of mcp.tools) {
    tools.append(el('span', 'ca-fact', tool));
  }
  section.append(tools);
  if (!mcp.tools.length) {
    const empty = el('div', 'ca-empty-state', t('desktop.setup.mcpEmpty'));
    section.append(empty);
  }
  section.append(renderSetupSnippetBlock(t('desktop.setup.localAutomationSnippetTitle'), t('desktop.setup.localAutomationSnippetBody'), mcp.clientSnippet, 'setup-mcp-snippet'));
  return section;
}

function renderGitHubActionSetup(): HTMLElement {
  const section = el('details', 'ca-integration-section') as HTMLDetailsElement;
  section.append(el('summary', '', t('desktop.setup.prAutomationDetails')));
  const status = state.githubActionStatus;
  if (!status) {
    section.append(el('p', 'ca-empty', t('desktop.setup.githubActionNotLoaded')));
    return section;
  }
  section.append(el('p', 'ca-repo-note', t('desktop.setup.workflowSummary', { codeagora: status.codeagoraWorkflowCount, workflows: status.workflowCount })));
  for (const workflow of status.workflows) {
    const row = el('div', 'ca-workflow-row');
    row.append(el('strong', 'ca-workflow-path', workflow.path));
    const flags = el('div', 'ca-workflow-flags');
    flags.append(el('span', workflow.mentionsCodeagora ? 'ca-provider-ok ca-status-pill' : 'ca-provider-missing ca-status-pill', workflow.mentionsCodeagora ? 'CodeAgora' : t('desktop.setup.noCodeAgora')));
    flags.append(el('span', workflow.hasPullRequestTrigger ? 'ca-provider-ok ca-status-pill' : 'ca-provider-missing ca-status-pill', workflow.hasPullRequestTrigger ? t('desktop.setup.prTrigger') : t('desktop.setup.noPrTrigger')));
    flags.append(el('span', workflow.hasPermissions ? 'ca-provider-ok ca-status-pill' : 'ca-provider-missing ca-status-pill', workflow.hasPermissions ? t('desktop.setup.permissions') : t('desktop.setup.permissionsMissing')));
    flags.append(el('span', workflow.hasConfigPath ? 'ca-provider-ok ca-status-pill' : 'ca-provider-kind ca-status-pill ca-neutral', workflow.hasConfigPath ? 'config-path' : t('desktop.setup.defaultConfig')));
    row.append(flags);
    section.append(row);
  }
  if (!status.workflows.length) {
    const empty = el('div', 'ca-empty-state', t('desktop.setup.workflowsEmpty'));
    section.append(empty);
  }
  section.append(renderSetupSnippetBlock(t('desktop.setup.prAutomationSnippetTitle'), t('desktop.setup.prAutomationSnippetBody'), status.recommendedSnippet, 'setup-github-action-snippet'));
  return section;
}

function renderEvidenceSetup(): HTMLElement {
  const section = el('details', 'ca-integration-section') as HTMLDetailsElement;
  section.append(el('summary', '', t('desktop.setup.resultEvidenceDetails')));
  const evidence = state.evidenceStatus;
  if (!evidence) {
    section.append(el('p', 'ca-empty', t('desktop.setup.evidenceNotLoaded')));
    return section;
  }
  const rows: Array<[string, boolean, string | undefined]> = [
    [t('desktop.setup.releaseEvidence'), evidence.hasReleaseEvidence, evidence.releaseEvidencePath],
    [t('desktop.setup.liveBenchmarkReport'), evidence.hasBenchmarkReport, evidence.benchmarkReportPath],
    [t('desktop.setup.evidenceManifest'), evidence.hasEvidenceManifest, evidence.evidenceManifestPath],
  ];
  for (const [label, present, path] of rows) {
    const row = el('div', 'ca-evidence-row');
    row.append(el('strong', '', label));
    row.append(el('span', present ? 'ca-provider-ok' : 'ca-provider-missing', present ? t('desktop.value.present') : t('desktop.value.missing')));
    row.append(el('span', '', path ?? t('desktop.value.notFound')));
    section.append(row);
  }
  return section;
}

function renderToasts(): void {
  const existing = document.getElementById('ca-toast-container')
  if (state.toasts.length === 0) {
    if (existing && !existing.querySelector('.is-exiting')) existing.remove()
    return
  }
  const container = existing ?? el('div', 'ca-toast-container')
  if (!existing) {
    container.id = 'ca-toast-container'
    appRoot.append(container)
  }
  const activeIds = new Set(state.toasts.map((toast) => toast.id));
  for (const child of Array.from(container.children)) {
    const node = child as HTMLElement;
    if (!activeIds.has(node.id) && !node.classList.contains('is-exiting')) node.remove();
  }
  for (const toast of state.toasts) {
    const existingToast = document.getElementById(toast.id);
    if (existingToast) {
      if (existingToast.classList.contains('is-exiting')) continue;
      existingToast.className = `ca-toast ca-toast--${toast.type}`;
      const message = existingToast.querySelector<HTMLElement>('[data-toast-message]');
      if (message) message.textContent = toast.message;
      continue;
    }
    const node = el('div', `ca-toast ca-toast--${toast.type}`)
    node.id = toast.id
    node.setAttribute('role', toast.type === 'error' ? 'alert' : 'status')
    const message = el('span', '', toast.message)
    message.dataset.toastMessage = 'true'
    node.append(message)
    node.append(button(t('desktop.toast.dismiss'), () => removeToast(toast.id), 'ca-ghost', `button-dismiss-toast-${toast.id}`))
    container.append(node)
  }
}

function renderFallback(error: unknown): HTMLElement {
  const fallback = el('main', 'ca-content ca-render-fallback');
  fallback.dataset.testid = 'render-fallback';
  fallback.append(el('h2', '', t('desktop.error.renderTitle')));
  fallback.append(el('p', '', t('desktop.error.renderBody')));
  fallback.append(el('pre', 'ca-error-detail', error instanceof Error ? error.message : String(error)));
  fallback.append(button(t('desktop.action.refresh'), () => window.location.reload(), 'ca-button ca-primary', 'button-reload-app'));
  return fallback;
}

function getUniqueSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`
  const testId = el.dataset.testid
  if (testId) return `[data-testid="${testId}"]`
  const path: string[] = []
  let current: HTMLElement | null = el
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase()
    if (current.className) {
      const classes = current.className.split(' ').filter(Boolean)
      if (classes.length > 0) {
        selector = `.${classes.join('.')}`
      }
    }
    path.unshift(selector)
    current = current.parentElement
  }
  return path.join(' ')
}

function render(): void {
  const active = document.activeElement as HTMLElement | null
  const activeSelector = active ? getUniqueSelector(active) : null
  const selectionStart = (active as HTMLInputElement | HTMLTextAreaElement | null)?.selectionStart ?? null
  const selectionEnd = (active as HTMLInputElement | HTMLTextAreaElement | null)?.selectionEnd ?? null

  try {
    ensureAnnouncer();
    if (lastView !== state.view) {
      appRoot.replaceChildren(renderShell());
      ensureAnnouncer();
      lastView = state.view;
    } else {
      const content = appRoot.querySelector('.ca-content')
      const toolbar = appRoot.querySelector('.ca-toolbar')
      if (toolbar) {
        toolbar.replaceWith(renderToolbar())
      }
      if (content) {
        const newContent = renderContent()
        content.replaceChildren(...Array.from(newContent.childNodes))
      } else {
        appRoot.replaceChildren(renderShell());
        ensureAnnouncer();
      }
    }
  } catch (error) {
    appRoot.replaceChildren(renderFallback(error));
    ensureAnnouncer();
    announce(t('desktop.error.renderTitle'));
  }
  renderToasts()

  if (activeSelector) {
    const restored = document.querySelector<HTMLElement>(activeSelector)
    if (restored) {
      restored.focus()
      if (selectionStart !== null && selectionEnd !== null &&
          (restored instanceof HTMLInputElement || restored instanceof HTMLTextAreaElement)) {
        restored.setSelectionRange(selectionStart, selectionEnd)
      }
    }
  }
}

async function bootstrap(): Promise<void> {
  try {
    applyDesktopTheme();
    updateBadgeState();
    void setNotificationPreferences(state.notificationPreferences).catch((error) => {
      pushToast(error instanceof Error ? error.message : String(error), 'warning')
    });
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', onThemeChange);
    window.addEventListener('resize', onViewportChange);
    applyDesktopLocale();
    try {
      const config = await readConfig();
      state.configRaw = config.raw;
      state.configPath = config.path;
      state.configOriginal = config.raw;
      state.configDirty = false;
      applyDesktopLocale(config.raw);
      state.configValidation = await validateConfig(config.raw, config.path);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error), 'error')
    }
    render();
    void refreshSessions(true);
    void loadRepoInfo();

    // Keyboard shortcuts (Tauri context only)
    if (IS_TAURI) {
      window.addEventListener('keydown', onKeyDown);
    }

    function onBeforeUnload(event: BeforeUnloadEvent): void {
      if (state.configDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
      cleanupListeners();
    }

    function cleanupListeners(): void {
      if (mediaQuery) mediaQuery.removeEventListener('change', onThemeChange);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('beforeunload', onBeforeUnload);
    }
    window.addEventListener('beforeunload', onBeforeUnload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appRoot.innerHTML = `
      <div style="padding: 40px; text-align: center; font-family: system-ui, sans-serif;">
        <h1 style="color: var(--danger, #b91c1c);">CodeAgora Desktop failed to start</h1>
        <p style="color: var(--muted, #5d688d); margin: 16px 0;">${message}</p>
        <button onclick="location.reload()" style="padding: 10px 20px; border-radius: 8px; border: none; background: var(--brand, #05A6B9); color: white; cursor: pointer;">Reload</button>
      </div>
    `;
  }
}

void bootstrap();
