#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCHEMA_VERSION = 'codeagora.release-evidence.v1';
const RELEASE_TIERS = ['beta', 'rc', 'stable'];

const EXPECTED_EVIDENCE = [
  { name: 'typecheck', filename: 'typecheck.log', command: 'pnpm typecheck', tier: 'beta', redactionStatus: 'safe-to-publish' },
  { name: 'lint', filename: 'lint.log', command: 'pnpm lint', tier: 'beta', redactionStatus: 'safe-to-publish' },
  { name: 'build', filename: 'build.log', command: 'pnpm build', tier: 'beta', redactionStatus: 'safe-to-publish' },
  { name: 'test', filename: 'test.log', command: 'pnpm test --no-file-parallelism', tier: 'beta', redactionStatus: 'safe-to-publish' },
  { name: 'cross-surface-parity', filename: 'cross-surface-parity.log', command: 'pnpm vitest run src/tests/cross-surface-parity.test.ts', tier: 'rc', redactionStatus: 'safe-to-publish' },
  { name: 'bench-ci', filename: 'bench-ci.log', command: 'pnpm bench:ci', tier: 'beta', redactionStatus: 'safe-to-publish' },
  { name: 'beta-smoke', filename: 'beta-smoke.log', command: 'pnpm release:beta-smoke', tier: 'beta', redactionStatus: 'safe-to-publish' },
  { name: 'package-root-dry-run', filename: 'package-root-dry-run.log', command: 'pnpm pack --dry-run', tier: 'rc', redactionStatus: 'safe-to-publish' },
  { name: 'package-mcp-dry-run', filename: 'package-mcp-dry-run.log', command: 'pnpm --filter @codeagora/mcp pack --dry-run', tier: 'rc', redactionStatus: 'safe-to-publish' },
  { name: 'action-smoke', filename: 'action-smoke.log', command: 'pnpm build:action && pnpm release:beta-smoke', tier: 'rc', redactionStatus: 'safe-to-publish' },
  { name: 'mcp-smoke', filename: 'mcp-smoke.log', command: 'covered by pnpm release:beta-smoke', tier: 'rc', redactionStatus: 'safe-to-publish' },
  { name: 'security-regression', filename: 'security-regression.log', command: 'pnpm test:security', tier: 'rc', redactionStatus: 'safe-to-publish' },
  { name: 'live-benchmark-report', filename: 'live-benchmark-report.md', command: 'pnpm bench:fn:run with provider secrets', tier: 'stable', redactionStatus: 'redacted-required', liveOnly: true },
  { name: 'live-github-action-pr-smoke', filename: 'live-github-action-pr-smoke.md', command: 'manual GitHub Action PR smoke matrix', tier: 'stable', redactionStatus: 'redacted-required', liveOnly: true },
];

function parseArgs(argv) {
  const options = {
    evidenceDir: path.join('.sisyphus', 'evidence'),
    output: undefined,
    require: undefined,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--evidence-dir') {
      options.evidenceDir = argv[++index];
    } else if (arg?.startsWith('--evidence-dir=')) {
      options.evidenceDir = arg.slice('--evidence-dir='.length);
    } else if (arg === '--output') {
      options.output = argv[++index];
    } else if (arg?.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
    } else if (arg === '--require') {
      options.require = argv[++index];
    } else if (arg?.startsWith('--require=')) {
      options.require = arg.slice('--require='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.require && !RELEASE_TIERS.includes(options.require)) {
    throw new Error(`--require must be one of: ${RELEASE_TIERS.join(', ')}`);
  }

  return options;
}

function commitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function tierIncluded(entryTier, requiredTier) {
  return RELEASE_TIERS.indexOf(entryTier) <= RELEASE_TIERS.indexOf(requiredTier);
}

function buildManifest(options) {
  const evidenceDir = path.resolve(options.evidenceDir);
  const entries = EXPECTED_EVIDENCE.map((entry) => {
    const artifactPath = path.join(evidenceDir, entry.filename);
    const exists = fs.existsSync(artifactPath);
    const stat = exists ? fs.statSync(artifactPath) : undefined;
    return {
      ...entry,
      path: path.relative(process.cwd(), artifactPath),
      exists,
      sizeBytes: stat?.size ?? 0,
      sha256: exists ? sha256(artifactPath) : null,
    };
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    commitSha: commitSha(),
    evidenceDir: path.relative(process.cwd(), evidenceDir),
    entries,
  };
}

function enforceRequired(manifest, requiredTier) {
  if (!requiredTier) return;
  const missing = manifest.entries.filter((entry) => tierIncluded(entry.tier, requiredTier) && !entry.exists);
  if (missing.length === 0) return;
  const names = missing.map((entry) => `${entry.filename} (${entry.tier})`).join(', ');
  throw new Error(`Missing required ${requiredTier} evidence: ${names}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(options.output ?? path.join(options.evidenceDir, 'evidence-manifest.json'));
  const manifest = buildManifest(options);
  enforceRequired(manifest, options.require);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
