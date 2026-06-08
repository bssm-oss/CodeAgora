import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const cliBinary = path.join(repoRoot, 'packages', 'cli', 'dist', 'index.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function copyFile(relativeSource, relativeTarget, workspace) {
  const source = path.join(repoRoot, relativeSource);
  const target = path.join(workspace, relativeTarget);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function git(args, cwd, extraEnv = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
  assert(result.status === 0, `git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
}

function createWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-live-review-smoke-'));
  git(['init', '--initial-branch', 'main'], dir);

  writeFile(path.join(dir, 'README.md'), '# Live Review Smoke\n');
  writeFile(path.join(dir, 'src', 'app.ts'), 'export const value = 1;\n');
  writeFile(path.join(dir, '.ca', 'config.json'), `${JSON.stringify({
    mode: 'pragmatic',
    language: 'en',
    reviewers: [
      {
        id: 'r1',
        model: 'auto',
        backend: 'api',
        provider: 'openrouter',
        enabled: true,
        timeout: 120,
      },
    ],
    supporters: {
      pool: [
        {
          id: 's1',
          model: 'auto',
          backend: 'api',
          provider: 'openrouter',
          enabled: true,
          timeout: 120,
        },
      ],
      pickCount: 1,
      pickStrategy: 'random',
      devilsAdvocate: {
        id: 'da',
        model: 'auto',
        backend: 'api',
        provider: 'openrouter',
        enabled: true,
        timeout: 120,
      },
      personaPool: ['.ca/personas/strict.md'],
      personaAssignment: 'random',
    },
    moderator: {
      model: 'auto',
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
      model: 'auto',
      provider: 'openrouter',
      enabled: true,
    },
    errorHandling: {
      maxRetries: 0,
      forfeitThreshold: 1,
    },
  }, null, 2)}\n`);
  copyFile('.ca/personas/strict.md', '.ca/personas/strict.md', dir);

  git(['add', '.'], dir, {
    GIT_AUTHOR_NAME: 'CodeAgora Live Smoke',
    GIT_AUTHOR_EMAIL: 'live-smoke@example.invalid',
    GIT_COMMITTER_NAME: 'CodeAgora Live Smoke',
    GIT_COMMITTER_EMAIL: 'live-smoke@example.invalid',
  });
  git(['commit', '-m', 'fixture'], dir, {
    GIT_AUTHOR_NAME: 'CodeAgora Live Smoke',
    GIT_AUTHOR_EMAIL: 'live-smoke@example.invalid',
    GIT_COMMITTER_NAME: 'CodeAgora Live Smoke',
    GIT_COMMITTER_EMAIL: 'live-smoke@example.invalid',
  });

  writeFile(path.join(dir, 'src', 'app.ts'), 'export const value = 2;\n');
  git(['add', 'src/app.ts'], dir);
  return dir;
}

async function runLiveReview(workspace) {
  assert(fs.existsSync(cliBinary), `CLI bundle is missing: ${path.relative(repoRoot, cliBinary)}`);

  const child = spawn(process.execPath, [cliBinary, 'review', '--staged', '--json-stream'], {
    cwd: workspace,
    env: {
      ...process.env,
      CI: '1',
      FORCE_COLOR: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  const events = lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Review stream included invalid JSON: ${line}\n${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const resultEvent = [...events].reverse().find((event) => event && event.type === 'result');
  assert(resultEvent, `No result event found in review stream.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert(resultEvent.schemaVersion === 'codeagora.review.v1', 'Result stream used an unexpected schema version');
  assert(resultEvent.status === 'success', `Live review did not complete successfully: ${JSON.stringify(resultEvent, null, 2)}`);
  assert(typeof resultEvent.sessionId === 'string' && resultEvent.sessionId.trim(), 'Live review result is missing a sessionId');
  assert(typeof resultEvent.date === 'string' && resultEvent.date.trim(), 'Live review result is missing a date');
  assert(resultEvent.summary && typeof resultEvent.summary === 'object', 'Live review result is missing a summary');

  const sessionDir = path.join(workspace, '.ca', 'sessions', resultEvent.date, resultEvent.sessionId);
  assert(fs.existsSync(sessionDir), `Live review did not write a session directory: ${path.relative(workspace, sessionDir)}`);
  assert(fs.existsSync(path.join(sessionDir, 'report.md')), 'Live review session report is missing');
  assert(fs.existsSync(path.join(sessionDir, 'head-verdict.json')) || fs.existsSync(path.join(sessionDir, 'result.json')),
    'Live review session verdict is missing');

  console.log(`Live review smoke passed via ${resultEvent.sessionId} (${resultEvent.summary.decision ?? 'unknown'})`);
  console.log(`- ${path.relative(workspace, sessionDir)}`);
  return exitCode;
}

const workspace = createWorkspace();
try {
  const exitCode = await runLiveReview(workspace);
  assert(exitCode === 0, `Live review command exited with ${exitCode}`);
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
