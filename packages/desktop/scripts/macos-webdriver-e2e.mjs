import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(root, '..', '..');
const tauriRoot = path.join(root, 'src-tauri');
const debugBundle = path.join(tauriRoot, 'target', 'debug', 'bundle', 'macos', 'CodeAgora.app');
const debugBundleBinary = path.join(debugBundle, 'Contents', 'MacOS', 'codeagora-desktop');
const debugBinary = path.join(tauriRoot, 'target', 'debug', 'codeagora-desktop');
const binary = process.env.CODEAGORA_DESKTOP_WEBDRIVER_BINARY
  ?? (fs.existsSync(debugBundleBinary) ? debugBundleBinary : debugBinary);
const binaryLabel = binary === debugBundleBinary ? 'debug .app bundle' : 'debug executable';
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
  writeFile(path.join(dir, 'src', 'app.ts'), 'export const value = 1;\n');
  const reviewer = { id: 'codex', backend: 'codex', model: 'gpt-5', enabled: true, timeout: 120 };
  const supporter = { id: 'supporter', backend: 'codex', model: 'gpt-5', enabled: true, timeout: 120 };
  writeFile(path.join(dir, '.ca', 'config.json'), `${JSON.stringify({
    language: 'ko',
    reviewers: [reviewer],
    supporters: {
      pool: [supporter],
      pickCount: 1,
      pickStrategy: 'random',
      devilsAdvocate: { ...supporter, id: 'devils-advocate' },
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
    '      - uses: bssm-oss/CodeAgora@v0.1.0-rc.1',
    '        with:',
    '          config-path: .ca/config.json',
    '',
  ].join('\n'));
  writeFile(path.join(dir, 'docs', 'RELEASE_EVIDENCE.md'), '# Release Evidence\n');
  writeFile(path.join(dir, 'docs', 'live-benchmark-report.md'), '# Live Benchmark\n');
  writeFile(path.join(dir, '.sisyphus', 'evidence', 'evidence-manifest.json'), '{"schemaVersion":"codeagora.release-evidence.v1"}\n');
  spawnSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
  spawnSync('git', ['commit', '-m', 'fixture'], {
    cwd: dir,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'CodeAgora WebDriver',
      GIT_AUTHOR_EMAIL: 'webdriver@example.invalid',
      GIT_COMMITTER_NAME: 'CodeAgora WebDriver',
      GIT_COMMITTER_EMAIL: 'webdriver@example.invalid',
    },
  });
  writeFile(path.join(dir, 'src', 'app.ts'), 'export const value = 2;\n');
  spawnSync('git', ['add', 'src/app.ts'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

function fakeAgoraBin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-desktop-fake-agora-'));
  const script = path.join(dir, 'agora');
  writeFile(script, `#!/bin/sh
set -eu
if [ "\${1:-}" = "config" ]; then
  printf '%s\\n' '{"valid":true,"errors":[],"warnings":[]}'
  exit 0
fi
if [ -f ".ca/fail-next-review" ]; then
  rm -f ".ca/fail-next-review"
  printf '%s\\n' '{"schemaVersion":"codeagora.review.v1","type":"progress","stage":"review","event":"stage-update","progress":18,"message":"로컬 리뷰 도구 상태를 확인하고 있습니다."}'
  printf '%s\\n' 'review tool unavailable' >&2
  exit 2
fi
session_root=".ca/sessions/2026-06-08/webdriver-run-001"
mkdir -p "$session_root/reviews"
cat > "$session_root/metadata.json" <<'JSON'
{"status":"completed","completedAt":1780848000000}
JSON
cat > "$session_root/head-verdict.json" <<'JSON'
{"decision":"ACCEPT","reasoning":"자동 리뷰 완료: 변경 사항을 받아들일 수 있습니다.","issues":[]}
JSON
cat > "$session_root/report.md" <<'MARKDOWN'
# WebDriver run result

Decision: ACCEPT
MARKDOWN
printf '%s\\n' '{"schemaVersion":"codeagora.review.v1","type":"progress","stage":"review","event":"stage-update","progress":42,"message":"변경 사항을 확인하고 있습니다.","sessionId":"2026-06-08/webdriver-run-001"}'
printf '%s\\n' '{"schemaVersion":"codeagora.review.v1","type":"result","status":"success","date":"2026-06-08","sessionId":"webdriver-run-001","summary":{"decision":"ACCEPT"}}'
`);
  fs.chmodSync(script, 0o755);
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
  let lastValue = '';
  let lastError = '';
  while (Date.now() - started < 20_000) {
    try {
      const value = await text(sessionId, selector);
      lastValue = String(value);
      if (value.includes(expected)) return value;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      // Keep polling while the app initializes or rerenders.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${selector} to contain ${expected}. Last text: ${lastValue || '<empty>'}. Last error: ${lastError || '<none>'}`);
}

if (process.platform !== 'darwin') {
  console.log('macOS WebDriver E2E skipped: this workaround is only needed on macOS.');
  process.exit(0);
}

assert(fs.existsSync(binary), `Tauri WebDriver target is missing: ${path.relative(repoRoot, binary)}`);
if (!process.env.CODEAGORA_DESKTOP_WEBDRIVER_BINARY) {
  assert(
    binary === debugBundleBinary,
    `macOS WebDriver E2E must run against the debug .app bundle. Missing ${path.relative(repoRoot, debugBundleBinary)}`,
  );
}
const tauriWd = process.env.TAURI_WD ?? which('tauri-wd');
assert(tauriWd, 'tauri-wd not found. Install with: cargo install tauri-webdriver-automation');

const workspace = fixtureWorkspace();
const fakeAgoraPath = fakeAgoraBin();
const server = spawn(tauriWd, ['--port', String(port)], {
  cwd: repoRoot,
  env: {
    ...process.env,
    CODEAGORA_DESKTOP_REPO: workspace,
    CODEAGORA_DESKTOP_WEBDRIVER: '1',
    PATH: `${fakeAgoraPath}${path.delimiter}${process.env.PATH ?? ''}`,
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
  await waitForText(sessionId, '[data-testid="desktop-shell"]', '리뷰 콕핏');
  await waitForText(sessionId, '[data-testid="cockpit-overview"]', '로컬 리뷰 준비 상태');

  await click(sessionId, '[data-testid="button-run-review"]');
  await waitForText(sessionId, '[data-testid="run-panel"]', '리뷰 결과 만들기');
  await waitForText(sessionId, '[data-testid="button-review-staged-changes"]', '커밋할 변경 확인');
  await waitForText(sessionId, '[data-testid="button-review-working-tree"]', '전체 로컬 변경 확인');
  await click(sessionId, '[data-testid="button-review-staged-changes"]');
  await waitForText(sessionId, '[data-testid="desktop-shell"]', '자동 리뷰 완료');
  await waitForText(sessionId, '[data-testid="acceptance-panel"]', '이 리뷰 결과를 받아들일 수 있습니다');
  writeFile(path.join(workspace, '.ca', 'fail-next-review'), '1\n');
  await click(sessionId, '[data-testid="button-run-review"]');
  await waitForText(sessionId, '[data-testid="run-panel"]', '리뷰 결과 만들기');
  await click(sessionId, '[data-testid="button-review-staged-changes"]');
  await waitForText(sessionId, '[data-testid="review-outcome-panel"]', '리뷰를 완료하지 못했습니다');
  await waitForText(sessionId, '[data-testid="review-outcome-panel"]', '다시 실행');
  await waitForText(sessionId, '[data-testid="review-outcome-panel"]', '셋업 확인');

  await click(sessionId, '[data-testid="button-config"]');
  await waitForText(sessionId, '[data-testid="config-panel"]', '설정 유효함');
  await waitForText(sessionId, '[data-testid="config-status-panel"]', '현재 설정으로 리뷰를 실행할 수 있습니다');
  await waitForText(sessionId, '[data-testid="config-panel"]', '전문가 설정 편집');

  await click(sessionId, '[data-testid="button-setup"]');
  await waitForText(sessionId, '[data-testid="setup-overview"]', '로컬 리뷰');
  await waitForText(sessionId, '[data-testid="setup-overview"]', 'PR 자동화');
  await waitForText(sessionId, '[data-testid="setup-overview"]', '결과 증거');
  await waitForText(sessionId, '[data-testid="setup-panel"]', '로컬 자동화 세부 정보');

  console.log(`CodeAgora desktop macOS WebDriver E2E passed (${binaryLabel}: ${path.relative(repoRoot, binary)})`);
} catch (error) {
  console.error(serverOutput);
  throw error;
} finally {
  if (sessionId) {
    await request('DELETE', `/session/${sessionId}`).catch(() => {});
  }
  server.kill('SIGTERM');
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.rmSync(fakeAgoraPath, { recursive: true, force: true });
}
