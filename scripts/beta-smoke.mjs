#!/usr/bin/env node
import { execFileSync, spawn, spawnSync } from 'node:child_process';

const SENSITIVE_ENV_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'CEREBRAS_API_KEY',
  'DEEPSEEK_API_KEY',
  'GITHUB_TOKEN',
  'GOOGLE_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GROQ_API_KEY',
  'MISTRAL_API_KEY',
  'NODE_AUTH_TOKEN',
  'NPM_TOKEN',
  'NVIDIA_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'QWEN_API_KEY',
  'TOGETHER_API_KEY',
  'XAI_API_KEY',
  'ZAI_API_KEY',
]);
const SENSITIVE_ENV_PATTERN = /(?:^|_)(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)(?:_|$)/i;
const MCP_TIMEOUT_MS = 5_000;
const CHILD_EXIT_GRACE_MS = 2_000;

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

async function smokeMcpServer() {
  console.log('$ node packages/mcp/dist/index.js  # MCP initialize + tools/list smoke');
  const child = spawn(process.execPath, ['packages/mcp/dist/index.js'], {
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

  console.log('OK: MCP tools/list smoke passed');
}

run('pnpm', ['build']);
run('pnpm', ['build:action']);
run('pnpm', ['exec', 'node', 'scripts/verify-package-contents.mjs']);

const help = runCapture(process.execPath, ['packages/cli/dist/index.js', '--help']);
if (!help.includes('CodeAgora') && !help.includes('agora')) {
  throw new Error('CLI help smoke failed');
}
console.log('OK: CLI help smoke passed');

await smokeMcpServer();
console.log('OK: beta smoke passed');
