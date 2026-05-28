import { getLocale, setLocale, t } from '@codeagora/shared/i18n/index.js';
import {
  getRepoInfo,
  getCommandContract,
  cancelReviewRun,
  getEvidenceStatus,
  exportSession,
  getGitHubActionStatus,
  getMcpStatus,
  getProviderStatus,
  getReviewRun,
  getSessionDetail,
  listSessions,
  openRepository,
  readConfig,
  startReviewRun,
  validateConfig,
  writeConfig,
  IS_TAURI,
  type ConfigValidation,
  type DesktopCommandContract,
  type EvidenceStatus,
  type GitHubActionStatus,
  type McpStatus,
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

const recentReposKey = 'codeagora.desktop.recentRepos';
const localePreferenceKey = 'codeagora.desktop.locale';
const themePreferenceKey = 'codeagora.desktop.theme';

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
  repoPath: string;
  repoInfo?: RepoInfo;
  repoInput: string;
  recentRepoPaths: string[];
  commandContract: DesktopCommandContract[];
  activeRun?: ReviewRunSnapshot;
  sessionSearch: string;
  sessionStatus: 'all' | SessionSummary['status'];
  sessionSort: 'date-desc' | 'date-asc' | 'decision' | 'severity';
  configRaw: string;
  configPath: string;
  configValidation?: ConfigValidation;
  configDirty: boolean;
  configOriginal: string;
  providers: ProviderStatus[];
  mcpStatus?: McpStatus;
  githubActionStatus?: GitHubActionStatus;
  evidenceStatus?: EvidenceStatus;
  notice?: string;
  toasts: Toast[];
  localePreference: DesktopLocalePreference;
  themePreference: DesktopThemePreference;
  busy: boolean;
}

const state: AppState = {
  view: 'sessions',
  sessions: [],
  repoPath: '',
  repoInput: '',
  recentRepoPaths: loadRecentRepoPaths(),
  commandContract: [],
  sessionSearch: '',
  sessionStatus: 'all',
  sessionSort: 'date-desc',
  configRaw: '',
  configPath: '.ca/config.json',
  configDirty: false,
  configOriginal: '',
  providers: [],
  localePreference: loadLocalePreference(),
  themePreference: loadThemePreference(),
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

function onThemeChange(): void {
  if (state.themePreference === 'system') applyDesktopTheme();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
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

  const target = event.target as HTMLElement;
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
  return configLocale(raw) ?? languages.map(normalizeLocale).find((locale): locale is DesktopLocale => Boolean(locale)) ?? 'en';
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
    result = result.filter((s) => s.id.toLowerCase().includes(q) || (s.decision ?? '').toLowerCase().includes(q));
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

function severityCount(source: SeveritySource, key: SeverityKey): number {
  return source.severityCounts?.[key] ?? 0;
}

function blockerCount(source: SeveritySource): number {
  return severityCount(source, 'HARSHLY_CRITICAL') + severityCount(source, 'CRITICAL');
}

function latestSession(): SessionSummary | undefined {
  return [...state.sessions].sort((a, b) => timestampValue(b.updatedAt) - timestampValue(a.updatedAt))[0];
}

function runReadiness(): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const repo = state.repoInfo;
  if (!repo) reasons.push(t('desktop.readiness.reason.repoUnknown'));
  if (repo && !repo.isGitRepo) reasons.push(t('desktop.readiness.reason.notGitRepo'));
  if (repo && !repo.trusted) reasons.push(repo.trustReason || t('desktop.readiness.reason.notTrusted'));
  if (repo && !repo.hasConfig) reasons.push(t('desktop.readiness.reason.configMissing'));
  if (state.configValidation?.valid === false) reasons.push(t('desktop.readiness.reason.configInvalid'));
  return { ready: reasons.length === 0, reasons };
}

function sessionHasDegradedSignal(session?: SessionDetail): boolean {
  return Boolean(session?.degraded || (session?.degradedReasons && session.degradedReasons.length > 0));
}

function runHasDegradedSignal(run?: ReviewRunSnapshot): boolean {
  if (!run) return false;
  return run.events.some((event) => /degraded/i.test(event.kind) || /degraded/i.test(event.message));
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

function setView(view: View): void {
  state.view = view;
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
    return 'auto';
  }
  return 'auto';
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

function announce(message: string): void {
  const announcer = document.getElementById('a11y-announcer')
  if (announcer) announcer.textContent = message
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
      state.toasts = state.toasts.filter((toast) => toast.id !== id)
      render()
    }, 250)
    return
  }
  state.toasts = state.toasts.filter((toast) => toast.id !== id)
  render()
}

async function refreshSessions(selectFirst = false): Promise<void> {
  state.busy = true;
  render();
  try {
    state.sessions = await listSessions();
    if (selectFirst && state.sessions[0]) {
      state.selected = await getSessionDetail(state.sessions[0].id);
    }
  } catch (error) {
    pushToast(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    state.busy = false;
    render();
  }
}

async function loadRepoInfo(): Promise<void> {
  try {
    state.repoInfo = await getRepoInfo();
    state.repoPath = state.repoInfo.path;
    document.title = repoSubtitle();
  } catch (error) {
    state.repoPath = error instanceof Error ? error.message : String(error);
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
    resetConfigState();
    await refreshSessions(true);
    await loadConfig();
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function loadCommandContract(): Promise<void> {
  try {
    state.commandContract = await getCommandContract();
  } catch (error) {
    pushToast(error instanceof Error ? error.message : String(error), 'error')
  }
  render();
}

async function loadSetup(): Promise<void> {
  state.busy = true;
  render();
  try {
    const [providers, mcp, githubAction, evidence] = await Promise.all([
      getProviderStatus(),
      getMcpStatus(),
      getGitHubActionStatus(),
      getEvidenceStatus(),
    ]);
    state.providers = providers;
    state.mcpStatus = mcp;
    state.githubActionStatus = githubAction;
    state.evidenceStatus = evidence;
  } catch (error) {
    pushToast(error instanceof Error ? error.message : String(error), 'error')
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
    state.configRaw = config.raw;
    state.configPath = config.path;
    state.configOriginal = config.raw;
    state.configDirty = false;
    applyDesktopLocale(config.raw);
    state.configValidation = await validateConfig(config.raw, config.path);
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
    pushToast(t('desktop.notice.savedConfig', { path: config.path }), 'success')
  } catch (error) {
    pushToast(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    state.busy = false;
    render();
  }
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
  const kinds = events.map((e) => e.kind);
  if (kinds.includes('completed')) return { stage: 'Verdict', percent: 100 };
  if (kinds.includes('l3')) return { stage: 'L3 Verdict', percent: 90 };
  if (kinds.includes('l2')) return { stage: 'L2 Debate', percent: 70 };
  if (kinds.includes('l1')) return { stage: 'L1 Review', percent: 40 };
  if (kinds.includes('l0')) return { stage: 'L0 Model Selection', percent: 20 };
  if (kinds.includes('started')) return { stage: 'Pre-analysis', percent: 10 };
  return { stage: 'Initializing', percent: 0 };
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
  brand.append(el('div', 'ca-brand-mark', 'CA'));
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
  const toolbar = el('header', 'ca-toolbar');
  const title = el('div');
  title.append(el('h1', '', viewTitle()));
  title.append(el('p', '', repoSubtitle()));
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

  preferences.append(localeControl, themeControl);
  actions.append(preferences);

  actions.append(button(t('desktop.action.refresh'), () => void refreshSessions(state.view === 'sessions' && !state.selected), 'ca-button', 'button-refresh'));
  const quickReview = button(t('desktop.action.quickReview'), () => void startReview(true), 'ca-button ca-primary', 'button-quick-review');
  quickReview.disabled = state.busy || !runReadiness().ready;
  actions.append(quickReview);
  toolbar.append(actions);
  return toolbar;
}

function viewTitle(): string {
  if (state.view === 'sessions') return t('desktop.title.cockpit');
  if (state.view === 'run') return t('desktop.title.launch');
  if (state.view === 'config') return t('desktop.title.config');
  return t('desktop.title.setup');
}

function repoSubtitle(): string {
  const repo = state.repoInfo;
  if (!repo) return state.repoPath || t('desktop.repo.loading');
  const branch = repo.branch ? ` · ${repo.branch}` : '';
  const head = repo.headSha ? ` @ ${repo.headSha}` : '';
  return `${repo.path}${branch}${head}`;
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
      render();
    }, 150);
  });
  if (state.sessionSearch) {
    const clearBtn = button('×', () => {
      state.sessionSearch = '';
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
    node.textContent = option === 'all' ? t('desktop.sessions.allStatuses') : option.replace('_', ' ');
    node.selected = state.sessionStatus === option;
    status.append(node);
  }
  status.addEventListener('change', () => {
    state.sessionStatus = status.value as AppState['sessionStatus'];
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
    render();
  });
  controls.append(search, status, sortSelect);
  listPanel.append(controls);

  const sessions = filteredSessions();
  const summary = el('div', 'ca-list-summary', t('desktop.sessions.visibleSummary', { visible: sessions.length, total: state.sessions.length }));
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
  for (const session of sessions) {
    const item = button('', () => {
      if (state.selected?.id === session.id) {
        state.selected = undefined
        render()
      } else {
        void selectSession(session.id)
      }
    }, state.selected?.id === session.id ? 'ca-session-row is-selected' : 'ca-session-row');
    item.dataset.testid = `session-row-${session.id.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
    const top = el('div', 'ca-session-row-top');
    top.append(el('strong', '', session.id));
    top.append(el('span', decisionClass(session.decision), session.decision ?? session.status));
    item.append(top);
    item.append(el('span', 'ca-session-meta', t('desktop.sessions.rowMeta', { blockers: blockerCount(session), findings: severityTotal(session), updated: formatTimestamp(session.updatedAt) })));
    listPanel.append(item);
  }
  layout.append(listPanel);
  layout.append(renderSessionDetail());
  wrapper.append(layout);
  return wrapper;
}

function renderCockpitOverview(): HTMLElement {
  const section = el('section', 'ca-cockpit-overview');
  section.dataset.testid = 'cockpit-overview';
  const latest = latestSession();
  const repo = state.repoInfo;
  const hero = el('div', 'ca-cockpit-hero');
  hero.append(el('span', 'ca-eyebrow', t('desktop.cockpit.eyebrow')));
  hero.append(el('span', 'ca-preview-chip', t('desktop.preview.privatePreview')));
  hero.append(el('h2', '', latest ? t('desktop.cockpit.latestVerdict', { verdict: latest.decision ?? latest.status }) : t('desktop.cockpit.readyTitle')));
  hero.append(el('p', '', latest?.reasoning ?? t('desktop.cockpit.readyBody')));
  const actions = el('div', 'ca-cockpit-actions');
  actions.append(button(t('desktop.action.runStagedReview'), () => setView('run'), 'ca-button ca-primary', 'button-run-staged-review'));
  actions.append(button(t('desktop.action.openRepository'), () => setView('run'), 'ca-button', 'button-open-repository'));
  actions.append(button(t('desktop.action.setupGuide'), () => {
    setView('setup');
    if (state.providers.length === 0) void loadSetup();
  }, 'ca-button ca-subtle', 'button-setup-guide'));
  hero.append(actions);
  section.append(hero);

  const metrics = el('div', 'ca-cockpit-metrics');
  appendMetric(metrics, t('desktop.metric.workspace'), repo?.trusted ? t('desktop.value.trusted') : t('desktop.value.needsTrust'), repo?.trusted ? 'ca-good' : 'ca-warn');
  appendMetric(metrics, t('desktop.metric.branch'), repo?.branch || t('desktop.value.unknown'));
  appendMetric(metrics, t('desktop.metric.dirtyFiles'), repo ? String(repo.dirtyFileCount) : '...');
  appendMetric(metrics, t('desktop.metric.sessions'), String(state.sessions.length));
  appendMetric(metrics, t('desktop.metric.currentBlockers'), latest ? String(blockerCount(latest)) : '0', latest && blockerCount(latest) > 0 ? 'ca-danger' : 'ca-good');
  appendMetric(metrics, t('desktop.metric.latestUpdated'), latest ? formatTimestamp(latest.updatedAt) : t('desktop.value.noSessions'));
  section.append(metrics);

  const links = el('div', 'ca-quick-links');
  links.append(button(t('desktop.action.refreshEvidence'), () => void refreshSessions(true), 'ca-button', 'button-refresh-evidence'));
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
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
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
    detail.append(empty);
    return detail;
  }

  const banner = el('div', `ca-verdict-banner ${selected.decision === 'REJECT' ? 'ca-danger' : selected.decision === 'ACCEPT' ? 'ca-good' : 'ca-warn'}`);
  const bannerText = el('div');
  bannerText.append(el('span', 'ca-eyebrow', t('desktop.detail.finalVerdict')));
  bannerText.append(el('h2', '', selected.decision ?? selected.status));
  bannerText.append(el('p', '', selected.reasoning ?? t('desktop.detail.noReasoning')));
  banner.append(bannerText);
  banner.append(el('span', decisionClass(selected.decision), selected.id));
  detail.append(banner);

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
    cell.append(el('span', '', key.replace('_', ' ')));
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
      row.append(el('span', 'ca-issue-severity', issue.severity));
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
    const report = el('pre', 'ca-report');
    report.textContent = selected.markdown;
    report.tabIndex = 0;
    report.setAttribute('aria-label', t('desktop.a11y.reportScrollable'));
    reportSection.append(summary, report);
    detail.append(reportSection);
  }
  return detail;
}

function renderRunReview(): HTMLElement {
  const panel = el('div', 'ca-run-panel');
  panel.dataset.testid = 'run-panel';
  const readiness = runReadiness();
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
  panel.append(readinessPanel);
  panel.append(renderRepositoryPicker());
  panel.append(renderRepoFacts());

  const actions = el('div', 'ca-launch-cards');
  const staged = launchCard(t('desktop.run.stagedTitle'), t('desktop.run.stagedEyebrow'), t('desktop.run.stagedBody'), true, () => void startReview(true), 'button-review-staged-changes');
  const working = launchCard(t('desktop.run.workingTitle'), t('desktop.run.workingEyebrow'), t('desktop.run.workingBody'), false, () => void startReview(false), 'button-review-working-tree');
  actions.append(staged, working);
  if (state.activeRun && isReviewRunning(state.activeRun)) {
    const cancel = button(t('desktop.action.cancelReview'), () => void cancelActiveReview(), 'ca-button ca-danger', 'button-cancel-review');
    actions.append(cancel);
  }
  panel.append(actions);
  panel.append(renderReviewRun());
  panel.append(renderCommandContract());
  return panel;
}

function launchCard(label: string, eyebrow: string, description: string, primary: boolean, onClick: () => void, testId: string): HTMLButtonElement {
  const node = el('button', primary ? 'ca-launch-card ca-primary' : 'ca-launch-card');
  node.type = 'button';
  node.dataset.testid = testId;
  node.disabled = state.busy || !runReadiness().ready;
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
    empty.append(button(t('desktop.action.startReview'), () => void startReview(true), 'ca-button ca-subtle'));
    section.append(empty);
    return section;
  }

  const summary = el('div', 'ca-review-run-summary');
  summary.append(el('span', statusClass(run.status), run.status));
  summary.append(el('strong', '', run.runId));
  summary.append(el('span', '', run.staged ? t('desktop.run.stagedDiff') : t('desktop.run.workingTreeDiff')));
  if (run.sessionId) summary.append(el('span', '', t('desktop.run.sessionLabel', { sessionId: run.sessionId })));
  section.append(summary);
  section.append(el('p', 'ca-repo-note', run.message));

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
    row.append(el('span', 'ca-event-kind', event.kind));
    row.append(el('span', '', event.message));
    row.append(el('time', '', formatTimestamp(event.timestamp)));
    events.append(row);
  }
  section.append(events);
  return section;
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
  section.append(button(t('desktop.action.openRepository'), () => void openRepo(input.value), 'ca-button ca-primary', 'button-open-repository'));

  if (state.recentRepoPaths.length > 0) {
    const recent = el('div', 'ca-recent-repos');
    recent.append(el('span', '', t('desktop.repo.recent')));
    for (const path of state.recentRepoPaths) {
      recent.append(button(path, () => void openRepo(path), 'ca-ghost ca-repo-chip'));
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

function renderCommandContract(): HTMLElement {
  const section = el('section', 'ca-command-contract');
  section.append(el('h3', '', t('desktop.command.title')));
  if (state.commandContract.length === 0) {
    section.append(el('p', 'ca-empty', t('desktop.command.notLoaded')));
    return section;
  }

  for (const item of state.commandContract) {
    const row = el('div', 'ca-command-row');
    const title = el('div');
    title.append(el('strong', '', item.name));
    title.append(el('span', '', item.notes));
    row.append(title);
    const flags = el('div', 'ca-command-flags');
    flags.append(el('span', 'ca-fact', item.classification));
    if (item.readsProject) flags.append(el('span', 'ca-fact', t('desktop.command.readsProject')));
    if (item.mutatesProject) flags.append(el('span', 'ca-fact ca-warn', t('desktop.command.mutatesProject')));
    if (item.spawnsProcess) flags.append(el('span', 'ca-fact ca-warn', t('desktop.command.spawnsProcess')));
    row.append(flags);
    section.append(row);
  }
  return section;
}

function renderConfig(): HTMLElement {
  const panel = el('div', 'ca-config-panel');
  panel.dataset.testid = 'config-panel';
  const header = el('div', 'ca-config-hero');
  header.append(el('span', 'ca-eyebrow', t('desktop.config.eyebrow')));
  header.append(el('h2', '', state.configPath));
  header.append(el('p', '', t('desktop.config.body')));
  panel.append(header);
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
  advanced.open = true;
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
  panel.append(advanced);

  const actions = el('div', 'ca-config-actions');
  actions.append(button(t('desktop.action.validateConfig'), () => void validateConfigEditor(textarea.value), 'ca-button', 'button-validate-config'));
  const saveButton = button(t('desktop.action.saveConfig'), () => void saveConfig(textarea.value), 'ca-button ca-primary', 'button-save-config');
  if (isYaml) {
    saveButton.disabled = true;
    saveButton.title = t('desktop.config.yamlReadOnlyBanner');
  }
  actions.append(saveButton);
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
  panel.append(el('p', 'ca-repo-note', t('desktop.next.privatePreviewNote')));
  return panel;
}

function renderConfigFacts(): HTMLElement {
  const facts = el('div', 'ca-config-facts ca-summary-cards');
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(state.configRaw) as Record<string, unknown>;
  } catch {
    appendMetric(facts, 'JSON', t('desktop.value.invalid'), 'ca-warn');
    appendMetric(facts, t('desktop.config.reviewers'), t('desktop.value.unknown'));
    appendMetric(facts, t('desktop.config.providers'), t('desktop.value.unknown'));
    return facts;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    appendMetric(facts, 'JSON', t('desktop.value.invalidShape'), 'ca-warn');
    appendMetric(facts, t('desktop.config.reviewers'), t('desktop.value.unknown'));
    appendMetric(facts, t('desktop.config.providers'), t('desktop.value.unknown'));
    return facts;
  }
  const language = typeof parsed.language === 'string' ? parsed.language : t('desktop.value.unset');
  const reviewers = Array.isArray(parsed.reviewers) ? parsed.reviewers.length : 0;
  const providers = Array.isArray(parsed.providers) ? parsed.providers.length : 0;
  appendMetric(facts, t('desktop.config.language'), language);
  appendMetric(facts, t('desktop.config.reviewers'), String(reviewers));
  appendMetric(facts, t('desktop.config.providers'), String(providers));
  appendMetric(facts, t('desktop.config.validation'), state.configValidation?.valid === false ? t('desktop.value.needsFixes') : t('desktop.value.ready'), state.configValidation?.valid === false ? 'ca-warn' : 'ca-good');
  return facts;
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
      const copyEnvBtn = button(t('desktop.action.copyEnvVar'), async () => {
        try {
          await navigator.clipboard.writeText(provider.envVar!);
          pushToast(t('desktop.toast.copied'), 'success');
        } catch {
          pushToast(t('desktop.toast.copyFailed'), 'error');
        }
      }, 'ca-button ca-button-ghost', 'button-copy-env');
      card.append(copyEnvBtn);
    }
    grid.append(card);
  }
  if (state.providers.length === 0) {
    const empty = el('div', 'ca-empty-state ca-compact');
    empty.append(el('strong', '', t('desktop.setup.providerStatusNotLoaded')));
    empty.append(el('p', '', t('desktop.setup.providerStatusHint')));
    empty.append(button(t('desktop.action.refreshSetup'), () => void loadSetup(), 'ca-button ca-subtle'));
    grid.append(empty);
  }
  panel.append(grid);

  const providerHint = el('p', 'ca-setup-hint', t('desktop.setup.providerHint'));
  panel.append(providerHint);

  panel.append(renderMcpSetup());
  panel.append(renderGitHubActionSetup());
  panel.append(renderEvidenceSetup());
  return panel;
}

function renderMcpSetup(): HTMLElement {
  const section = el('section', 'ca-integration-section');
  section.append(el('h3', '', t('desktop.setup.mcpServer')));
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
  const snippet = el('pre', 'ca-snippet');
  snippet.textContent = mcp.clientSnippet;
  section.append(snippet);
  return section;
}

function renderGitHubActionSetup(): HTMLElement {
  const section = el('section', 'ca-integration-section');
  section.append(el('h3', '', t('desktop.setup.githubAction')));
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
  const snippet = el('pre', 'ca-snippet');
  snippet.textContent = status.recommendedSnippet;
  section.append(snippet);
  return section;
}

function renderEvidenceSetup(): HTMLElement {
  const section = el('section', 'ca-integration-section');
  section.append(el('h3', '', t('desktop.setup.releaseEvidence')));
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
    if (existing) existing.remove()
    return
  }
  const container = existing ?? el('div', 'ca-toast-container')
  if (!existing) {
    container.id = 'ca-toast-container'
    appRoot.append(container)
  } else {
    container.replaceChildren()
  }
  for (const toast of state.toasts) {
    const node = el('div', `ca-toast ca-toast--${toast.type}`)
    node.id = toast.id
    node.append(el('span', '', toast.message))
    node.append(button(t('desktop.toast.dismiss'), () => removeToast(toast.id), 'ca-ghost', 'button-dismiss-toast'))
    container.append(node)
  }
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

  if (lastView !== state.view) {
    appRoot.replaceChildren(renderShell());
    lastView = state.view;
  } else {
    const content = appRoot.querySelector('.ca-content')
    if (content) {
      const newContent = renderContent()
      content.replaceChildren(...Array.from(newContent.childNodes))
    } else {
      appRoot.replaceChildren(renderShell());
    }
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
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', onThemeChange);
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
    void loadCommandContract();

    // Keyboard shortcuts (Tauri context only)
    if (IS_TAURI) {
      window.addEventListener('keydown', onKeyDown);
    }

    function cleanupListeners(): void {
      if (mediaQuery) mediaQuery.removeEventListener('change', onThemeChange);
      window.removeEventListener('keydown', onKeyDown);
    }
    window.addEventListener('beforeunload', cleanupListeners);
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
