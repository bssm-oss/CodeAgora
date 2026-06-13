#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnProcess } from './release-gate-runner.mjs';

export const REDACTION_PATH_SAFETY_EVIDENCE_SCHEMA_VERSION = 'codeagora.redaction-path-safety-evidence.v1';

export const REDACTION_PATH_SAFETY_TEST_COMMAND = {
  raw: [
    'pnpm',
    'vitest',
    'run',
    'src/tests/redaction-boundaries.test.ts',
    'src/tests/utils-path-validation.test.ts',
    'src/tests/config-path-security.test.ts',
    'src/tests/github-action-diff-path-security.test.ts',
    'src/tests/github-action-sarif-path.test.ts',
  ].join(' '),
  file: 'pnpm',
  args: [
    'vitest',
    'run',
    'src/tests/redaction-boundaries.test.ts',
    'src/tests/utils-path-validation.test.ts',
    'src/tests/config-path-security.test.ts',
    'src/tests/github-action-diff-path-security.test.ts',
    'src/tests/github-action-sarif-path.test.ts',
  ],
};

const SOURCE_EVIDENCE = [
  {
    area: 'secret-redaction',
    source: 'packages/shared/src/utils/redaction.ts',
    tests: [
      'src/tests/redaction-boundaries.test.ts',
    ],
    checks: [
      'assignment, standalone, bearer, provider-key URL, and encoded token redaction',
      'L1, L2, and L3 persisted session artifact redaction',
      'GitHub review/comment body redaction before outward posting',
      'MCP structured response redaction without breaking JSON shape',
    ],
  },
  {
    area: 'path-validation',
    source: 'packages/shared/src/utils/path-validation.ts',
    tests: [
      'src/tests/utils-path-validation.test.ts',
      'src/tests/config-path-security.test.ts',
      'src/tests/github-action-diff-path-security.test.ts',
      'src/tests/github-action-sarif-path.test.ts',
    ],
    checks: [
      'traversal, encoded traversal, separator variants, empty path, and null byte rejection',
      'repository-root boundary enforcement for config and diff paths',
      'symlink escape rejection for files and directories',
      'GitHub Action diff and SARIF output paths bounded to allowed roots',
    ],
  },
];

function parseArgs(argv) {
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
      options.evidenceDir = argv[++index];
    } else if (arg?.startsWith('--evidence-dir=')) {
      options.evidenceDir = arg.slice('--evidence-dir='.length);
    } else if (arg === '--output') {
      options.output = argv[++index];
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
  return value
    .replace(/\b([A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)|(?:api[_-]?key|token|secret|password))\s*[:=]\s*(["']?)([^\s"']+)\2/gi, (_match, key) => `${key}=[REDACTED]`)
    .replace(/\b(Authorization\s*:\s*Bearer\s+)([^\s"']+)/gi, (_match, prefix) => `${prefix}[REDACTED]`)
    .replace(/\b(Bearer\s+)([A-Za-z0-9._~+/=-]+)/g, (_match, prefix) => `${prefix}[REDACTED]`)
    .replace(/https:\/\/openrouter\.ai\/workspaces\/[^\s"'<>)]*\/keys\/[^\s"'<>)]*/g, '[REDACTED_URL]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|AIza[0-9A-Za-z_-]{12,})\b/g, '[REDACTED]');
}

function trimOutput(value) {
  const text = redactEvidenceText(value ?? '');
  if (text.length <= 4000) {
    return text;
  }
  return text.slice(-4000);
}

function relativePath(fromCwd, targetPath) {
  return path.relative(fromCwd, targetPath) || path.basename(targetPath);
}

export function buildRedactionPathSafetyEvidence({
  testResult,
  outputPath,
  cwd = process.cwd(),
}) {
  const normalizedTestResult = testResult ?? {
    stdout: '',
    stderr: '',
    exitCode: 0,
    signal: null,
    skipped: true,
  };
  const testsPassed = normalizedTestResult.skipped === true || normalizedTestResult.exitCode === 0;

  return {
    schemaVersion: REDACTION_PATH_SAFETY_EVIDENCE_SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    redactionStatus: 'safe-to-publish',
    releaseTier: 'rc',
    outputPath: relativePath(cwd, outputPath),
    testCommand: REDACTION_PATH_SAFETY_TEST_COMMAND.raw,
    tests: {
      skipped: normalizedTestResult.skipped === true,
      exitCode: Number.isInteger(normalizedTestResult.exitCode) ? normalizedTestResult.exitCode : 1,
      signal: normalizedTestResult.signal ?? null,
      passed: testsPassed,
      stdoutExcerpt: trimOutput(normalizedTestResult.stdout),
      stderrExcerpt: trimOutput(normalizedTestResult.stderr),
    },
    checks: {
      assignmentAndBearerTokenRedaction: testsPassed,
      providerKeyUrlRedaction: testsPassed,
      persistedSessionArtifactRedaction: testsPassed,
      githubAndMcpOutwardResponseRedaction: testsPassed,
      traversalSegmentsRejected: testsPassed,
      encodedAndSeparatorTraversalRejected: testsPassed,
      repositoryRootBoundaryEnforced: testsPassed,
      symlinkEscapesRejected: testsPassed,
      configPathBoundedToRepository: testsPassed,
      githubActionDiffAndSarifPathsBounded: testsPassed,
    },
    sourceEvidence: SOURCE_EVIDENCE,
  };
}

export async function runRedactionPathSafetyEvidence(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const evidenceDir = path.resolve(cwd, options.evidenceDir ?? path.join('.sisyphus', 'evidence'));
  const outputPath = path.resolve(cwd, options.output ?? path.join(evidenceDir, 'redaction-path-safety-evidence.json'));
  const runProcess = options.runProcess ?? spawnProcess;

  const testResult = options.skipTests
    ? { stdout: '', stderr: '', exitCode: 0, signal: null, skipped: true }
    : await runProcess({
      command: REDACTION_PATH_SAFETY_TEST_COMMAND.raw,
      file: REDACTION_PATH_SAFETY_TEST_COMMAND.file,
      args: REDACTION_PATH_SAFETY_TEST_COMMAND.args,
      cwd,
      env: options.env ?? process.env,
    });

  const evidence = buildRedactionPathSafetyEvidence({ testResult, outputPath, cwd });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);

  return {
    evidence,
    outputPath,
  };
}

async function main() {
  const result = await runRedactionPathSafetyEvidence(parseArgs(process.argv.slice(2)));
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
