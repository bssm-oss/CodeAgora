#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

const SENSITIVE_ENV_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'GITHUB_TOKEN',
  'GROQ_API_KEY',
  'NODE_AUTH_TOKEN',
  'NPM_TOKEN',
  'OPENAI_API_KEY',
  'OPENCODE_API_KEY',
  'OPENROUTER_API_KEY',
]);
const SENSITIVE_ENV_PATTERN = /(?:^|_)(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)(?:_|$)/i;
const MCP_TIMEOUT_MS = 5_000;
const CHILD_EXIT_GRACE_MS = 2_000;
const CLI_DIST_PATH = path.resolve('packages/cli/dist/index.js');
const SAMPLE_DIFF = [
  'diff --git a/src/example.ts b/src/example.ts',
  '--- a/src/example.ts',
  '+++ b/src/example.ts',
  '@@ -1,3 +1,4 @@',
  ' export function example() {',
  '+  const token = "example";',
  '   return true;',
  ' }',
  '',
].join('\n');
const AUTO_REVIEW_CONFIG = {
  mode: 'pragmatic',
  language: 'en',
  reviewers: { count: 1 },
  modelRouter: {
    enabled: true,
    providers: { openrouter: { enabled: true } },
    constraints: {
      familyDiversity: false,
      includeReasoning: true,
      minFamilies: 1,
      reasoningMin: 0,
      reasoningMax: 1,
      contextMin: '8k',
    },
    explorationRate: 0,
  },
  supporters: {
    pool: [{
      id: 's1',
      model: 'z-ai/glm-5.1',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 1,
      maxOutputTokens: 2048,
    }],
    pickCount: 1,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 'da',
      model: 'x-ai/grok-4.3',
      backend: 'api',
      provider: 'openrouter',
      enabled: true,
      timeout: 1,
      maxOutputTokens: 2048,
    },
    personaPool: ['.ca/personas/strict.md'],
    personaAssignment: 'random',
  },
  moderator: {
    model: 'openai/gpt-5.3-codex',
    backend: 'api',
    provider: 'openrouter',
    maxOutputTokens: 2048,
  },
  discussion: {
    maxRounds: 1,
    registrationThreshold: {
      HARSHLY_CRITICAL: 1,
      CRITICAL: 1,
      WARNING: 1,
      SUGGESTION: null,
    },
    codeSnippetRange: 10,
  },
  head: {
    backend: 'api',
    model: 'qwen/qwen3.7-max',
    provider: 'openrouter',
    enabled: true,
    timeout: 1,
    maxOutputTokens: 4096,
  },
  errorHandling: {
    maxRetries: 0,
    forfeitThreshold: 0.5,
  },
  autoApprove: {
    enabled: false,
  },
};

function smokeEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of Object.keys(env)) {
    if (SENSITIVE_ENV_KEYS.has(key) || SENSITIVE_ENV_PATTERN.test(key)) {
      env[key] = '';
    }
  }
  return env;
}

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    stdio: 'inherit',
    env: smokeEnv(),
    ...options,
  });
}

function runCapture(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: smokeEnv(),
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? 'signal'}): ${command} ${args.join(' ')}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function parsePackOutput(output, cwd) {
  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed);
  } catch (firstError) {
    const start = trimmed.indexOf('[');
    const end = trimmed.lastIndexOf(']');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch (secondError) {
        throw new Error(`npm pack returned invalid JSON for ${cwd}. parse=${firstError.message} fallback=${secondError.message}`);
      }
    }
    throw new Error(`npm pack returned invalid JSON for ${cwd}. parse=${firstError.message}`);
  }
}

function packTarball(cwd, destination) {
  const output = runCapture('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', destination], {
    cwd,
    env: smokeEnv({ npm_config_ignore_scripts: 'true' }),
  });
  const parsed = parsePackOutput(output, cwd);
  if (!Array.isArray(parsed) || parsed.length === 0 || typeof parsed[0].filename !== 'string') {
    throw new Error(`Unexpected npm pack output for ${cwd}`);
  }
  return path.join(destination, parsed[0].filename);
}

function binPath(installDir, name) {
  return path.join(installDir, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
}

function installTarball(tarballPath, label) {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), `codeagora-${label}-install-`));
  console.log(`$ npm install ${tarballPath}  # ${label} tarball install smoke`);
  runCapture('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarballPath], {
    cwd: installDir,
    env: smokeEnv({
      HOME: installDir,
      TMPDIR: installDir,
      XDG_CONFIG_HOME: installDir,
      npm_config_ignore_scripts: 'true',
    }),
  });
  return installDir;
}

function smokeRootPostinstall(rootTarball) {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-root-postinstall-'));
  try {
    console.log(`$ npm install --foreground-scripts ${rootTarball}  # root package postinstall smoke`);
    const output = runCapture('npm', ['install', '--foreground-scripts', '--no-audit', '--no-fund', rootTarball], {
      cwd: installDir,
      env: smokeEnv({
        HOME: installDir,
        TMPDIR: installDir,
        XDG_CONFIG_HOME: installDir,
      }),
    });
    if (!output.includes('CodeAgora') || !output.includes('agora init')) {
      throw new Error('Root package postinstall smoke did not print expected onboarding output');
    }
    console.log('OK: root package postinstall smoke passed');
  } finally {
    fs.rmSync(installDir, { recursive: true, force: true });
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function writeJsonLine(child, message) {
  const line = `${JSON.stringify(message)}\n`;
  if (child.stdin.write(line)) {
    return;
  }
  await new Promise((resolve, reject) => {
    child.stdin.once('drain', resolve);
    child.stdin.once('error', reject);
  });
}

function hasExpectedTools(stdout) {
  return stdout.includes('review_quick') && stdout.includes('review_full') && stdout.includes('config_get');
}

function waitForMcpTools(child, getOutput) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('MCP tools/list smoke timed out'));
    }, MCP_TIMEOUT_MS);
    timeout.unref?.();

    const check = () => {
      if (hasExpectedTools(getOutput().stdout)) {
        cleanup();
        resolve();
      }
    };
    const fail = (error) => {
      cleanup();
      reject(error);
    };
    const closeBeforeResponse = (code, signal) => {
      cleanup();
      const { stdout, stderr } = getOutput();
      reject(new Error(`MCP server exited before tools/list completed. code=${code ?? 'null'} signal=${signal ?? 'null'} stdout=${stdout} stderr=${stderr}`));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off('data', check);
      child.stderr.off('data', check);
      child.stdin.off('error', fail);
      child.off('error', fail);
      child.off('close', closeBeforeResponse);
    };

    child.stdout.on('data', check);
    child.stderr.on('data', check);
    child.stdin.once('error', fail);
    child.once('error', fail);
    child.once('close', closeBeforeResponse);
    check();
  });
}

async function closeChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const closed = new Promise((resolve) => {
    child.once('close', resolve);
  });
  child.stdin.end();
  if (await Promise.race([closed.then(() => true), delay(CHILD_EXIT_GRACE_MS).then(() => false)])) {
    return;
  }
  child.kill('SIGTERM');
  if (await Promise.race([closed.then(() => true), delay(CHILD_EXIT_GRACE_MS).then(() => false)])) {
    return;
  }
  child.kill('SIGKILL');
  await closed;
}

async function smokeMcpServer(command = process.execPath, args = ['packages/mcp/dist/index.js'], label = 'MCP') {
  console.log(`$ ${command} ${args.join(' ')}  # ${label} initialize + tools/list smoke`);
  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: smokeEnv(),
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf-8');
  child.stderr.setEncoding('utf-8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'codeagora-beta-smoke', version: '0.0.0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ];

  try {
    const toolsReady = waitForMcpTools(child, () => ({ stdout, stderr }));
    for (const message of messages) {
      await writeJsonLine(child, message);
    }
    await toolsReady;
  } catch (error) {
    throw new Error(`MCP tools/list smoke failed. stdout=${stdout} stderr=${stderr}`, { cause: error });
  } finally {
    await closeChild(child);
  }

  console.log(`OK: ${label} tools/list smoke passed`);
}

// --- Provider-free tool smoke for config_get via tools/call ---
async function smokeMcpConfigGet(command = process.execPath, args = ['packages/mcp/dist/index.js'], label = 'MCP') {
  console.log(`$ ${command} ${args.join(' ')}  # ${label} config_get tool smoke`);
  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: smokeEnv(),
  });

  let stdout = '';
  let stderr = '';
  let responses = [];
  let parseError = null;
  child.stdout.setEncoding('utf-8');
  child.stderr.setEncoding('utf-8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    for (const line of chunk.split('\n')) {
      if (line.trim().startsWith('{')) {
        try {
          const msg = JSON.parse(line);
          responses.push(msg);
        } catch (err) {
          parseError = `MCP config_get stdout parse error: ${err instanceof Error ? err.message : String(err)} line=${line}`;
        }
      }
    }
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'codeagora-beta-smoke', version: '0.0.0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
    // Correct protocol: tools/call for config_get
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'config_get', arguments: {} } },
  ];

  let errorToLog = null;
  try {
    for (const message of messages) {
      await writeJsonLine(child, message);
    }
    // Wait for config_get response or timeout
    const start = Date.now();
    let found = false;
    while (Date.now() - start < MCP_TIMEOUT_MS) {
      await delay(50);
      const configResp = responses.find(r => r.id === 3);
      if (configResp) {
        found = true;
        if (configResp.error) {
          errorToLog = `MCP config_get returned error: ${JSON.stringify(configResp.error)}`;
          break;
        }
        if (!configResp.result || typeof configResp.result !== 'object') {
          errorToLog = `MCP config_get returned invalid result: ${JSON.stringify(configResp)}`;
          break;
        }
        // Expect at least a reviewers array or config object
        if (!('content' in configResp.result) && !('reviewers' in configResp.result)) {
          errorToLog = `MCP config_get result missing expected keys: ${JSON.stringify(configResp.result)}`;
          break;
        }
        // Passed!
        break;
      }
    }
    if (!found) {
      errorToLog = `MCP config_get smoke timed out. stdout=${stdout} stderr=${stderr}`;
    }
    if (!errorToLog && parseError) {
      errorToLog = parseError;
    }
    if (errorToLog) {
      // Write RED evidence log
      const evidencePath = path.join('.sisyphus', 'evidence', 'task-8-mcp-package-red.log');
      fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
      fs.writeFileSync(evidencePath, errorToLog + `\nstdout=${stdout}\nstderr=${stderr}`);
      throw new Error(errorToLog);
    }
  } finally {
    await closeChild(child);
  }
  console.log(`OK: ${label} config_get smoke passed`);
}

async function smokeMcpDryRun(command = process.execPath, args = ['packages/mcp/dist/index.js'], label = 'MCP') {
  console.log(`$ ${command} ${args.join(' ')}  # ${label} dry_run tool smoke`);
  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: smokeEnv(),
  });

  let stdout = '';
  let stderr = '';
  let stdoutBuffer = '';
  const responses = [];
  child.stdout.setEncoding('utf-8');
  child.stderr.setEncoding('utf-8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim().startsWith('{')) continue;
      try {
        responses.push(JSON.parse(line));
      } catch {
        // Keep collecting; final validation prints stdout/stderr on failure.
      }
    }
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'codeagora-beta-smoke', version: '0.0.0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'dry_run', arguments: { diff: SAMPLE_DIFF } } },
  ];

  try {
    for (const message of messages) {
      await writeJsonLine(child, message);
    }
    const start = Date.now();
    let dryRunResp;
    while (Date.now() - start < MCP_TIMEOUT_MS) {
      await delay(50);
      dryRunResp = responses.find((response) => response.id === 4);
      if (dryRunResp) break;
    }

    if (!dryRunResp) {
      throw new Error(`${label} dry_run smoke timed out. stdout=${stdout} stderr=${stderr}`);
    }
    if (dryRunResp.error) {
      throw new Error(`${label} dry_run returned error: ${JSON.stringify(dryRunResp.error)}`);
    }
    const text = dryRunResp.result?.content?.[0]?.text;
    if (typeof text !== 'string' || !text.includes('estimatedCost')) {
      throw new Error(`${label} dry_run result missing estimatedCost: ${JSON.stringify(dryRunResp)}`);
    }
  } finally {
    await closeChild(child);
  }

  console.log(`OK: ${label} dry_run smoke passed`);
}

function smokeInstalledCli(rootTarball) {
  const installDir = installTarball(rootTarball, 'root-cli');
  try {
    const agora = binPath(installDir, 'agora');
    const help = runCapture(agora, ['--help'], { cwd: installDir, env: smokeEnv({ HOME: installDir, XDG_CONFIG_HOME: installDir }) });
    if (!help.includes('CodeAgora') && !help.includes('agora')) {
      throw new Error('Tarball-installed CLI help smoke failed');
    }

    const providers = runCapture(agora, ['providers'], { cwd: installDir, env: smokeEnv({ HOME: installDir, XDG_CONFIG_HOME: installDir }) });
    if (!providers.includes('groq') || !providers.includes('openai')) {
      throw new Error('Tarball-installed CLI providers smoke did not load bundled model/provider data');
    }

    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-tarball-cli-repo-'));
    try {
      runCapture(agora, ['init', '--yes'], {
        cwd: repoDir,
        env: smokeEnv({ HOME: repoDir, TMPDIR: repoDir, XDG_CONFIG_HOME: repoDir }),
      });
      const diffPath = path.join(repoDir, 'changes.diff');
      fs.writeFileSync(diffPath, SAMPLE_DIFF, 'utf-8');
      const dryRun = runCapture(agora, ['review', 'changes.diff', '--dry-run', '--output', 'json'], {
        cwd: repoDir,
        env: smokeEnv({ HOME: repoDir, TMPDIR: repoDir, XDG_CONFIG_HOME: repoDir }),
      });
      const parsed = JSON.parse(dryRun);
      if (!parsed.estimation || typeof parsed.estimation.totalEstimatedCost !== 'string') {
        throw new Error('Tarball-installed CLI dry-run did not load pricing/model runtime data');
      }
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }

    console.log('OK: tarball-installed CLI runtime smoke passed');
  } finally {
    fs.rmSync(installDir, { recursive: true, force: true });
  }
}

async function smokeInstalledMcpAutoReview(command, repoDir) {
  console.log(`$ ${command}  # tarball-installed MCP auto review_quick smoke`);
  const child = spawn(command, [], {
    cwd: repoDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: smokeEnv({
      HOME: repoDir,
      TMPDIR: repoDir,
      XDG_CONFIG_HOME: repoDir,
    }),
  });

  let stdout = '';
  let stderr = '';
  let stdoutBuffer = '';
  const responses = [];
  child.stdout.setEncoding('utf-8');
  child.stderr.setEncoding('utf-8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim().startsWith('{')) continue;
      try {
        responses.push(JSON.parse(line));
      } catch {
        // Keep collecting; final validation prints stdout/stderr on failure.
      }
    }
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'codeagora-beta-smoke', version: '0.0.0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
    {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'review_quick',
        arguments: {
          diff: SAMPLE_DIFF,
          timeout_seconds: 1,
          reviewer_timeout_seconds: 1,
          no_cache: true,
        },
      },
    },
  ];

  try {
    for (const message of messages) {
      await writeJsonLine(child, message);
    }
    const start = Date.now();
    let reviewResp;
    while (Date.now() - start < MCP_TIMEOUT_MS * 3) {
      await delay(50);
      reviewResp = responses.find((response) => response.id === 5);
      if (reviewResp) break;
    }

    if (!reviewResp) {
      throw new Error(`tarball-installed MCP auto review smoke timed out. stdout=${stdout} stderr=${stderr}`);
    }
    if (reviewResp.error) {
      throw new Error(`tarball-installed MCP auto review returned protocol error: ${JSON.stringify(reviewResp.error)}`);
    }
    const text = reviewResp.result?.content?.[0]?.text;
    if (typeof text !== 'string' || !text.includes('provider/API failures')) {
      throw new Error(`tarball-installed MCP auto review did not reach provider failure path: ${JSON.stringify(reviewResp)}`);
    }
    if (text.includes('runtime data') || text.includes('Model registry runtime data files not found')) {
      throw new Error(`tarball-installed MCP auto review failed before loading bundled runtime data: ${text}`);
    }
  } finally {
    await closeChild(child);
  }

  console.log('OK: tarball-installed MCP auto review_quick smoke passed');
}

async function smokeInstalledMcp(mcpTarball) {
  const installDir = installTarball(mcpTarball, 'mcp');
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-mcp-auto-review-'));
  try {
    const mcp = binPath(installDir, 'codeagora-mcp');
    await smokeMcpServer(mcp, [], 'tarball-installed MCP');
    await smokeMcpConfigGet(mcp, [], 'tarball-installed MCP');
    await smokeMcpDryRun(mcp, [], 'tarball-installed MCP');
    fs.mkdirSync(path.join(repoDir, '.ca'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, '.ca', 'config.json'), JSON.stringify(AUTO_REVIEW_CONFIG, null, 2));
    await smokeInstalledMcpAutoReview(mcp, repoDir);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(installDir, { recursive: true, force: true });
  }
}

run('pnpm', ['build']);
run('pnpm', ['build:action']);
run('pnpm', ['exec', 'node', 'scripts/verify-package-contents.mjs']);

const help = runCapture(process.execPath, [CLI_DIST_PATH, '--help']);
if (!help.includes('CodeAgora') && !help.includes('agora')) {
  throw new Error('CLI help smoke failed');
}
console.log('OK: CLI help smoke passed');

const initDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-beta-smoke-'));
try {
  console.log(`$ node ${CLI_DIST_PATH} init --yes  # CLI init smoke`);
  runCapture(process.execPath, [CLI_DIST_PATH, 'init', '--yes'], {
    cwd: initDir,
    env: smokeEnv({
      HOME: initDir,
      TMPDIR: initDir,
      XDG_CONFIG_HOME: initDir,
    }),
  });

  // Smoke verifies .ca/config.json is created in the temp dir.
  const configPath = path.join(initDir, '.ca', 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`CLI init smoke failed: missing ${configPath}`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('CLI init smoke failed: config root is not an object');
  }
  if (!Array.isArray(config.reviewers) || config.reviewers.length === 0) {
    throw new Error('CLI init smoke failed: reviewers array missing or empty');
  }
  for (const reviewer of config.reviewers) {
    if (!reviewer || typeof reviewer !== 'object' || Array.isArray(reviewer)) {
      throw new Error('CLI init smoke failed: reviewer entry is not an object');
    }
    if (typeof reviewer.provider !== 'string' || reviewer.provider.length === 0) {
      throw new Error('CLI init smoke failed: reviewer provider missing');
    }
    if (typeof reviewer.backend !== 'string' || reviewer.backend.length === 0) {
      throw new Error('CLI init smoke failed: reviewer backend missing');
    }
    if (typeof reviewer.model !== 'string' || reviewer.model.length === 0) {
      throw new Error('CLI init smoke failed: reviewer model missing');
    }
  }
  console.log('OK: CLI init smoke passed');
} finally {
  fs.rmSync(initDir, { recursive: true, force: true });
}

await smokeMcpServer();
await smokeMcpConfigGet();
await smokeMcpDryRun();

const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-pack-'));
try {
  const rootTarball = packTarball(process.cwd(), packDir);
  const mcpTarball = packTarball(path.resolve('packages/mcp'), packDir);
  smokeRootPostinstall(rootTarball);
  smokeInstalledCli(rootTarball);
  await smokeInstalledMcp(mcpTarball);
} finally {
  fs.rmSync(packDir, { recursive: true, force: true });
}

console.log('OK: beta smoke passed');
