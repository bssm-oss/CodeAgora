#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { recordGateCommandEvidence } from './evidence-recorder.mjs';
import { spawnProcess } from './release-gate-runner.mjs';

export const DESKTOP_RELEASE_GATE = {
  name: 'desktop-gate',
  filename: 'desktop-gate.log',
  command: 'pnpm rc:desktop-gate',
};

export const DESKTOP_RELEASE_CHECKS = [
  {
    name: 'desktop-typecheck',
    filename: 'desktop-typecheck.log',
    command: 'pnpm --filter @codeagora/desktop typecheck',
    file: 'pnpm',
    args: ['--filter', '@codeagora/desktop', 'typecheck'],
  },
  {
    name: 'desktop-smoke',
    filename: 'desktop-smoke.log',
    command: 'pnpm --filter @codeagora/desktop smoke',
    file: 'pnpm',
    args: ['--filter', '@codeagora/desktop', 'smoke'],
  },
  {
    name: 'desktop-tauri-check',
    filename: 'desktop-tauri-check.log',
    command: 'pnpm --filter @codeagora/desktop tauri:check',
    file: 'pnpm',
    args: ['--filter', '@codeagora/desktop', 'tauri:check'],
  },
  {
    name: 'desktop-tauri-file-access-boundary',
    filename: 'desktop-tauri-file-access-boundary.log',
    command: 'pnpm --filter @codeagora/desktop tauri:test',
    file: 'pnpm',
    args: ['--filter', '@codeagora/desktop', 'tauri:test'],
  },
  {
    name: 'desktop-app-e2e',
    filename: 'desktop-app-e2e.log',
    command: 'pnpm desktop:app-e2e',
    file: 'pnpm',
    args: ['desktop:app-e2e'],
  },
  {
    name: 'desktop-macos-webdriver-e2e',
    filename: 'desktop-macos-webdriver-e2e.log',
    command: 'pnpm desktop:macos-webdriver-e2e',
    file: 'pnpm',
    args: ['desktop:macos-webdriver-e2e'],
  },
  {
    name: 'desktop-visual-qa',
    filename: 'desktop-visual-qa.log',
    command: 'pnpm desktop:visual-qa',
    file: 'pnpm',
    args: ['desktop:visual-qa'],
  },
  {
    name: 'desktop-evidence-manifest',
    filename: 'desktop-evidence.log',
    command: 'pnpm desktop:evidence',
    file: 'pnpm',
    args: ['desktop:evidence'],
  },
  {
    name: 'desktop-security-evidence',
    filename: 'desktop-security-evidence.log',
    command: 'pnpm evidence:desktop-security',
    file: 'pnpm',
    args: ['evidence:desktop-security'],
  },
  {
    name: 'desktop-bundle-smoke',
    filename: 'desktop-bundle-smoke.log',
    command: 'pnpm desktop:bundle-smoke',
    file: 'pnpm',
    args: ['desktop:bundle-smoke'],
  },
];

function normalizeProcessResult(result) {
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: Number.isInteger(result.exitCode) ? result.exitCode : 1,
    signal: result.signal ?? null,
  };
}

function formatCheckLog(result) {
  const lines = [
    `$ ${result.command}`,
    `name: ${result.name}`,
    `exitCode: ${result.exitCode}`,
    `startedAt: ${result.startedAt}`,
    `finishedAt: ${result.finishedAt}`,
    '',
    '--- stdout ---',
    result.stdout ?? '',
    '',
    '--- stderr ---',
    result.stderr ?? '',
  ];
  return `${lines.join('\n')}\n`;
}

function writeCheckLog(result, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const evidenceDir = path.resolve(cwd, options.evidenceDir ?? path.join('.sisyphus', 'evidence'));
  const logPath = path.join(evidenceDir, result.filename);

  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(logPath, formatCheckLog(result), 'utf8');
  return path.relative(cwd, logPath);
}

export function formatDesktopReleaseGateOutput(result) {
  const lines = [
    `[${result.passed ? 'PASS' : 'FAIL'}] ${result.name}: ${result.command}`,
    ...result.checks.map(
      (check) => `[${check.passed ? 'PASS' : 'FAIL'}] ${check.name}: ${check.command}`,
    ),
  ];
  const stdout = result.stdout ? `\n${result.stdout.trimEnd()}` : '';
  return `${lines.join('\n')}${stdout}\n`;
}

export async function runDesktopReleaseGate(options = {}) {
  const runProcess = options.runProcess ?? spawnProcess;
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const startedAt = new Date().toISOString();
  const checks = [];

  for (const check of options.checks ?? DESKTOP_RELEASE_CHECKS) {
    const checkStartedAt = new Date().toISOString();
    const processResult = normalizeProcessResult(
      await runProcess({
        gate: DESKTOP_RELEASE_GATE,
        check,
        command: check.command,
        file: check.file,
        args: check.args,
        cwd,
        env,
      }),
    );
    const checkResult = {
      ...check,
      ...processResult,
      passed: processResult.exitCode === 0,
      startedAt: checkStartedAt,
      finishedAt: new Date().toISOString(),
    };
    checks.push(checkResult);

    if (options.recordEvidence) {
      checkResult.logPath = writeCheckLog(checkResult, { cwd, evidenceDir: options.evidenceDir });
      checkResult.evidenceEntry = recordGateCommandEvidence(checkResult, {
        cwd,
        evidenceDir: options.evidenceDir,
        ledgerPath: options.ledgerPath,
      }).entry;
    }

    if (!checkResult.passed) {
      break;
    }
  }

  const exitCode = checks.find((check) => check.exitCode !== 0)?.exitCode ?? 0;
  const result = {
    ...DESKTOP_RELEASE_GATE,
    stdout: checks.map((check) => formatCheckLog(check)).join(''),
    stderr: checks.map((check) => check.stderr).filter(Boolean).join(''),
    exitCode,
    signal: checks.find((check) => check.signal)?.signal ?? null,
    passed: exitCode === 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    checks,
  };

  if (options.recordEvidence) {
    const recorded = recordGateCommandEvidence(result, {
      cwd,
      evidenceDir: options.evidenceDir,
      ledgerPath: options.ledgerPath,
    });
    result.logPath = recorded.entry.logPath;
    result.evidenceEntry = recorded.entry;
  }

  return result;
}

async function main() {
  const result = await runDesktopReleaseGate({ recordEvidence: true });
  process.stdout.write(formatDesktopReleaseGateOutput(result));
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
