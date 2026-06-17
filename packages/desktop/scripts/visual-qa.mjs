import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const tauriRoot = path.join(packageRoot, 'src-tauri');
const evidenceRoot = path.join(repoRoot, '.sisyphus', 'evidence');
const cockpitScreenshotPath = path.join(evidenceRoot, 'desktop-visual-qa-cockpit.png');
const setupScreenshotPath = path.join(evidenceRoot, 'desktop-visual-qa-setup.png');
const reportPath = path.join(evidenceRoot, 'desktop-visual-qa.json');
const port = Number(process.env.CODEAGORA_DESKTOP_MCP_PORT ?? 9223);
const windowWidth = Number(process.env.CODEAGORA_DESKTOP_VISUAL_WIDTH ?? 1180);
const windowHeight = Number(process.env.CODEAGORA_DESKTOP_VISUAL_HEIGHT ?? 728);
const appReadyTimeoutMs = Number(process.env.CODEAGORA_DESKTOP_VISUAL_APP_READY_TIMEOUT_MS ?? 180_000);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function which(command) {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createFixtureWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-desktop-visual-qa-'));
  const git = spawnSync('git', ['init', '--initial-branch', 'main'], { cwd: dir, stdio: 'ignore' });
  assert(git.status === 0, 'Failed to initialize temporary git workspace');
  writeFile(path.join(dir, 'README.md'), '# CodeAgora desktop visual QA fixture\n');
  writeFile(path.join(dir, 'src', 'app.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
  writeFile(path.join(dir, '.ca', 'config.json'), `${JSON.stringify({
    language: 'ko',
    reviewers: [{ id: 'codex', backend: 'codex', model: 'gpt-5', enabled: true, timeout: 120 }],
    supporters: {
      pool: [{ id: 'supporter', backend: 'codex', model: 'gpt-5', enabled: true, timeout: 120 }],
      pickCount: 1,
      pickStrategy: 'random',
      devilsAdvocate: { id: 'devils-advocate', backend: 'codex', model: 'gpt-5', enabled: true, timeout: 120 },
      personaPool: ['builtin:security'],
      personaAssignment: 'random',
    },
    moderator: { backend: 'codex', model: 'gpt-5' },
    discussion: {
      maxRounds: 1,
      registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
      codeSnippetRange: 10,
    },
    head: { backend: 'codex', model: 'gpt-5', enabled: true },
    errorHandling: { maxRetries: 0, forfeitThreshold: 1 },
  }, null, 2)}\n`);
  const sessionDir = path.join(dir, '.ca', 'sessions', '2026-06-08', 'visual-qa-001');
  writeFile(path.join(sessionDir, 'metadata.json'), JSON.stringify({
    status: 'completed',
    completedAt: Date.parse('2026-06-08T09:30:00.000Z'),
  }, null, 2));
  writeFile(path.join(sessionDir, 'head-verdict.json'), JSON.stringify({
    decision: 'ACCEPT',
    reasoning: '비개발자도 최근 리뷰 상태와 다음 행동을 바로 이해할 수 있는 콕핏입니다.',
    issues: [],
  }, null, 2));
  writeFile(path.join(sessionDir, 'report.md'), '# Visual QA fixture report\n\nDecision: ACCEPT\n');
  writeFile(path.join(sessionDir, 'reviews', 'model-a.md'), 'visual qa review evidence');
  spawnSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
  spawnSync('git', ['commit', '-m', 'fixture'], {
    cwd: dir,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'CodeAgora Visual QA',
      GIT_AUTHOR_EMAIL: 'visual-qa@example.invalid',
      GIT_COMMITTER_NAME: 'CodeAgora Visual QA',
      GIT_COMMITTER_EMAIL: 'visual-qa@example.invalid',
    },
  });
  return dir;
}

function runTauriMcp(args, options = {}) {
  const result = spawnSync('tauri-mcp', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`tauri-mcp ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return typeof result.stdout === 'string' ? result.stdout.trim() : '';
}

function runTauriMcpJson(args) {
  const output = runTauriMcp([...args, '--json']);
  return output ? JSON.parse(output) : {};
}

function parseMcpTextJson(response) {
  const text = response.text ?? response.content?.find((entry) => entry.type === 'text')?.text ?? '';
  const firstLine = text.split('\n')[0];
  return JSON.parse(firstLine);
}

async function waitForAppReady(appProcess) {
  const started = Date.now();
  while (Date.now() - started < appReadyTimeoutMs) {
    if (appProcess.exitCode !== null) {
      throw new Error(`Tauri app exited before MCP bridge became ready:\n${appProcess.output}`);
    }
    if (appProcess.output.includes('WebSocket server listening on')) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for MCP bridge on port ${port}:\n${appProcess.output}`);
}

async function waitForCockpit() {
  const script = '(() => Boolean(document.querySelector("[data-testid=desktop-shell]") && document.querySelector("[data-testid=cockpit-overview]")))()';
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    const response = runTauriMcpJson(['webview-execute-js', '--script', script]);
    if (response.text?.startsWith('true')) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the cockpit to render');
}

async function openAcceptancePanelIfNeeded() {
  const readyScript = '(() => Boolean(document.querySelector("[data-testid=acceptance-panel]")))()';
  const initial = runTauriMcpJson(['webview-execute-js', '--script', readyScript]);
  if (initial.text?.startsWith('true')) return;

  const openScript = `(() => {
    const firstSession = document.querySelector("[data-testid^=session-row-]");
    firstSession?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    const detailTab = document.querySelector("[data-testid=button-session-detail-tab]");
    detailTab?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  })()`;
  runTauriMcpJson(['webview-execute-js', '--script', openScript]);

  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const response = runTauriMcpJson(['webview-execute-js', '--script', readyScript]);
    if (response.text?.startsWith('true')) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the acceptance panel to render');
}

function inspectVisualState() {
  const script = `(() => {
    window.scrollTo(0, 0);
    const selectors = "button, .ca-toolbar h1, .ca-repo-subtitle, .ca-cockpit-hero p, .ca-decision-panel p, .ca-metric-card strong, .ca-flow-step strong, .ca-status-label, .ca-decision, .ca-session-row strong, .ca-acceptance-panel strong";
    const overflow = [...document.querySelectorAll(selectors)]
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .map((el) => ({
        tag: el.tagName,
        className: String(el.className),
        text: el.textContent?.trim(),
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
      }));
    const layoutOverflow = [...document.querySelectorAll("*")]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .slice(0, 40)
      .map((el) => ({
        tag: el.tagName,
        className: String(el.className),
        text: el.textContent?.trim(),
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
      }));
    const layoutOverflowLeaves = [...document.querySelectorAll("*")]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .filter((el, _, all) => !all.some((other) => other !== el && el.contains(other)))
      .slice(0, 20)
      .map((el) => ({
        tag: el.tagName,
        className: String(el.className),
        text: el.textContent?.trim(),
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
      }));
    const cockpit = document.querySelector("[data-testid=cockpit-overview]");
    const acceptance = document.querySelector("[data-testid=acceptance-panel]");
    const containerSelectors = [
      "[data-testid=view-sessions]",
      "[data-testid=view-run]",
      "[data-testid=view-setup]",
      "[data-testid=view-config]",
      "[data-testid=cockpit-overview]",
      "[data-testid=sessions-layout]",
      "[data-testid=run-panel]",
      "[data-testid=review-run]",
      "[data-testid=setup-panel]",
      "[data-testid=config-panel]",
      ".ca-cockpit-overview",
      ".ca-sessions-layout",
      ".ca-run-panel",
      ".ca-review-run",
      ".ca-setup-panel",
      ".ca-config-panel",
      ".ca-detail",
      ".ca-session-list",
    ];
    const containerWidths = Object.fromEntries(
      containerSelectors.map((selector) => {
        const el = document.querySelector(selector);
        return [selector, el ? { clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, className: String(el.className) } : null];
      }),
    );
    return {
      viewport: { width: innerWidth, height: innerHeight },
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      overflow,
      layoutOverflow,
      layoutOverflowLeaves,
      containerWidths,
      shellText: document.body.innerText?.replace(/\\s+/g, " ").trim() ?? "",
      cockpitText: cockpit?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
      acceptanceText: acceptance?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
      cockpitPreferenceMenuVisible: Boolean(document.querySelector(".ca-preferences-menu")),
    };
  })()`;
  return parseMcpTextJson(runTauriMcpJson(['webview-execute-js', '--script', script]));
}

function captureScreenshot(filePath) {
  runTauriMcpJson(['webview-screenshot', '--file', filePath]);
}

async function openSetupView() {
  const script = `(() => {
    document.querySelector("[data-testid=button-setup]")?.click();
    return true;
  })()`;
  runTauriMcpJson(['webview-execute-js', '--script', script]);
  const readyScript = '(() => Boolean(document.querySelector("[data-testid=setup-overview]")))()';
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const response = runTauriMcpJson(['webview-execute-js', '--script', readyScript]);
    if (response.text?.startsWith('true')) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for setup overview to render');
}

function inspectSetupState() {
  const script = `(() => {
    const setup = document.querySelector("[data-testid=setup-panel]");
    return {
      setupText: setup?.innerText?.replace(/\\s+/g, " ").trim() ?? "",
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  })()`;
  return parseMcpTextJson(runTauriMcpJson(['webview-execute-js', '--script', script]));
}

const tauriMcp = which('tauri-mcp');
assert(tauriMcp, 'tauri-mcp not found. Install @hypothesi/tauri-mcp-cli first.');

fs.mkdirSync(evidenceRoot, { recursive: true });
runTauriMcp(['driver-session', 'stop'], { stdio: 'ignore' });

const workspace = createFixtureWorkspace();
const app = spawn('cargo', ['run'], {
  cwd: tauriRoot,
  env: {
    ...process.env,
    CODEAGORA_DESKTOP_REPO: workspace,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
app.output = '';
app.stdout.on('data', (chunk) => {
  app.output += chunk.toString();
});
app.stderr.on('data', (chunk) => {
  app.output += chunk.toString();
});

try {
  await waitForAppReady(app);
  runTauriMcpJson(['driver-session', 'start', '--port', String(port)]);
  runTauriMcpJson(['manage-window', '--action', 'resize', '--width', String(windowWidth), '--height', String(windowHeight)]);
  await waitForCockpit();
  await openAcceptancePanelIfNeeded();
  const visual = inspectVisualState();
  assert(visual.horizontalOverflow === false, `Desktop visual QA found horizontal page overflow:\n${JSON.stringify({ leaves: visual.layoutOverflowLeaves, containers: visual.containerWidths }, null, 2)}`);
  assert(Array.isArray(visual.overflow) && visual.overflow.length === 0, `Desktop visual QA found clipped text: ${JSON.stringify(visual.overflow, null, 2)}`);
  for (const expected of ['로컬 리뷰 준비 상태', '계속 진행 가능', '권장 다음 단계', '최근 업데이트']) {
    assert(visual.cockpitText.includes(expected), `Desktop cockpit is missing expected text: ${expected}`);
  }
  for (const forbidden of ['Tauri 명령 경계', 'Tauri Command Boundary', 'open_repository', 'process-execution']) {
    assert(!visual.shellText.includes(forbidden), `Desktop visual QA found internal command diagnostics on the default surface: ${forbidden}`);
  }
  assert(visual.cockpitPreferenceMenuVisible === false, 'Desktop cockpit should not render toolbar preference controls in the first viewport');
  assert(visual.acceptanceText.includes('이 리뷰 결과를 받아들일 수 있습니다'), 'Desktop acceptance panel is missing accept-oriented copy');
  assert(visual.acceptanceText.includes('판정 요약 복사'), 'Desktop acceptance panel is missing the decision summary action');
  captureScreenshot(cockpitScreenshotPath);
  await openSetupView();
  const setup = inspectSetupState();
  for (const expected of ['로컬 리뷰', 'PR 자동화', '결과 증거', '실제 LLM 리뷰', '실제 리뷰 연결']) {
    assert(setup.setupText.includes(expected), `Desktop setup overview is missing expected text: ${expected}`);
  }
  for (const forbidden of ['"mcpServers"', 'config-path:', 'codeagora-mcp', 'Failed to run agora doctor']) {
    assert(!setup.setupText.includes(forbidden), `Desktop setup surface exposes collapsed internal setup details: ${forbidden}`);
  }
  assert(setup.horizontalOverflow === false, 'Desktop setup visual QA found horizontal page overflow');
  captureScreenshot(setupScreenshotPath);
  const report = {
    schemaVersion: 'codeagora.desktop-visual-qa.v1',
    generatedAt: new Date().toISOString(),
    viewport: visual.viewport,
    screenshots: {
      cockpit: path.relative(repoRoot, cockpitScreenshotPath),
      setup: path.relative(repoRoot, setupScreenshotPath),
    },
    horizontalOverflow: visual.horizontalOverflow,
    clippedTextCount: visual.overflow.length,
    fixtureWorkspace: path.basename(workspace),
    checks: [
      'MCP bridge connected to the debug Tauri app',
      'Cockpit rendered with non-developer status and next action copy',
      'Default surface hides internal command-boundary diagnostics',
      'Acceptance panel rendered with accept-oriented decision copy',
      'Cockpit screenshot captured for first-screen product review',
      'Live review readiness card rendered with actionable placeholder copy',
      'Setup overview rendered with collapsed internal automation details',
      'No horizontal page overflow at the target viewport',
      'No clipped text among primary controls, metrics, flow steps, decisions, and session titles',
      'Setup screenshot captured for setup-guide product review',
    ],
  };
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`CodeAgora desktop visual QA passed`);
  console.log(`- ${path.relative(repoRoot, reportPath)}`);
  console.log(`- ${path.relative(repoRoot, cockpitScreenshotPath)}`);
  console.log(`- ${path.relative(repoRoot, setupScreenshotPath)}`);
} finally {
  runTauriMcp(['driver-session', 'stop'], { stdio: 'ignore' });
  app.kill('SIGTERM');
  fs.rmSync(workspace, { recursive: true, force: true });
}
