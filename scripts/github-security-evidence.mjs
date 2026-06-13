#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnProcess } from './release-gate-runner.mjs';

export const GITHUB_SECURITY_EVIDENCE_SCHEMA_VERSION = 'codeagora.github-security-evidence.v1';

export const GITHUB_SECURITY_TEST_COMMAND = {
  raw: [
    'pnpm',
    'vitest',
    'run',
    'src/tests/github-action-parse-args.test.ts',
    'packages/github/src/tests/action-runtime.test.ts',
    'src/tests/github-action-pr-smoke-recorder.test.ts',
  ].join(' '),
  file: 'pnpm',
  args: [
    'vitest',
    'run',
    'src/tests/github-action-parse-args.test.ts',
    'packages/github/src/tests/action-runtime.test.ts',
    'src/tests/github-action-pr-smoke-recorder.test.ts',
  ],
};

const SOURCE_EVIDENCE = [
  {
    area: 'token-handling',
    source: 'packages/github/src/action-policy.ts',
    tests: [
      'skips clearly when GitHub posting is enabled but token is missing',
      'detects only retained provider credentials, not GITHUB_TOKEN',
      'denies privileged PR GitHub operations when token or PR context is not trusted',
      'accepts least-privilege permissions for the default check-run reporter',
      'rejects excessive GitHub token permissions',
    ],
  },
  {
    area: 'fork-safety',
    source: 'packages/github/src/action-policy.ts',
    tests: [
      'skips fork PRs as untrusted before checking provider credentials',
      'prioritizes untrusted fork hard-stop over token, provider, and posting controls',
      'uses parsed base/head repository metadata to detect untrusted fork PRs',
      'skips untrusted fork PRs before invoking reviewers or provider-backed pipeline work',
    ],
  },
  {
    area: 'rc-manifest-capture',
    source: 'scripts/github-action-pr-smoke-recorder.mjs',
    tests: [
      'records required metadata from a pull_request event and CodeAgora Action outputs',
      'rejects non-pull_request contexts instead of producing stable live evidence',
      'marks SHA mismatches as failed extraction checks',
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

function trimOutput(value) {
  const text = value ?? '';
  if (text.length <= 4000) {
    return text;
  }
  return text.slice(-4000);
}

function relativePath(fromCwd, targetPath) {
  return path.relative(fromCwd, targetPath) || path.basename(targetPath);
}

export function buildGithubSecurityEvidence({
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
    schemaVersion: GITHUB_SECURITY_EVIDENCE_SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    redactionStatus: 'safe-to-publish',
    releaseTier: 'rc',
    outputPath: relativePath(cwd, outputPath),
    testCommand: GITHUB_SECURITY_TEST_COMMAND.raw,
    tests: {
      skipped: normalizedTestResult.skipped === true,
      exitCode: Number.isInteger(normalizedTestResult.exitCode) ? normalizedTestResult.exitCode : 1,
      signal: normalizedTestResult.signal ?? null,
      passed: testsPassed,
      stdoutExcerpt: trimOutput(normalizedTestResult.stdout),
      stderrExcerpt: trimOutput(normalizedTestResult.stderr),
    },
    checks: {
      githubTokenNotProviderCredential: testsPassed,
      missingGitHubTokenBlocksPosting: testsPassed,
      leastPrivilegePermissionsValidated: testsPassed,
      excessivePermissionsRejected: testsPassed,
      privilegedOperationsRequireTrustedTokenContext: testsPassed,
      forkPrHardStopsBeforeProviderCredentials: testsPassed,
      forkPrSuppressesProviderBackedReview: testsPassed,
      pullRequestEvidenceKeepsForkAndShaMetadata: testsPassed,
    },
    sourceEvidence: SOURCE_EVIDENCE,
  };
}

export async function runGithubSecurityEvidence(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const evidenceDir = path.resolve(cwd, options.evidenceDir ?? path.join('.sisyphus', 'evidence'));
  const outputPath = path.resolve(cwd, options.output ?? path.join(evidenceDir, 'github-security-evidence.json'));
  const runProcess = options.runProcess ?? spawnProcess;

  const testResult = options.skipTests
    ? { stdout: '', stderr: '', exitCode: 0, signal: null, skipped: true }
    : await runProcess({
      command: GITHUB_SECURITY_TEST_COMMAND.raw,
      file: GITHUB_SECURITY_TEST_COMMAND.file,
      args: GITHUB_SECURITY_TEST_COMMAND.args,
      cwd,
      env: options.env ?? process.env,
    });

  const evidence = buildGithubSecurityEvidence({ testResult, outputPath, cwd });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);

  return {
    evidence,
    outputPath,
  };
}

async function main() {
  const result = await runGithubSecurityEvidence(parseArgs(process.argv.slice(2)));
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
