#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';

function packFiles(cwd) {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.length === 0 || !Array.isArray(parsed[0].files)) {
    throw new Error(`Unexpected npm pack output for ${cwd}`);
  }
  return parsed[0].files.map((file) => file.path).sort();
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
    const match = files.find((file) => pattern.test(file));
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
], 'mcp');
assertExcludes(mcpFiles, [
  /^\.env$/,
  /(^|\/)src\/tests\//,
  /\.test\.[cm]?[jt]s$/,
], 'mcp');

console.log('OK: package dry-run contents verified');
console.log(`root files: ${rootFiles.length}`);
console.log(`mcp files: ${mcpFiles.length}`);
