import {
  getRepoInfo,
  getSessionDetail,
  listSessions,
  readConfig,
  runReview,
  writeConfig,
  type SessionDetail,
  type SessionSummary,
} from './api/desktop-bridge.js';

type View = 'sessions' | 'run' | 'config';

interface AppState {
  view: View;
  sessions: SessionSummary[];
  selected?: SessionDetail;
  repoPath: string;
  sessionSearch: string;
  sessionStatus: 'all' | SessionSummary['status'];
  configRaw: string;
  configPath: string;
  notice?: string;
  busy: boolean;
}

const state: AppState = {
  view: 'sessions',
  sessions: [],
  repoPath: '',
  sessionSearch: '',
  sessionStatus: 'all',
  configRaw: '',
  configPath: '.ca/config.json',
  busy: false,
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');
const appRoot = app;

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
    state.repoPath = (await getRepoInfo()).path;
  } catch (error) {
    state.repoPath = error instanceof Error ? error.message : String(error);
  }
  render();
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

async function startReview(staged: boolean): Promise<void> {
  state.busy = true;
  state.notice = staged ? 'Starting staged review...' : 'Starting working tree review...';
  render();
  try {
    const result = await runReview(staged);
    state.notice = result.message;
    await refreshSessions(false);
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
  ];
  for (const [view, label] of navItems) {
    nav.append(button(label, () => {
      setView(view);
      if (view === 'config' && !state.configRaw) void loadConfig();
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
  title.append(el('h1', '', state.view === 'sessions' ? 'Review Sessions' : state.view === 'run' ? 'Run Review' : 'Configuration'));
  title.append(el('p', '', state.repoPath || 'Loading repository...'));
  toolbar.append(title);

  const actions = el('div', 'toolbar-actions');
  actions.append(button('Refresh', () => void refreshSessions(state.view === 'sessions' && !state.selected)));
  actions.append(button('Quick Review', () => void startReview(true), 'button primary'));
  toolbar.append(actions);
  return toolbar;
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
  issues.append(el('h3', '', 'Top Findings'));
  if (!selected.topIssues || selected.topIssues.length === 0) {
    issues.append(el('p', 'empty', 'No top findings recorded.'));
  } else {
    for (const issue of selected.topIssues) {
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
  const actions = el('div', 'run-actions');
  actions.append(button('Review Staged Changes', () => void startReview(true), 'button primary'));
  actions.append(button('Review Working Tree', () => void startReview(false)));
  panel.append(actions);
  return panel;
}

function renderConfig(): HTMLElement {
  const panel = el('div', 'config-panel');
  panel.append(el('h2', '', state.configPath));
  panel.append(renderConfigFacts());
  const textarea = el('textarea', 'config-editor') as HTMLTextAreaElement;
  textarea.value = state.configRaw;
  panel.append(textarea);
  panel.append(button('Save Config', () => void saveConfig(textarea.value), 'button primary'));
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

function render(): void {
  appRoot.replaceChildren(renderShell());
}

void refreshSessions(true);
void loadRepoInfo();
