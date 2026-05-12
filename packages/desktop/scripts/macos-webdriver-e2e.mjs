import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(root, '..', '..');
const tauriRoot = path.join(root, 'src-tauri');
const binary = path.join(tauriRoot, 'target', 'debug', 'codeagora-desktop');
const port = Number(process.env.CODEAGORA_DESKTOP_WEBDRIVER_PORT ?? 4444);
const baseUrl = `http://127.0.0.1:${port}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function which(command) {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function fixtureWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-desktop-webdriver-'));
  const git = spawnSync('git', ['init', '--initial-branch', 'main'], { cwd: dir, stdio: 'ignore' });
  assert(git.status === 0, 'Failed to initialize temporary git workspace');
  writeFile(path.join(dir, 'README.md'), '# CodeAgora desktop WebDriver fixture\n');
  writeFile(path.join(dir, '.ca', 'config.json'), `${JSON.stringify({
    language: 'en',
    reviewers: [{ id: 'codex', backend: 'opencode', provider: 'openai', model: 'gpt-5' }],
  }, null, 2)}\n`);
  const sessionDir = path.join(dir, '.ca', 'sessions', '2026-05-06', 'webdriver-001');
  writeFile(path.join(sessionDir, 'metadata.json'), JSON.stringify({ status: 'completed', completedAt: Date.now() }));
  writeFile(path.join(sessionDir, 'head-verdict.json'), JSON.stringify({
    decision: 'REJECT',
    reasoning: 'WebDriver fixture session.',
    issues: [{
      severity: 'CRITICAL',
      filePath: 'src/app.ts',
      lineRange: [12, 18],
      title: 'WebDriver fixture finding',
      confidence: 91,
    }],
  }, null, 2));
  writeFile(path.join(sessionDir, 'report.md'), '# WebDriver fixture report\n\nDecision: REJECT\n');
  writeFile(path.join(sessionDir, 'reviews', 'model-a.md'), 'review evidence');
  writeFile(path.join(dir, '.github', 'workflows', 'codeagora.yml'), [
    'name: CodeAgora Review',
    'on:',
    '  pull_request:',
    'permissions:',
    '  contents: read',
    '  pull-requests: write',
    'jobs:',
    '  review:',
    '    steps:',
    '      - uses: bssm-oss/CodeAgora@v0.1.0-rc.0',
    '        with:',
    '          config-path: .ca/config.json',
    '',
  ].join('\n'));
  writeFile(path.join(dir, 'docs', 'RELEASE_EVIDENCE.md'), '# Release Evidence\n');
  writeFile(path.join(dir, 'docs', 'live-benchmark-report.md'), '# Live Benchmark\n');
  writeFile(path.join(dir, '.sisyphus', 'evidence', 'evidence-manifest.json'), '{"schemaVersion":"codeagora.release-evidence.v1"}\n');
  return dir;
}

async function request(method, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${method} ${pathname} failed (${response.status}): ${text}`);
  }
  if (json.value?.error) {
    throw new Error(`${method} ${pathname} WebDriver error: ${JSON.stringify(json.value)}`);
  }
  return json.value ?? json;
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    try {
      await request('GET', '/status');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('tauri-wd did not become ready on time');
}

async function findElement(sessionId, selector) {
  return request('POST', `/session/${sessionId}/element`, {
    using: 'css selector',
    value: selector,
  });
}

function elementId(element) {
  return element['element-6066-11e4-a52e-4f735466cecf'] ?? element.ELEMENT;
}

async function click(sessionId, selector) {
  const id = elementId(await findElement(sessionId, selector));
  await request('POST', `/session/${sessionId}/element/${id}/click`);
}

async function text(sessionId, selector) {
  const id = elementId(await findElement(sessionId, selector));
  return request('GET', `/session/${sessionId}/element/${id}/text`);
}

async function waitForText(sessionId, selector, expected) {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    try {
      const value = await text(sessionId, selector);
      if (value.includes(expected)) return value;
    } catch {
      // Keep polling while the app initializes or rerenders.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${selector} to contain ${expected}`);
}

if (process.platform !== 'darwin') {
  console.log('macOS WebDriver E2E skipped: this workaround is only needed on macOS.');
  process.exit(0);
}

assert(fs.existsSync(binary), `Debug Tauri binary is missing: ${path.relative(repoRoot, binary)}`);
const tauriWd = process.env.TAURI_WD ?? which('tauri-wd');
assert(tauriWd, 'tauri-wd not found. Install with: cargo install tauri-webdriver-automation');

const workspace = fixtureWorkspace();
const server = spawn(tauriWd, ['--port', String(port)], {
  cwd: repoRoot,
  env: {
    ...process.env,
    CODEAGORA_DESKTOP_REPO: workspace,
    CODEAGORA_DESKTOP_WEBDRIVER: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
server.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString();
});

let sessionId;
try {
  await waitForServer();
  const session = await request('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        'tauri:options': { binary },
      },
    },
  });
  sessionId = session.sessionId;
  assert(sessionId, `Missing WebDriver session id: ${JSON.stringify(session)}`);

  await waitForText(sessionId, '[data-testid="desktop-shell"]', 'CodeAgora');
  await waitForText(sessionId, '[data-testid="session-detail"]', 'WebDriver fixture finding');

  await click(sessionId, '[data-testid="button-config"]');
  await waitForText(sessionId, '[data-testid="config-panel"]', 'Config valid');

  await click(sessionId, '[data-testid="button-setup"]');
  await waitForText(sessionId, '[data-testid="setup-panel"]', 'MCP Server');
  await waitForText(sessionId, '[data-testid="setup-panel"]', 'Release Evidence');

  console.log('CodeAgora desktop macOS WebDriver E2E passed');
} catch (error) {
  console.error(serverOutput);
  throw error;
} finally {
  if (sessionId) {
    await request('DELETE', `/session/${sessionId}`).catch(() => {});
  }
  server.kill('SIGTERM');
  fs.rmSync(workspace, { recursive: true, force: true });
}
