#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';

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

function packEnv() {
  const env = { ...process.env, npm_config_ignore_scripts: 'true' };
  for (const key of Object.keys(env)) {
    if (SENSITIVE_ENV_KEYS.has(key) || SENSITIVE_ENV_PATTERN.test(key)) {
      env[key] = '';
    }
  }
  return env;
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

function normalizePackPath(file) {
  return file.replace(/\\/g, '/');
}

function packFiles(cwd) {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: packEnv(),
  });
  const parsed = parsePackOutput(output, cwd);
  if (!Array.isArray(parsed) || parsed.length === 0 || !Array.isArray(parsed[0].files)) {
    throw new Error(`Unexpected npm pack output for ${cwd}`);
  }
  return parsed[0].files.map((file) => {
    if (typeof file.path !== 'string') {
      throw new Error(`Unexpected npm pack file entry for ${cwd}`);
    }
    return normalizePackPath(file.path);
  }).sort();
}

function assertIncludes(files, expected, label) {
  for (const file of expected) {
    if (!files.includes(file)) {
      throw new Error(`${label} package is missing ${file}`);
    }
  }
}

function assertExcludes(files, forbidden, label) {
  for (const pattern of forbidden) {
    const match = files.find((file) => pattern.test(normalizePackPath(file)));
    if (match) {
      throw new Error(`${label} package includes forbidden file ${match}`);
    }
  }
}

const repoRoot = process.cwd();
const rootFiles = packFiles(repoRoot);
assertIncludes(rootFiles, [
  'package.json',
  'README.md',
  'LICENSE',
  'packages/cli/dist/index.js',
  'scripts/postinstall.cjs',
], 'root');
assertExcludes(rootFiles, [
  /^\.env$/,
  /^bench-out/,
  /^\.sisyphus\//,
  /(^|\/)src\/tests\//,
  /\.test\.[cm]?[jt]s$/,
], 'root');

const mcpRoot = path.join(repoRoot, 'packages/mcp');
const mcpFiles = packFiles(mcpRoot);
assertIncludes(mcpFiles, [
  'package.json',
  'README.md',
  'dist/index.js',
  'dist/data/model-rankings.json',
  'dist/data/groq-models.json',
  'dist/data/pricing.json',
], 'mcp');
assertExcludes(mcpFiles, [
  /^\.env$/,
  /(^|\/)src\/tests\//,
  /\.test\.[cm]?[jt]s$/,
], 'mcp');

// Ensure shared package bundles runtime model/pricing data used by core
const sharedRoot = path.join(repoRoot, 'packages/shared');
const sharedFiles = packFiles(sharedRoot);
assertIncludes(sharedFiles, [
  'package.json',
  'dist/index.js',
  'dist/data/model-rankings.json',
  'dist/data/groq-models.json',
  'dist/data/pricing.json',
], 'shared');

console.log('OK: package dry-run contents verified');
console.log(`root files: ${rootFiles.length}`);
console.log(`mcp files: ${mcpFiles.length}`);
console.log(`shared files: ${sharedFiles.length}`);
