#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { recordGateCommandEvidence } from './evidence-recorder.mjs';
import {
  DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_FILENAME,
  readDesktopStableDistributionEvidence,
  validateDesktopStableDistributionEvidence,
} from '../packages/desktop/scripts/desktop-artifacts.mjs';

export const DESKTOP_STABLE_DISTRIBUTION_GATE = {
  name: 'desktop-stable-distribution-gate',
  filename: 'desktop-stable-distribution-gate.log',
  command: 'pnpm stable:desktop-distribution-gate',
};

function parseArgs(argv) {
  const options = {
    cwd: process.cwd(),
    evidenceDir: path.join('.sisyphus', 'evidence'),
    version: undefined,
    requireManifest: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--evidence-dir') {
      options.evidenceDir = argv[++index];
    } else if (arg?.startsWith('--evidence-dir=')) {
      options.evidenceDir = arg.slice('--evidence-dir='.length);
    } else if (arg === '--version') {
      options.version = argv[++index];
    } else if (arg?.startsWith('--version=')) {
      options.version = arg.slice('--version='.length);
    } else if (arg === '--require-manifest') {
      options.requireManifest = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function latestManifestEntry(evidenceDir, name) {
  const manifestPath = path.resolve(evidenceDir, 'evidence-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.entries?.find((entry) => entry.name === name) ?? null;
}

export function runDesktopStableDistributionGate(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const evidenceDir = path.resolve(cwd, options.evidenceDir ?? path.join('.sisyphus', 'evidence'));
  const startedAt = new Date().toISOString();
  const readResult = readDesktopStableDistributionEvidence({ cwd, evidenceRoot: evidenceDir });
  const validation = validateDesktopStableDistributionEvidence(readResult.evidence, {
    version: options.version,
  });
  const errors = [...validation.errors];
  const manifestEntry = latestManifestEntry(evidenceDir, 'desktop-stable-distribution-evidence');

  if (options.requireManifest && !manifestEntry) {
    errors.push('evidence-manifest.json must include desktop-stable-distribution-evidence');
  }
  if (manifestEntry && manifestEntry.releaseValidity?.validForRelease !== true) {
    errors.push('evidence manifest did not mark desktop-stable-distribution-evidence valid for release');
  }

  const passed = readResult.present && errors.length === 0;
  const result = {
    ...DESKTOP_STABLE_DISTRIBUTION_GATE,
    schemaVersion: 'codeagora.desktop-stable-distribution-gate.v1',
    evidencePath: readResult.relativePath,
    evidencePresent: readResult.present,
    validation,
    manifestEntry: manifestEntry
      ? {
          name: manifestEntry.name,
          exists: manifestEntry.exists,
          releaseValidity: manifestEntry.releaseValidity,
          path: manifestEntry.path,
        }
      : null,
    passed,
    errors,
    exitCode: passed ? 0 : 1,
    signal: null,
    startedAt,
    finishedAt: new Date().toISOString(),
  };

  fs.mkdirSync(evidenceDir, { recursive: true });
  const logPath = path.join(evidenceDir, DESKTOP_STABLE_DISTRIBUTION_GATE.filename);
  const log = [
    `$ ${DESKTOP_STABLE_DISTRIBUTION_GATE.command}`,
    `name: ${DESKTOP_STABLE_DISTRIBUTION_GATE.name}`,
    `exitCode: ${result.exitCode}`,
    `startedAt: ${result.startedAt}`,
    `finishedAt: ${result.finishedAt}`,
    '',
    JSON.stringify(result, null, 2),
    '',
  ].join('\n');
  fs.writeFileSync(logPath, log, 'utf8');
  result.logPath = path.relative(cwd, logPath);
  result.evidenceEntry = recordGateCommandEvidence({
    ...DESKTOP_STABLE_DISTRIBUTION_GATE,
    stdout: log,
    stderr: errors.join('\n'),
    exitCode: result.exitCode,
    signal: null,
    passed,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    logPath: result.logPath,
  }, {
    cwd,
    evidenceDir,
  }).entry;

  return result;
}

function formatResult(result) {
  const header = `[${result.passed ? 'PASS' : 'FAIL'}] ${DESKTOP_STABLE_DISTRIBUTION_GATE.name}: ${DESKTOP_STABLE_DISTRIBUTION_GATE.command}`;
  if (result.passed) {
    return `${header}\nValidated ${DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_FILENAME} for ${result.validation.version}\n`;
  }
  return `${header}\n${result.errors.map((error) => `- ${error}`).join('\n')}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = runDesktopStableDistributionGate(options);
  process.stdout.write(formatResult(result));
  if (!result.passed) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
