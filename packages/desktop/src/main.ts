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

const recentReposKey = 'codeagora.desktop.recentRepos';

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
  busy: false,
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');
const appRoot = app;
let reviewPollHandle: number | undefined;

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

function button(label: string, onClick: () => void, className = 'button'): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
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
    state.configValidation = await validateConfig(config.raw);
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function saveConfig(raw: string): Promise<void> {
  state.busy = true;
  render();
  try {
    state.configValidation = await validateConfig(raw);
    if (!state.configValidation.valid) {
      state.notice = `Invalid config: ${state.configValidation.errors.join('; ')}`;
      return;
    }
    const config = await writeConfig(raw);
    state.configRaw = config.raw;
    state.configPath = config.path;
    state.notice = `Saved ${config.path}`;
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function validateConfigEditor(raw: string): Promise<void> {
  state.busy = true;
  render();
  try {
    state.configValidation = await validateConfig(raw);
    state.notice = state.configValidation.valid ? 'Config validates.' : 'Config has validation errors.';
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function startReview(staged: boolean): Promise<void> {
  if (state.repoInfo && !state.repoInfo.trusted) {
    state.notice = state.repoInfo.trustReason;
    render();
    return;
  }
  if (state.activeRun && isReviewRunning(state.activeRun)) {
    state.notice = `Review already running: ${state.activeRun.runId}`;
    render();
    return;
  }
  state.busy = true;
  state.notice = staged ? 'Starting staged review...' : 'Starting working tree review...';
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
    state.notice = `Copied ${output.fileName} to clipboard.`;
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    render();
  }
}

function renderShell(): HTMLElement {
  const shell = el('div', 'shell');
  const sidebar = el('aside', 'sidebar');
  const brand = el('div', 'brand');
  brand.append(el('div', 'brand-mark', 'CA'));
  const brandText = el('div');
  brandText.append(el('strong', '', 'CodeAgora'));
  brandText.append(el('span', '', 'Desktop'));
  brand.append(brandText);
  sidebar.append(brand);

  const nav = el('nav', 'nav');
  const navItems: Array<[View, string]> = [
    ['sessions', 'Sessions'],
    ['run', 'Run Review'],
    ['config', 'Config'],
    ['setup', 'Setup'],
  ];
  for (const [view, label] of navItems) {
    nav.append(button(label, () => {
      setView(view);
      if (view === 'config' && !state.configRaw) void loadConfig();
      if (view === 'setup' && state.providers.length === 0) void loadSetup();
    }, state.view === view ? 'nav-button active' : 'nav-button'));
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
  actions.append(button('Refresh', () => void refreshSessions(state.view === 'sessions' && !state.selected)));
  actions.append(button('Quick Review', () => void startReview(true), 'button primary'));
  toolbar.append(actions);
  return toolbar;
}

function viewTitle(): string {
  if (state.view === 'sessions') return 'Review Sessions';
  if (state.view === 'run') return 'Run Review';
  if (state.view === 'config') return 'Configuration';
  return 'Setup';
}

function repoSubtitle(): string {
  const repo = state.repoInfo;
  if (!repo) return state.repoPath || 'Loading repository...';
  const branch = repo.branch ? ` · ${repo.branch}` : '';
  const head = repo.headSha ? ` @ ${repo.headSha}` : '';
  return `${repo.path}${branch}${head}`;
}

function renderContent(): HTMLElement {
  const content = el('section', 'content');
  if (state.notice) {
    const notice = el('div', 'notice', state.notice);
    notice.append(button('Dismiss', () => {
      state.notice = undefined;
      render();
    }, 'ghost'));
    content.append(notice);
  }
  if (state.busy) content.append(el('div', 'loading', 'Working...'));

  if (state.view === 'sessions') content.append(renderSessions());
  if (state.view === 'run') content.append(renderRunReview());
  if (state.view === 'config') content.append(renderConfig());
  if (state.view === 'setup') content.append(renderSetup());
  return content;
}

function renderSessions(): HTMLElement {
  const layout = el('div', 'sessions-layout');
  const listPanel = el('div', 'session-list');
  const controls = el('div', 'session-controls');
  const search = el('input', 'filter-input') as HTMLInputElement;
  search.type = 'search';
  search.placeholder = 'Filter sessions';
  search.value = state.sessionSearch;
  search.addEventListener('input', () => {
    state.sessionSearch = search.value;
    render();
  });
  const status = el('select', 'filter-select') as HTMLSelectElement;
  for (const option of ['all', 'completed', 'failed', 'interrupted', 'in_progress', 'unknown'] as const) {
    const node = el('option') as HTMLOptionElement;
    node.value = option;
    node.textContent = option === 'all' ? 'All statuses' : option.replace('_', ' ');
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
  const summary = el('div', 'list-summary', `${sessions.length} of ${state.sessions.length} sessions`);
  listPanel.append(summary);
  if (state.sessions.length === 0) {
    listPanel.append(el('p', 'empty padded', 'No sessions found yet.'));
  } else if (sessions.length === 0) {
    listPanel.append(el('p', 'empty padded', 'No sessions match the current filter.'));
  }
  for (const session of sessions) {
    const item = button('', () => void selectSession(session.id), state.selected?.id === session.id ? 'session-row selected' : 'session-row');
    const top = el('div', 'session-row-top');
    top.append(el('strong', '', session.id));
    top.append(el('span', decisionClass(session.decision), session.decision ?? session.status));
    item.append(top);
    item.append(el('span', 'session-meta', `${severityTotal(session)} issues · ${formatTimestamp(session.updatedAt)}`));
    listPanel.append(item);
  }
  layout.append(listPanel);
  layout.append(renderSessionDetail());
  return layout;
}

function formatTimestamp(value?: string): string {
  if (!value) return 'no timestamp';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function renderSessionDetail(): HTMLElement {
  const detail = el('article', 'detail');
  const selected = state.selected;
  if (!selected) {
    detail.append(el('p', 'empty', 'Select a session to inspect its verdict, findings, and report.'));
    return detail;
  }

  const head = el('div', 'detail-head');
  head.append(el('div', decisionClass(selected.decision), selected.decision ?? selected.status));
  head.append(el('h2', '', selected.id));
  detail.append(head);
  const meta = el('div', 'detail-meta');
  meta.append(el('span', '', selected.dirPath ?? '.ca/sessions'));
  meta.append(el('span', '', `Updated ${formatTimestamp(selected.updatedAt)}`));
  meta.append(el('span', '', `${selected.evidenceCount ?? 0} evidence docs`));
  meta.append(el('span', '', `${selected.discussionsCount ?? 0} discussion files`));
  detail.append(meta);
  const exports = el('div', 'export-actions');
  exports.append(button('Copy Markdown', () => void exportSelected('markdown')));
  exports.append(button('Copy JSON', () => void exportSelected('json')));
  exports.append(button('Copy SARIF', () => void exportSelected('sarif')));
  detail.append(exports);
  detail.append(el('p', 'reasoning', selected.reasoning ?? 'No reasoning recorded.'));

  const counts = selected.severityCounts ?? {};
  const countGrid = el('div', 'count-grid');
  for (const key of ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION'] as const) {
    const cell = el('div', 'count-cell');
    cell.append(el('span', '', key.replace('_', ' ')));
    cell.append(el('strong', '', String(counts[key] ?? 0)));
    countGrid.append(cell);
  }
  detail.append(countGrid);

  const issues = el('div', 'issues');
  const findings = selected.findings?.length ? selected.findings : selected.topIssues ?? [];
  issues.append(el('h3', '', `Findings (${findings.length})`));
  if (findings.length === 0) {
    issues.append(el('p', 'empty', 'No findings recorded.'));
  } else {
    for (const issue of findings) {
      const row = el('div', 'issue-row');
      row.append(el('strong', '', issue.title));
      const confidence = issue.confidence === undefined ? '' : ` · ${Math.round(issue.confidence)}%`;
      row.append(el('span', '', `${issue.severity} · ${issue.filePath}:${issue.lineRange[0]}${confidence}`));
      issues.append(row);
    }
  }
  detail.append(issues);

  if (selected.markdown) {
    const report = el('pre', 'report');
    report.textContent = selected.markdown;
    detail.append(report);
  }
  return detail;
}

function renderRunReview(): HTMLElement {
  const panel = el('div', 'run-panel');
  panel.append(el('h2', '', 'Start a Local Review'));
  panel.append(el('p', '', state.repoPath || 'Current repository'));
  panel.append(renderRepositoryPicker());
  panel.append(renderRepoFacts());
  const actions = el('div', 'run-actions');
  actions.append(button('Review Staged Changes', () => void startReview(true), 'button primary'));
  actions.append(button('Review Working Tree', () => void startReview(false)));
  if (state.activeRun && isReviewRunning(state.activeRun)) {
    const cancel = el('button', 'button danger', 'Cancel Review');
    cancel.type = 'button';
    cancel.addEventListener('click', () => void cancelActiveReview());
    actions.append(cancel);
  }
  panel.append(actions);
  panel.append(renderReviewRun());
  panel.append(renderCommandContract());
  return panel;
}

function renderReviewRun(): HTMLElement {
  const run = state.activeRun;
  const section = el('section', 'review-run');
  section.append(el('h3', '', 'Review Progress'));
  if (!run) {
    section.append(el('p', 'empty', 'No desktop-started review is active.'));
    return section;
  }

  const summary = el('div', 'review-run-summary');
  summary.append(el('span', statusClass(run.status), run.status));
  summary.append(el('strong', '', run.runId));
  summary.append(el('span', '', run.staged ? 'staged diff' : 'working tree diff'));
  if (run.sessionId) summary.append(el('span', '', `session ${run.sessionId}`));
  section.append(summary);
  section.append(el('p', 'repo-note', run.message));

  const events = el('div', 'event-list');
  for (const event of run.events.slice(-12).reverse()) {
    const row = el('div', 'event-row');
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
  input.type = 'text';
  input.placeholder = '/path/to/repository';
  input.value = state.repoInput || state.repoPath;
  input.addEventListener('input', () => {
    state.repoInput = input.value;
  });
  section.append(input);
  section.append(button('Open Repository', () => void openRepo(input.value), 'button primary'));

  if (state.recentRepoPaths.length > 0) {
    const recent = el('div', 'recent-repos');
    recent.append(el('span', '', 'Recent'));
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
    grid.append(el('div', 'repo-card', 'Loading repository state...'));
    return grid;
  }

  const facts: Array<[string, string, boolean?]> = [
    ['Trust', repo.trusted ? 'trusted git workspace' : 'not trusted', repo.trusted],
    ['Git', repo.isGitRepo ? 'detected' : 'missing', repo.isGitRepo],
    ['Branch', repo.branch || 'detached or unavailable'],
    ['Head', repo.headSha || 'unknown'],
    ['Dirty files', String(repo.dirtyFileCount)],
    ['Sessions', String(repo.sessionCount)],
    ['Config', repo.configPath || 'not found', repo.hasConfig],
    ['Review rules', repo.reviewRulesPath || 'not found', Boolean(repo.reviewRulesPath)],
    ['Review ignore', repo.reviewIgnorePath || 'not found', Boolean(repo.reviewIgnorePath)],
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
  section.append(el('h3', '', 'Tauri Command Boundary'));
  if (state.commandContract.length === 0) {
    section.append(el('p', 'empty', 'Command contract is not loaded yet.'));
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
    if (item.readsProject) flags.append(el('span', 'fact', 'reads project'));
    if (item.mutatesProject) flags.append(el('span', 'fact warn', 'mutates project'));
    if (item.spawnsProcess) flags.append(el('span', 'fact warn', 'spawns process'));
    row.append(flags);
    section.append(row);
  }
  return section;
}

function renderConfig(): HTMLElement {
  const panel = el('div', 'config-panel');
  panel.append(el('h2', '', state.configPath));
  panel.append(renderConfigFacts());
  const textarea = el('textarea', 'config-editor') as HTMLTextAreaElement;
  textarea.value = state.configRaw;
  panel.append(textarea);
  panel.append(renderConfigValidation());
  const actions = el('div', 'config-actions');
  actions.append(button('Validate Config', () => void validateConfigEditor(textarea.value)));
  actions.append(button('Save Config', () => void saveConfig(textarea.value), 'button primary'));
  panel.append(actions);
  return panel;
}

function renderConfigValidation(): HTMLElement {
  const validation = state.configValidation;
  const panel = el('div', validation?.valid === false ? 'validation-panel invalid' : 'validation-panel');
  if (!validation) {
    panel.append(el('p', 'empty', 'Config has not been validated yet.'));
    return panel;
  }
  panel.append(el('strong', '', validation.valid ? 'Config valid' : 'Config invalid'));
  for (const error of validation.errors) {
    panel.append(el('span', 'validation-error', error));
  }
  for (const warning of validation.warnings) {
    panel.append(el('span', 'validation-warning', warning));
  }
  if (validation.errors.length === 0 && validation.warnings.length === 0) {
    panel.append(el('span', 'validation-ok', 'No errors or warnings.'));
  }
  return panel;
}

function renderConfigFacts(): HTMLElement {
  const facts = el('div', 'config-facts');
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(state.configRaw) as Record<string, unknown>;
  } catch {
    facts.append(el('span', 'fact warn', 'Invalid JSON'));
    return facts;
  }
  const language = typeof parsed.language === 'string' ? parsed.language : 'unset';
  const reviewers = Array.isArray(parsed.reviewers) ? parsed.reviewers.length : 0;
  const providers = Array.isArray(parsed.providers) ? parsed.providers.length : 0;
  facts.append(el('span', 'fact', `Language ${language}`));
  facts.append(el('span', 'fact', `${reviewers} reviewers`));
  facts.append(el('span', 'fact', `${providers} providers`));
  return facts;
}

function renderSetup(): HTMLElement {
  const panel = el('div', 'setup-panel');
  const header = el('div', 'section-head');
  header.append(el('h2', '', 'Providers and Local Backends'));
  header.append(button('Refresh Setup', () => void loadSetup()));
  panel.append(header);

  const grid = el('div', 'provider-grid');
  for (const provider of state.providers) {
    const card = el('div', provider.configured ? 'provider-card configured' : 'provider-card');
    card.append(el('strong', '', provider.name));
    card.append(el('span', 'provider-kind', provider.kind));
    const status = provider.configured ? 'configured' : 'missing';
    card.append(el('span', provider.configured ? 'provider-ok' : 'provider-missing', status));
    if (provider.envVar) card.append(el('span', '', `${provider.envVar} ${provider.redactedValue ?? ''}`.trim()));
    if (provider.binary) card.append(el('span', '', provider.binary));
    grid.append(card);
  }
  if (state.providers.length === 0) {
    grid.append(el('p', 'empty', 'Provider status has not been loaded yet.'));
  }
  panel.append(grid);
  panel.append(renderMcpSetup());
  panel.append(renderGitHubActionSetup());
  panel.append(renderEvidenceSetup());
  return panel;
}

function renderMcpSetup(): HTMLElement {
  const section = el('section', 'integration-section');
  section.append(el('h3', '', 'MCP Server'));
  const mcp = state.mcpStatus;
  if (!mcp) {
    section.append(el('p', 'empty', 'MCP status has not been loaded yet.'));
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
  section.append(el('h3', '', 'GitHub Action'));
  const status = state.githubActionStatus;
  if (!status) {
    section.append(el('p', 'empty', 'GitHub Action status has not been loaded yet.'));
    return section;
  }
  section.append(el('p', 'repo-note', `${status.codeagoraWorkflowCount} CodeAgora workflow(s) found across ${status.workflowCount} workflow file(s).`));
  for (const workflow of status.workflows) {
    const row = el('div', 'workflow-row');
    row.append(el('strong', '', workflow.path));
    row.append(el('span', workflow.mentionsCodeagora ? 'provider-ok' : 'provider-missing', workflow.mentionsCodeagora ? 'CodeAgora' : 'No CodeAgora'));
    row.append(el('span', workflow.hasPullRequestTrigger ? 'provider-ok' : 'provider-missing', workflow.hasPullRequestTrigger ? 'PR trigger' : 'No PR trigger'));
    row.append(el('span', workflow.hasPermissions ? 'provider-ok' : 'provider-missing', workflow.hasPermissions ? 'permissions' : 'permissions missing'));
    row.append(el('span', workflow.hasConfigPath ? 'provider-ok' : 'provider-kind', workflow.hasConfigPath ? 'config-path' : 'default config'));
    section.append(row);
  }
  const snippet = el('pre', 'snippet');
  snippet.textContent = status.recommendedSnippet;
  section.append(snippet);
  return section;
}

function renderEvidenceSetup(): HTMLElement {
  const section = el('section', 'integration-section');
  section.append(el('h3', '', 'Release Evidence'));
  const evidence = state.evidenceStatus;
  if (!evidence) {
    section.append(el('p', 'empty', 'Evidence status has not been loaded yet.'));
    return section;
  }
  const rows: Array<[string, boolean, string | undefined]> = [
    ['Release evidence', evidence.hasReleaseEvidence, evidence.releaseEvidencePath],
    ['Live benchmark report', evidence.hasBenchmarkReport, evidence.benchmarkReportPath],
    ['Evidence manifest', evidence.hasEvidenceManifest, evidence.evidenceManifestPath],
  ];
  for (const [label, present, path] of rows) {
    const row = el('div', 'evidence-row');
    row.append(el('strong', '', label));
    row.append(el('span', present ? 'provider-ok' : 'provider-missing', present ? 'present' : 'missing'));
    row.append(el('span', '', path ?? 'not found'));
    section.append(row);
  }
  return section;
}

function render(): void {
  appRoot.replaceChildren(renderShell());
}

void refreshSessions(true);
void loadRepoInfo();
void loadCommandContract();
