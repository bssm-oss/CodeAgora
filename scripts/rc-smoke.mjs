#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      NPM_TOKEN: '',
      NODE_AUTH_TOKEN: '',
    },
    ...options,
  });
}

function runCapture(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  return execFileSync(command, args, {
    encoding: 'utf-8',
    env: {
      ...process.env,
      NPM_TOKEN: '',
      NODE_AUTH_TOKEN: '',
    },
    ...options,
  });
}

async function smokeMcpServer() {
  console.log('$ node packages/mcp/dist/index.js  # MCP initialize + tools/list smoke');
  const child = spawn(process.execPath, ['packages/mcp/dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NPM_TOKEN: '',
      NODE_AUTH_TOKEN: '',
    },
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
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'codeagora-rc-smoke', version: '0.0.0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ];
  for (const message of messages) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  await new Promise((resolve) => setTimeout(resolve, 1_000));
  child.kill('SIGTERM');

  if (!stdout.includes('review_quick') || !stdout.includes('review_full') || !stdout.includes('config_get')) {
    throw new Error(`MCP tools/list smoke failed. stdout=${stdout} stderr=${stderr}`);
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
console.log('OK: release candidate smoke passed');
