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
  configRaw: string;
  configPath: string;
  configValidation?: ConfigValidation;
  providers: ProviderStatus[];
  mcpStatus?: McpStatus;
  githubActionStatus?: GitHubActionStatus;
  evidenceStatus?: EvidenceStatus;
  notice?: string;
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
  configRaw: '',
  configPath: '.ca/config.json',
  providers: [],
  localePreference: loadLocalePreference(),
  themePreference: loadThemePreference(),
  busy: false,
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');
const appRoot = app;
let reviewPollHandle: number | undefined;

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

function filteredSessions(): SessionSummary[] {
  const query = state.sessionSearch.trim().toLowerCase();
  return state.sessions.filter((session) => {
    if (state.sessionStatus !== 'all' && session.status !== state.sessionStatus) return false;
    if (!query) return true;
    const haystack = [
      session.id,
      session.status,
      session.decision,
      session.reasoning,
      session.dirPath,
      ...(session.topIssues ?? []).flatMap((issue) => [issue.title, issue.filePath, issue.severity]),
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

function decisionClass(decision?: string): string {
  if (decision === 'ACCEPT') return 'decision accept';
  if (decision === 'REJECT') return 'decision reject';
  if (decision === 'NEEDS_HUMAN') return 'decision human';
  return 'decision';
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
  const card = el('div', tone ? `metric-card ${tone}` : 'metric-card');
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

function button(label: string, onClick: () => void, className = 'button', testId?: string): HTMLButtonElement {
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

async function refreshSessions(selectFirst = false): Promise<void> {
  state.busy = true;
  render();
  try {
    state.sessions = await listSessions();
    if (selectFirst && state.sessions[0]) {
      state.selected = await getSessionDetail(state.sessions[0].id);
    }
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
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
  state.busy = true;
  state.notice = undefined;
  render();
  try {
    state.repoInfo = await openRepository(path);
    state.repoPath = state.repoInfo.path;
    state.repoInput = state.repoInfo.path;
    rememberRepoPath(state.repoInfo.path);
    state.selected = undefined;
    await refreshSessions(true);
    if (state.view === 'config') await loadConfig();
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
    state.notice = error instanceof Error ? error.message : String(error);
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
    state.notice = error instanceof Error ? error.message : String(error);
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
    state.notice = error instanceof Error ? error.message : String(error);
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
    applyDesktopLocale(config.raw);
    state.configValidation = await validateConfig(config.raw);
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function saveConfig(raw: string): Promise<void> {
  state.configRaw = raw;
  state.busy = true;
  render();
  try {
    state.configValidation = await validateConfig(raw);
    if (!state.configValidation.valid) {
      state.notice = t('desktop.notice.invalidConfig', { errors: state.configValidation.errors.join('; ') });
      return;
    }
    const config = await writeConfig(raw);
    state.configRaw = config.raw;
    state.configPath = config.path;
    applyDesktopLocale(config.raw);
    state.notice = t('desktop.notice.savedConfig', { path: config.path });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
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
    state.configValidation = await validateConfig(raw);
    state.notice = state.configValidation.valid ? t('desktop.notice.configValidates') : t('desktop.notice.configErrors');
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function startReview(staged: boolean): Promise<void> {
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
  state.notice = staged ? t('desktop.notice.startingStaged') : t('desktop.notice.startingWorkingTree');
  render();
  try {
    state.activeRun = await startReviewRun(staged);
    state.notice = state.activeRun.message;
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

function scheduleReviewPoll(): void {
  if (!state.activeRun || !isReviewRunning(state.activeRun)) return;
  if (reviewPollHandle !== undefined) window.clearTimeout(reviewPollHandle);
  reviewPollHandle = window.setTimeout(() => void pollReviewRun(), 700);
}

async function pollReviewRun(): Promise<void> {
  const runId = state.activeRun?.runId;
  if (!runId) return;
  try {
    state.activeRun = await getReviewRun(runId);
    if (isReviewRunning(state.activeRun)) {
      scheduleReviewPoll();
    } else {
      state.notice = state.activeRun.message;
      await refreshSessions(false);
    }
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    render();
  }
}

async function cancelActiveReview(): Promise<void> {
  const runId = state.activeRun?.runId;
  if (!runId) return;
  state.busy = true;
  render();
  try {
    state.activeRun = await cancelReviewRun(runId);
    state.notice = state.activeRun.message;
    scheduleReviewPoll();
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
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
    state.notice = t('desktop.notice.copiedExport', { fileName: output.fileName });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    render();
  }
}

function renderShell(): HTMLElement {
  const shell = el('div', 'shell');
  shell.dataset.testid = 'desktop-shell';
  const sidebar = el('aside', 'sidebar');
  const brand = el('div', 'brand');
  brand.append(el('div', 'brand-mark', 'CA'));
  const brandText = el('div');
  brandText.append(el('strong', '', 'CodeAgora'));
  brandText.append(el('span', '', t('desktop.brand.surface')));
  brand.append(brandText);
  sidebar.append(brand);

  const nav = el('nav', 'nav');
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
    }, state.view === view ? 'nav-button active' : 'nav-button', testId);
    nav.append(navButton);
  }
  sidebar.append(nav);
  shell.append(sidebar);

  const main = el('main', 'main');
  main.append(renderToolbar());
  main.append(renderContent());
  shell.append(main);
  return shell;
}

function renderToolbar(): HTMLElement {
  const toolbar = el('header', 'toolbar');
  const title = el('div');
  title.append(el('h1', '', viewTitle()));
  title.append(el('p', '', repoSubtitle()));
  toolbar.append(title);

  const actions = el('div', 'toolbar-actions');
  const preferences = el('div', 'toolbar-preferences');

  const localeControl = el('label', 'toolbar-select') as HTMLLabelElement;
  localeControl.append(el('span', 'toolbar-select-label', t('desktop.preferences.language')));
  const localeSelect = el('select', 'toolbar-select-input') as HTMLSelectElement;
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

  const themeControl = el('label', 'toolbar-select') as HTMLLabelElement;
  themeControl.append(el('span', 'toolbar-select-label', t('desktop.preferences.theme')));
  const themeSelect = el('select', 'toolbar-select-input') as HTMLSelectElement;
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

  actions.append(button(t('desktop.action.refresh'), () => void refreshSessions(state.view === 'sessions' && !state.selected), 'button', 'button-refresh'));
  const quickReview = button(t('desktop.action.quickReview'), () => void startReview(true), 'button primary', 'button-quick-review');
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
  const shell = el('div', 'skeleton-shell');
  if (view === 'sessions') {
    const sidebar = el('div', 'skeleton-sidebar');
    sidebar.append(el('div', 'skeleton skeleton-title'));
    sidebar.append(el('div', 'skeleton skeleton-text'));
    sidebar.append(el('div', 'skeleton-sidebar-nav'));
    sidebar.append(el('div', 'skeleton skeleton-nav-item'));
    sidebar.append(el('div', 'skeleton skeleton-nav-item'));
    sidebar.append(el('div', 'skeleton skeleton-nav-item'));
    sidebar.append(el('div', 'skeleton skeleton-nav-item'));
    shell.append(sidebar);
    const main = el('div', 'skeleton-main');
    main.append(el('div', 'skeleton skeleton-title'));
    main.append(el('div', 'skeleton skeleton-text'));
    main.append(el('div', 'skeleton-grid'));
    main.append(el('div', 'skeleton skeleton-cell'));
    main.append(el('div', 'skeleton skeleton-cell'));
    shell.append(main);
  } else {
    const main = el('div', 'skeleton-main');
    main.append(el('div', 'skeleton skeleton-title'));
    main.append(el('div', 'skeleton skeleton-text'));
    main.append(el('div', 'skeleton skeleton-card'));
    main.append(el('div', 'skeleton skeleton-card'));
    main.append(el('div', 'skeleton skeleton-card'));
    shell.append(main);
  }
  return shell;
}

function renderContent(): HTMLElement {
  const content = el('section', 'content');
  content.dataset.testid = `view-${state.view}`;
  if (state.notice) {
    const notice = el('div', 'notice', state.notice);
    notice.append(button(t('desktop.action.dismiss'), () => {
      state.notice = undefined;
      render();
    }, 'ghost', 'button-dismiss'));
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
  const wrapper = el('div', 'cockpit-page');
  wrapper.append(renderCockpitOverview());

  const layout = el('div', 'sessions-layout');
  layout.dataset.testid = 'sessions-layout';
  const listPanel = el('div', 'session-list');
  const listHeader = el('div', 'panel-heading');
  listHeader.append(el('span', 'eyebrow', t('desktop.sessions.historyEyebrow')));
  listHeader.append(el('h2', '', t('desktop.sessions.recentTitle')));
  listPanel.append(listHeader);

  const controls = el('div', 'session-controls');
  const search = el('input', 'filter-input') as HTMLInputElement;
  search.dataset.testid = 'session-filter-input';
  search.type = 'search';
  search.placeholder = t('desktop.sessions.filterPlaceholder');
  search.setAttribute('aria-label', t('desktop.sessions.filterAria'));
  search.value = state.sessionSearch;
  search.addEventListener('input', () => {
    state.sessionSearch = search.value;
    render();
  });
  const status = el('select', 'filter-select') as HTMLSelectElement;
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
  controls.append(search, status);
  listPanel.append(controls);

  const sessions = filteredSessions();
  const summary = el('div', 'list-summary', t('desktop.sessions.visibleSummary', { visible: sessions.length, total: state.sessions.length }));
  listPanel.append(summary);
  if (state.sessions.length === 0) {
    const empty = el('div', 'empty-state padded');
    empty.append(el('strong', '', t('desktop.sessions.emptyTitle')));
    empty.append(el('p', '', t('desktop.sessions.emptyBody')));
    empty.append(button(t('desktop.action.startReview'), () => setView('run'), 'button primary', 'button-start-review'));
    listPanel.append(empty);
  } else if (sessions.length === 0) {
    listPanel.append(el('p', 'empty padded', t('desktop.sessions.noFilterMatch')));
  }
  for (const session of sessions) {
    const item = button('', () => void selectSession(session.id), state.selected?.id === session.id ? 'session-row selected' : 'session-row');
    item.dataset.testid = `session-row-${session.id.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
    const top = el('div', 'session-row-top');
    top.append(el('strong', '', session.id));
    top.append(el('span', decisionClass(session.decision), session.decision ?? session.status));
    item.append(top);
    item.append(el('span', 'session-meta', t('desktop.sessions.rowMeta', { blockers: blockerCount(session), findings: severityTotal(session), updated: formatTimestamp(session.updatedAt) })));
    listPanel.append(item);
  }
  layout.append(listPanel);
  layout.append(renderSessionDetail());
  wrapper.append(layout);
  return wrapper;
}

function renderCockpitOverview(): HTMLElement {
  const section = el('section', 'cockpit-overview');
  section.dataset.testid = 'cockpit-overview';
  const latest = latestSession();
  const repo = state.repoInfo;
  const hero = el('div', 'cockpit-hero');
  hero.append(el('span', 'eyebrow', t('desktop.cockpit.eyebrow')));
  hero.append(el('span', 'preview-chip', t('desktop.preview.privatePreview')));
  hero.append(el('h2', '', latest ? t('desktop.cockpit.latestVerdict', { verdict: latest.decision ?? latest.status }) : t('desktop.cockpit.readyTitle')));
  hero.append(el('p', '', latest?.reasoning ?? t('desktop.cockpit.readyBody')));
  const actions = el('div', 'cockpit-actions');
  actions.append(button(t('desktop.action.runStagedReview'), () => setView('run'), 'button primary', 'button-run-staged-review'));
  actions.append(button(t('desktop.action.openRepository'), () => setView('run'), 'button', 'button-open-repository'));
  actions.append(button(t('desktop.action.setupGuide'), () => {
    setView('setup');
    if (state.providers.length === 0) void loadSetup();
  }, 'button subtle', 'button-setup-guide'));
  hero.append(actions);
  section.append(hero);

  const metrics = el('div', 'cockpit-metrics');
  appendMetric(metrics, t('desktop.metric.workspace'), repo?.trusted ? t('desktop.value.trusted') : t('desktop.value.needsTrust'), repo?.trusted ? 'good' : 'warn');
  appendMetric(metrics, t('desktop.metric.branch'), repo?.branch || t('desktop.value.unknown'));
  appendMetric(metrics, t('desktop.metric.dirtyFiles'), repo ? String(repo.dirtyFileCount) : '...');
  appendMetric(metrics, t('desktop.metric.sessions'), String(state.sessions.length));
  appendMetric(metrics, t('desktop.metric.currentBlockers'), latest ? String(blockerCount(latest)) : '0', latest && blockerCount(latest) > 0 ? 'danger' : 'good');
  appendMetric(metrics, t('desktop.metric.latestUpdated'), latest ? formatTimestamp(latest.updatedAt) : t('desktop.value.noSessions'));
  section.append(metrics);

  const links = el('div', 'quick-links');
  links.append(button(t('desktop.action.refreshEvidence'), () => void refreshSessions(true), 'button', 'button-refresh-evidence'));
  links.append(button(t('desktop.nav.config'), () => {
    setView('config');
    if (!state.configRaw) void loadConfig();
  }, 'button', 'button-cockpit-config'));
  links.append(button(t('desktop.nav.setup'), () => {
    setView('setup');
    if (state.providers.length === 0) void loadSetup();
  }, 'button', 'button-cockpit-setup'));
  section.append(links);
  return section;
}

function formatTimestamp(value?: string): string {
  if (!value) return t('desktop.value.noTimestamp');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function renderSessionDetail(): HTMLElement {
  const detail = el('article', 'detail insight-panel');
  detail.dataset.testid = 'session-detail';
  const selected = state.selected;
  if (!selected) {
    const empty = el('div', 'empty-state');
    empty.append(el('span', 'eyebrow', t('desktop.detail.eyebrow')));
    empty.append(el('h2', '', t('desktop.detail.emptyTitle')));
    empty.append(el('p', '', t('desktop.detail.emptyBody')));
    detail.append(empty);
    return detail;
  }

  const banner = el('div', `verdict-banner ${selected.decision === 'REJECT' ? 'danger' : selected.decision === 'ACCEPT' ? 'good' : 'warn'}`);
  const bannerText = el('div');
  bannerText.append(el('span', 'eyebrow', t('desktop.detail.finalVerdict')));
  bannerText.append(el('h2', '', selected.decision ?? selected.status));
  bannerText.append(el('p', '', selected.reasoning ?? t('desktop.detail.noReasoning')));
  banner.append(bannerText);
  banner.append(el('span', decisionClass(selected.decision), selected.id));
  detail.append(banner);

  const meta = el('div', 'detail-meta');
  meta.append(el('span', '', selected.dirPath ?? '.ca/sessions'));
  meta.append(el('span', '', t('desktop.detail.updated', { updated: formatTimestamp(selected.updatedAt) })));
  meta.append(el('span', '', t('desktop.detail.evidenceDocs', { count: selected.evidenceCount ?? 0 })));
  meta.append(el('span', '', t('desktop.detail.discussionFiles', { count: selected.discussionsCount ?? 0 })));
  detail.append(meta);

  const counts = selected.severityCounts ?? {};
  const countGrid = el('div', 'count-grid');
  for (const key of ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION'] as const) {
    const cell = el('div', key === 'HARSHLY_CRITICAL' || key === 'CRITICAL' ? 'count-cell danger' : 'count-cell');
    cell.append(el('span', '', key.replace('_', ' ')));
    cell.append(el('strong', '', String(counts[key] ?? 0)));
    countGrid.append(cell);
  }
  detail.append(countGrid);

  const evidence = el('section', 'evidence-board');
  evidence.append(el('h3', '', t('desktop.detail.consensusEvidence')));
  const evidenceGrid = el('div', 'evidence-grid');
  appendMetric(evidenceGrid, t('desktop.detail.evidenceDocsLabel'), String(selected.evidenceCount ?? 0));
  appendMetric(evidenceGrid, t('desktop.detail.debateFilesLabel'), String(selected.discussionsCount ?? 0));
  appendMetric(evidenceGrid, t('desktop.detail.exportFormats'), 'Markdown · JSON · SARIF');
  appendMetric(evidenceGrid, t('desktop.detail.costLabel'), selected.costSummary?.known ? selected.costSummary.formattedTotalCost : t('desktop.detail.costUnknown'));
  appendMetric(evidenceGrid, t('desktop.detail.callsLabel'), String(selected.costSummary?.callCount ?? 0));
  appendMetric(evidenceGrid, t('desktop.detail.tokensLabel'), selected.costSummary?.totalTokens !== undefined ? String(selected.costSummary.totalTokens) : t('desktop.value.unknown'));
  evidence.append(evidenceGrid);
  detail.append(evidence);

  if (sessionHasDegradedSignal(selected)) {
    const degraded = el('section', 'degraded-signal');
    degraded.dataset.testid = 'session-degraded-signal';
    degraded.append(el('h3', '', t('desktop.degraded.title')));
    degraded.append(el('p', '', t('desktop.degraded.sessionBody')));
    if (selected.degradedReasons && selected.degradedReasons.length > 0) {
      const reasons = el('ul', 'degraded-reasons');
      for (const reason of selected.degradedReasons) {
        reasons.append(el('li', '', reason));
      }
      degraded.append(reasons);
    }
    detail.append(degraded);
  }

  const issues = el('div', 'issues');
  const findings = selected.findings?.length ? selected.findings : selected.topIssues ?? [];
  issues.append(el('h3', '', t('desktop.detail.findingsToTriage', { count: findings.length })));
  if (findings.length === 0) {
    issues.append(el('p', 'empty', t('desktop.detail.noFindings')));
  } else {
    for (const issue of findings) {
      const row = el('div', 'issue-row issue-card');
      const confidence = issue.confidence === undefined ? t('desktop.detail.confidenceUnavailable') : t('desktop.detail.confidencePercent', { confidence: Math.round(issue.confidence) });
      row.append(el('span', 'issue-severity', issue.severity));
      row.append(el('strong', '', issue.title));
      row.append(el('span', '', `${issue.filePath}:${issue.lineRange[0]} · ${confidence}`));
      issues.append(row);
    }
  }
  detail.append(issues);

  const exportGuide = el('p', 'repo-note', t('desktop.detail.exportGuidance'));
  detail.append(exportGuide);

  const exports = el('div', 'export-actions');
  exports.append(button(t('desktop.action.copyMarkdown'), () => void exportSelected('markdown'), 'button', 'button-copy-markdown'));
  exports.append(button(t('desktop.action.copyJson'), () => void exportSelected('json'), 'button', 'button-copy-json'));
  exports.append(button(t('desktop.action.copySarif'), () => void exportSelected('sarif'), 'button', 'button-copy-sarif'));
  detail.append(exports);

  const nextAction = renderNextActionPanel(selected);
  detail.append(nextAction);

  if (selected.markdown) {
    const reportSection = el('details', 'report-shell') as HTMLDetailsElement;
    const summary = el('summary', '', t('desktop.detail.rawReportPreview'));
    const report = el('pre', 'report');
    report.textContent = selected.markdown;
    reportSection.append(summary, report);
    detail.append(reportSection);
  }
  return detail;
}

function renderRunReview(): HTMLElement {
  const panel = el('div', 'run-panel');
  panel.dataset.testid = 'run-panel';
  const readiness = runReadiness();
  const intro = el('div', 'launch-intro');
  intro.append(el('span', 'eyebrow', t('desktop.run.eyebrow')));
  intro.append(el('h2', '', t('desktop.run.title')));
  intro.append(el('p', '', t('desktop.run.body')));
  panel.append(intro);

  const readinessPanel = el('section', readiness.ready ? 'readiness-panel ready' : 'readiness-panel blocked');
  readinessPanel.dataset.testid = 'run-readiness';
  readinessPanel.append(el('h3', '', readiness.ready ? t('desktop.readiness.readyTitle') : t('desktop.readiness.blockedTitle')));
  readinessPanel.append(el('p', '', readiness.ready ? t('desktop.readiness.readyBody') : t('desktop.readiness.blockedBody')));
  if (readiness.reasons.length > 0) {
    const list = el('ul', 'readiness-reasons');
    for (const reason of readiness.reasons) {
      list.append(el('li', '', reason));
    }
    readinessPanel.append(list);
  }
  panel.append(readinessPanel);
  panel.append(renderRepositoryPicker());
  panel.append(renderRepoFacts());

  const actions = el('div', 'launch-cards');
  const staged = launchCard(t('desktop.run.stagedTitle'), t('desktop.run.stagedEyebrow'), t('desktop.run.stagedBody'), true, () => void startReview(true), 'button-review-staged-changes');
  const working = launchCard(t('desktop.run.workingTitle'), t('desktop.run.workingEyebrow'), t('desktop.run.workingBody'), false, () => void startReview(false), 'button-review-working-tree');
  actions.append(staged, working);
  if (state.activeRun && isReviewRunning(state.activeRun)) {
    const cancel = button(t('desktop.action.cancelReview'), () => void cancelActiveReview(), 'button danger', 'button-cancel-review');
    actions.append(cancel);
  }
  panel.append(actions);
  panel.append(renderReviewRun());
  panel.append(renderCommandContract());
  return panel;
}

function launchCard(label: string, eyebrow: string, description: string, primary: boolean, onClick: () => void, testId: string): HTMLButtonElement {
  const node = el('button', primary ? 'launch-card primary' : 'launch-card');
  node.type = 'button';
  node.dataset.testid = testId;
  node.disabled = state.busy || !runReadiness().ready;
  node.addEventListener('click', onClick);
  node.append(el('span', 'eyebrow', eyebrow));
  node.append(el('strong', '', label));
  node.append(el('span', '', description));
  return node;
}

function renderReviewRun(): HTMLElement {
  const run = state.activeRun;
  const section = el('section', 'review-run');
  section.dataset.testid = 'review-run';
  section.append(el('h3', '', t('desktop.run.timelineTitle')));
  if (runHasDegradedSignal(run)) {
    const degraded = el('div', 'degraded-signal');
    degraded.dataset.testid = 'review-degraded-signal';
    degraded.append(el('strong', '', t('desktop.degraded.title')));
    degraded.append(el('p', '', t('desktop.degraded.runBody')));
    section.append(degraded);
  }
  if (!run) {
    const empty = el('div', 'empty-state compact');
    empty.append(el('strong', '', t('desktop.run.noActiveTitle')));
    empty.append(el('p', '', t('desktop.run.noActiveBody')));
    empty.append(button(t('desktop.action.startReview'), () => void startReview(true), 'button subtle'));
    section.append(empty);
    return section;
  }

  const summary = el('div', 'review-run-summary');
  summary.append(el('span', statusClass(run.status), run.status));
  summary.append(el('strong', '', run.runId));
  summary.append(el('span', '', run.staged ? t('desktop.run.stagedDiff') : t('desktop.run.workingTreeDiff')));
  if (run.sessionId) summary.append(el('span', '', t('desktop.run.sessionLabel', { sessionId: run.sessionId })));
  section.append(summary);
  section.append(el('p', 'repo-note', run.message));

  const events = el('div', 'event-list timeline');
  for (const event of run.events.slice(-12).reverse()) {
    const row = el('div', 'event-row');
    row.append(el('span', 'event-dot', ''));
    row.append(el('span', 'event-kind', event.kind));
    row.append(el('span', '', event.message));
    row.append(el('time', '', formatTimestamp(event.timestamp)));
    events.append(row);
  }
  section.append(events);
  return section;
}

function statusClass(status: string): string {
  if (status === 'completed') return 'run-status complete';
  if (status === 'failed') return 'run-status failed';
  if (status === 'cancelled' || status === 'cancelling') return 'run-status cancelled';
  return 'run-status running';
}

function renderRepositoryPicker(): HTMLElement {
  const section = el('section', 'repo-picker');
  const input = el('input', 'repo-path-input') as HTMLInputElement;
  input.dataset.testid = 'repo-path-input';
  input.type = 'text';
  input.placeholder = t('desktop.repo.pathPlaceholder');
  input.setAttribute('aria-label', t('desktop.repo.pathAria'));
  input.value = state.repoInput || state.repoPath;
  input.addEventListener('input', () => {
    state.repoInput = input.value;
  });
  section.append(input);
  section.append(button(t('desktop.action.openRepository'), () => void openRepo(input.value), 'button primary', 'button-open-repository'));

  if (state.recentRepoPaths.length > 0) {
    const recent = el('div', 'recent-repos');
    recent.append(el('span', '', t('desktop.repo.recent')));
    for (const path of state.recentRepoPaths) {
      recent.append(button(path, () => void openRepo(path), 'ghost repo-chip'));
    }
    section.append(recent);
  }
  return section;
}

function renderRepoFacts(): HTMLElement {
  const repo = state.repoInfo;
  const grid = el('div', 'repo-grid');
  if (!repo) {
    grid.append(el('div', 'repo-card', t('desktop.repo.loadingState')));
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
    const card = el('div', healthy === false ? 'repo-card warn' : 'repo-card');
    card.append(el('span', '', label));
    card.append(el('strong', '', value));
    grid.append(card);
  }

  const trust = el('p', repo.trusted ? 'repo-note' : 'repo-note warn', repo.trustReason);
  const wrapper = el('div', 'repo-section');
  wrapper.append(grid, trust);
  return wrapper;
}

function renderCommandContract(): HTMLElement {
  const section = el('section', 'command-contract');
  section.append(el('h3', '', t('desktop.command.title')));
  if (state.commandContract.length === 0) {
    section.append(el('p', 'empty', t('desktop.command.notLoaded')));
    return section;
  }

  for (const item of state.commandContract) {
    const row = el('div', 'command-row');
    const title = el('div');
    title.append(el('strong', '', item.name));
    title.append(el('span', '', item.notes));
    row.append(title);
    const flags = el('div', 'command-flags');
    flags.append(el('span', 'fact', item.classification));
    if (item.readsProject) flags.append(el('span', 'fact', t('desktop.command.readsProject')));
    if (item.mutatesProject) flags.append(el('span', 'fact warn', t('desktop.command.mutatesProject')));
    if (item.spawnsProcess) flags.append(el('span', 'fact warn', t('desktop.command.spawnsProcess')));
    row.append(flags);
    section.append(row);
  }
  return section;
}

function renderConfig(): HTMLElement {
  const panel = el('div', 'config-panel');
  panel.dataset.testid = 'config-panel';
  const header = el('div', 'config-hero');
  header.append(el('span', 'eyebrow', t('desktop.config.eyebrow')));
  header.append(el('h2', '', state.configPath));
  header.append(el('p', '', t('desktop.config.body')));
  panel.append(header);
  panel.append(renderConfigFacts());
  panel.append(renderConfigValidation());

  const advanced = el('details', 'advanced-config') as HTMLDetailsElement;
  advanced.open = true;
  advanced.append(el('summary', '', t('desktop.config.advancedEditor')));
  const textarea = el('textarea', 'config-editor') as HTMLTextAreaElement;
  textarea.dataset.testid = 'config-editor';
  textarea.setAttribute('aria-label', t('desktop.config.editorAria'));
  textarea.value = state.configRaw;
  textarea.addEventListener('input', () => {
    state.configRaw = textarea.value;
  });
  advanced.append(textarea);
  panel.append(advanced);

  const actions = el('div', 'config-actions');
  actions.append(button(t('desktop.action.validateConfig'), () => void validateConfigEditor(textarea.value), 'button', 'button-validate-config'));
  actions.append(button(t('desktop.action.saveConfig'), () => void saveConfig(textarea.value), 'button primary', 'button-save-config'));
  panel.append(actions);
  return panel;
}

function renderConfigValidation(): HTMLElement {
  const validation = state.configValidation;
  const panel = el('div', validation?.valid === false ? 'validation-panel invalid' : 'validation-panel');
  if (!validation) {
    panel.append(el('p', 'empty', t('desktop.config.notValidated')));
    return panel;
  }
  panel.append(el('strong', '', validation.valid ? t('desktop.config.valid') : t('desktop.config.invalid')));
  for (const error of validation.errors) {
    panel.append(el('span', 'validation-error', error));
  }
  for (const warning of validation.warnings) {
    panel.append(el('span', 'validation-warning', warning));
  }
  if (validation.errors.length === 0 && validation.warnings.length === 0) {
    panel.append(el('span', 'validation-ok', t('desktop.config.noErrorsOrWarnings')));
  }
  return panel;
}

function renderNextActionPanel(selected: SessionDetail): HTMLElement {
  const panel = el('section', 'next-action-panel');
  panel.dataset.testid = 'next-action-panel';
  panel.append(el('h3', '', t('desktop.next.title')));

  const list = el('ol', 'next-action-list');
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
  panel.append(el('p', 'repo-note', t('desktop.next.privatePreviewNote')));
  return panel;
}

function renderConfigFacts(): HTMLElement {
  const facts = el('div', 'config-facts summary-cards');
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(state.configRaw) as Record<string, unknown>;
  } catch {
    appendMetric(facts, 'JSON', t('desktop.value.invalid'), 'warn');
    appendMetric(facts, t('desktop.config.reviewers'), t('desktop.value.unknown'));
    appendMetric(facts, t('desktop.config.providers'), t('desktop.value.unknown'));
    return facts;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    appendMetric(facts, 'JSON', t('desktop.value.invalidShape'), 'warn');
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
  appendMetric(facts, t('desktop.config.validation'), state.configValidation?.valid === false ? t('desktop.value.needsFixes') : t('desktop.value.ready'), state.configValidation?.valid === false ? 'warn' : 'good');
  return facts;
}

function renderSetup(): HTMLElement {
  const panel = el('div', 'setup-panel');
  panel.dataset.testid = 'setup-panel';
  const header = el('div', 'section-head setup-hero');
  const copy = el('div');
  copy.append(el('span', 'eyebrow', t('desktop.setup.eyebrow')));
  copy.append(el('h2', '', t('desktop.setup.title')));
  copy.append(el('p', '', t('desktop.setup.body')));
  header.append(copy);
  header.append(button(t('desktop.action.refreshSetup'), () => void loadSetup(), 'button', 'button-refresh-setup'));
  panel.append(header);

  const grid = el('div', 'provider-grid');
  for (const provider of state.providers) {
    const card = el('div', provider.configured ? 'provider-card configured checklist-card' : 'provider-card checklist-card');
    const top = el('div', 'provider-card-top');
    top.append(el('span', provider.configured ? 'check-dot good status-pill' : 'check-dot optional status-pill', provider.configured ? t('desktop.value.ready') : t('desktop.value.optional')));
    top.append(el('span', 'provider-kind status-pill neutral', provider.kind));
    card.append(top);
    card.append(el('strong', '', provider.name));
    const status = provider.configured ? t('desktop.setup.configured') : t('desktop.setup.notConfigured');
    card.append(el('span', provider.configured ? 'provider-ok status-pill' : 'provider-missing optional status-pill', status));
    if (provider.envVar) card.append(el('span', 'provider-meta', `${provider.envVar} ${provider.redactedValue ?? ''}`.trim()));
    if (provider.binary) card.append(el('span', 'provider-meta', provider.binary));
    grid.append(card);
  }
  if (state.providers.length === 0) {
    const empty = el('div', 'empty-state compact');
    empty.append(el('strong', '', t('desktop.setup.providerStatusNotLoaded')));
    empty.append(el('p', '', t('desktop.setup.providerStatusHint')));
    empty.append(button(t('desktop.action.refreshSetup'), () => void loadSetup(), 'button subtle'));
    grid.append(empty);
  }
  panel.append(grid);
  panel.append(renderMcpSetup());
  panel.append(renderGitHubActionSetup());
  panel.append(renderEvidenceSetup());
  return panel;
}

function renderMcpSetup(): HTMLElement {
  const section = el('section', 'integration-section');
  section.append(el('h3', '', t('desktop.setup.mcpServer')));
  const mcp = state.mcpStatus;
  if (!mcp) {
    section.append(el('p', 'empty', t('desktop.setup.mcpNotLoaded')));
    return section;
  }
  section.append(el('p', 'repo-note', mcp.command));
  const tools = el('div', 'tool-list');
  for (const tool of mcp.tools) {
    tools.append(el('span', 'fact', tool));
  }
  section.append(tools);
  const snippet = el('pre', 'snippet');
  snippet.textContent = mcp.clientSnippet;
  section.append(snippet);
  return section;
}

function renderGitHubActionSetup(): HTMLElement {
  const section = el('section', 'integration-section');
  section.append(el('h3', '', t('desktop.setup.githubAction')));
  const status = state.githubActionStatus;
  if (!status) {
    section.append(el('p', 'empty', t('desktop.setup.githubActionNotLoaded')));
    return section;
  }
  section.append(el('p', 'repo-note', t('desktop.setup.workflowSummary', { codeagora: status.codeagoraWorkflowCount, workflows: status.workflowCount })));
  for (const workflow of status.workflows) {
    const row = el('div', 'workflow-row');
    row.append(el('strong', 'workflow-path', workflow.path));
    const flags = el('div', 'workflow-flags');
    flags.append(el('span', workflow.mentionsCodeagora ? 'provider-ok status-pill' : 'provider-missing status-pill', workflow.mentionsCodeagora ? 'CodeAgora' : t('desktop.setup.noCodeAgora')));
    flags.append(el('span', workflow.hasPullRequestTrigger ? 'provider-ok status-pill' : 'provider-missing status-pill', workflow.hasPullRequestTrigger ? t('desktop.setup.prTrigger') : t('desktop.setup.noPrTrigger')));
    flags.append(el('span', workflow.hasPermissions ? 'provider-ok status-pill' : 'provider-missing status-pill', workflow.hasPermissions ? t('desktop.setup.permissions') : t('desktop.setup.permissionsMissing')));
    flags.append(el('span', workflow.hasConfigPath ? 'provider-ok status-pill' : 'provider-kind status-pill neutral', workflow.hasConfigPath ? 'config-path' : t('desktop.setup.defaultConfig')));
    row.append(flags);
    section.append(row);
  }
  const snippet = el('pre', 'snippet');
  snippet.textContent = status.recommendedSnippet;
  section.append(snippet);
  return section;
}

function renderEvidenceSetup(): HTMLElement {
  const section = el('section', 'integration-section');
  section.append(el('h3', '', t('desktop.setup.releaseEvidence')));
  const evidence = state.evidenceStatus;
  if (!evidence) {
    section.append(el('p', 'empty', t('desktop.setup.evidenceNotLoaded')));
    return section;
  }
  const rows: Array<[string, boolean, string | undefined]> = [
    [t('desktop.setup.releaseEvidence'), evidence.hasReleaseEvidence, evidence.releaseEvidencePath],
    [t('desktop.setup.liveBenchmarkReport'), evidence.hasBenchmarkReport, evidence.benchmarkReportPath],
    [t('desktop.setup.evidenceManifest'), evidence.hasEvidenceManifest, evidence.evidenceManifestPath],
  ];
  for (const [label, present, path] of rows) {
    const row = el('div', 'evidence-row');
    row.append(el('strong', '', label));
    row.append(el('span', present ? 'provider-ok' : 'provider-missing', present ? t('desktop.value.present') : t('desktop.value.missing')));
    row.append(el('span', '', path ?? t('desktop.value.notFound')));
    section.append(row);
  }
  return section;
}

function render(): void {
  appRoot.replaceChildren(renderShell());
}

async function bootstrap(): Promise<void> {
  applyDesktopTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.themePreference === 'system') applyDesktopTheme();
  });
  applyDesktopLocale();
  try {
    const config = await readConfig();
    state.configRaw = config.raw;
    state.configPath = config.path;
    applyDesktopLocale(config.raw);
    state.configValidation = await validateConfig(config.raw);
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  }
  render();
  void refreshSessions(true);
  void loadRepoInfo();
  void loadCommandContract();

  // Keyboard shortcuts (Tauri context only)
  if (IS_TAURI) {
    document.addEventListener('keydown', (event) => {
      // Don't activate shortcuts while typing in input/textarea
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
    });
  }
}

void bootstrap();
