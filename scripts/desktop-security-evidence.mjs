#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnProcess } from './release-gate-runner.mjs';

export const DESKTOP_SECURITY_EVIDENCE_SCHEMA_VERSION = 'codeagora.desktop-security-evidence.v1';

export const DESKTOP_SECURITY_TEST_COMMANDS = [
  {
    name: 'desktop-security-vitest',
    raw: [
      'pnpm',
      'vitest',
      'run',
      'src/tests/desktop-webdriver-security.test.ts',
      'src/tests/desktop-tauri-capabilities.test.ts',
      'src/tests/desktop-external-links.test.ts',
    ].join(' '),
    file: 'pnpm',
    args: [
      'vitest',
      'run',
      'src/tests/desktop-webdriver-security.test.ts',
      'src/tests/desktop-tauri-capabilities.test.ts',
      'src/tests/desktop-external-links.test.ts',
    ],
  },
  {
    name: 'desktop-tauri-security',
    raw: 'pnpm --filter @codeagora/desktop tauri:test',
    file: 'pnpm',
    args: ['--filter', '@codeagora/desktop', 'tauri:test'],
  },
  {
    name: 'desktop-trusted-workspace-security',
    raw: 'pnpm --filter @codeagora/desktop exec cargo test --manifest-path src-tauri/Cargo.toml desktop_app_e2e_blocks_mutating_commands_for_untrusted_workspace',
    file: 'pnpm',
    args: [
      '--filter',
      '@codeagora/desktop',
      'exec',
      'cargo',
      'test',
      '--manifest-path',
      'src-tauri/Cargo.toml',
      'desktop_app_e2e_blocks_mutating_commands_for_untrusted_workspace',
    ],
  },
];

const SOURCE_EVIDENCE = [
  {
    area: 'tauri-capabilities',
    source: 'packages/desktop/src-tauri/capabilities/default.json',
    tests: [
      'src/tests/desktop-tauri-capabilities.test.ts',
    ],
    checks: [
      'single main-window capability file',
      'minimal plugin permission set',
      'broad native plugin scopes stay absent',
      'frontend bridge commands match registered Rust command handlers',
    ],
  },
  {
    area: 'webdriver-boundary',
    source: 'packages/desktop/src-tauri/Cargo.toml',
    tests: [
      'src/tests/desktop-webdriver-security.test.ts',
    ],
    checks: [
      'WebDriver plugin remains optional and debug-only',
      'release build and bundle smoke do not enable WebDriver automation',
      'local WebDriver runner stays loopback-scoped',
    ],
  },
  {
    area: 'external-links',
    source: 'packages/desktop/src/api/desktop-bridge.ts',
    tests: [
      'src/tests/desktop-external-links.test.ts',
      'packages/desktop/src-tauri/src/main.rs desktop_external_link_boundary tests',
    ],
    checks: [
      'external links route through the approved native command',
      'unsafe schemes are rejected before invoking opener paths',
      'browser fallback does not open links directly',
    ],
  },
  {
    area: 'workspace-file-boundary',
    source: 'packages/desktop/src-tauri/src/main.rs',
    tests: [
      'packages/desktop/src-tauri/src/main.rs desktop_file_access_boundary tests',
      'packages/desktop/src-tauri/src/main.rs desktop_app_e2e_blocks_mutating_commands_for_untrusted_workspace',
    ],
    checks: [
      'project, session, config, and evidence reads stay under the selected workspace',
      'desktop exports are written under .ca/desktop-exports',
      'session exports redact provider keys and bearer tokens',
      'path traversal and symlink escapes are rejected',
      'mutating commands require a trusted git workspace',
    ],
  },
];

function readOptionValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export function parseDesktopSecurityEvidenceArgs(argv) {
  const options = {
    evidenceDir: path.join('.sisyphus', 'evidence'),
    output: undefined,
    skipTests: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--evidence-dir') {
      options.evidenceDir = readOptionValue(argv, index, arg);
      index++;
    } else if (arg?.startsWith('--evidence-dir=')) {
      options.evidenceDir = arg.slice('--evidence-dir='.length);
    } else if (arg === '--output') {
      options.output = readOptionValue(argv, index, arg);
      index++;
    } else if (arg?.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
    } else if (arg === '--skip-tests') {
      options.skipTests = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function redactEvidenceText(value) {
  return (value ?? '')
    .replace(/\b([A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)|(?:api[_-]?key|token|secret|password))\s*[:=]\s*(["']?)([^\s"']+)\2/gi, (_match, key) => `${key}=[REDACTED]`)
    .replace(/\b(Authorization\s*:\s*Bearer\s+)([^\s"']+)/gi, (_match, prefix) => `${prefix}[REDACTED]`)
    .replace(/\b(Bearer\s+)([A-Za-z0-9._~+/=-]+)/g, (_match, prefix) => `${prefix}[REDACTED]`)
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|AIza[0-9A-Za-z_-]{12,})\b/g, '[REDACTED]');
}

function trimOutput(value) {
  const text = redactEvidenceText(value);
  if (text.length <= 4000) {
    return text;
  }
  return text.slice(-4000);
}

function relativePath(fromCwd, targetPath) {
  return path.relative(fromCwd, targetPath) || path.basename(targetPath);
}

function normalizeTestResult(command, result, skipped = false) {
  return {
    name: command.name,
    command: command.raw,
    skipped,
    exitCode: Number.isInteger(result.exitCode) ? result.exitCode : 1,
    signal: result.signal ?? null,
    passed: skipped || result.exitCode === 0,
    stdoutExcerpt: trimOutput(result.stdout),
    stderrExcerpt: trimOutput(result.stderr),
  };
}

function sanitizeTestResult(result) {
  return {
    ...result,
    stdoutExcerpt: trimOutput(result.stdoutExcerpt),
    stderrExcerpt: trimOutput(result.stderrExcerpt),
  };
}

export function buildDesktopSecurityEvidence({
  testResults,
  outputPath,
  cwd = process.cwd(),
}) {
  const normalizedResults = (testResults ?? DESKTOP_SECURITY_TEST_COMMANDS.map((command) =>
    normalizeTestResult(command, { stdout: '', stderr: '', exitCode: 0, signal: null }, true),
  )).map(sanitizeTestResult);
  const testsPassed = normalizedResults.every((result) => result.passed === true);

  return {
    schemaVersion: DESKTOP_SECURITY_EVIDENCE_SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    redactionStatus: 'safe-to-publish',
    releaseTier: 'rc',
    outputPath: relativePath(cwd, outputPath),
    testCommands: DESKTOP_SECURITY_TEST_COMMANDS.map((command) => command.raw),
    tests: {
      skipped: normalizedResults.every((result) => result.skipped === true),
      passed: testsPassed,
      results: normalizedResults,
    },
    checks: {
      minimalMainWindowCapability: testsPassed,
      disallowedNativePermissionScopesAbsent: testsPassed,
      frontendRustCommandContractAligned: testsPassed,
      webdriverAutomationDebugOnly: testsPassed,
      webdriverReleaseBuildDisabled: testsPassed,
      webdriverLoopbackOnly: testsPassed,
      externalLinksUseApprovedNativeCommand: testsPassed,
      unsafeExternalLinkSchemesRejected: testsPassed,
      browserFallbackDoesNotOpenLinks: testsPassed,
      workspacePathBoundariesEnforced: testsPassed,
      desktopExportsRedactSecrets: testsPassed,
      symlinkEscapesRejected: testsPassed,
      untrustedWorkspaceMutationsBlocked: testsPassed,
    },
    sourceEvidence: SOURCE_EVIDENCE,
  };
}

export async function runDesktopSecurityEvidence(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const evidenceDir = path.resolve(cwd, options.evidenceDir ?? path.join('.sisyphus', 'evidence'));
  const outputPath = path.resolve(cwd, options.output ?? path.join(evidenceDir, 'desktop-security-evidence.json'));
  const runProcess = options.runProcess ?? spawnProcess;
  const testResults = [];

  if (options.skipTests) {
    for (const command of DESKTOP_SECURITY_TEST_COMMANDS) {
      testResults.push(normalizeTestResult(command, { stdout: '', stderr: '', exitCode: 0, signal: null }, true));
    }
  } else {
    for (const command of DESKTOP_SECURITY_TEST_COMMANDS) {
      const result = await runProcess({
        command: command.raw,
        file: command.file,
        args: command.args,
        cwd,
        env: options.env ?? process.env,
      });
      testResults.push(normalizeTestResult(command, result));
    }
  }

  const evidence = buildDesktopSecurityEvidence({ testResults, outputPath, cwd });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);

  return {
    evidence,
    outputPath,
  };
}

async function main() {
  const result = await runDesktopSecurityEvidence(parseDesktopSecurityEvidenceArgs(process.argv.slice(2)));
  console.log(`Wrote ${path.relative(process.cwd(), result.outputPath)}`);
  if (!result.evidence.tests.passed) {
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
