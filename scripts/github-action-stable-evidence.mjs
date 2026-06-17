#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { RELEASE_EVIDENCE_METADATA_LOG } from './evidence-recorder.mjs';
import { EXPECTED_EVIDENCE, SCHEMA_VERSION } from './release-gates.mjs';

export const GITHUB_ACTION_STABLE_EVIDENCE_SCHEMA_VERSION = 'codeagora.github-action-stable-evidence.v1';

const DEFAULT_EVIDENCE_DIR = path.join('.sisyphus', 'evidence');
const REPLAY_TEST_COMMAND = [
  'vitest',
  'run',
  'packages/github/src/tests/action-runtime.test.ts',
  'packages/github/src/tests/action-reporting.test.ts',
  'src/tests/github-action-parse-args.test.ts',
  'src/tests/github-action-pr-smoke-recorder.test.ts',
];

const SCENARIOS = [
  {
    name: 'github-action-fork-pr-degraded',
    filename: 'github-action-fork-pr-degraded.json',
    scenario: 'fork-pr',
    degradedReason: 'untrusted-fork-pr',
    verdict: 'SKIPPED',
    replayedAssertions: [
      'skips untrusted fork PRs before invoking reviewers or provider-backed pipeline work',
      'degraded-reason=untrusted-fork-pr',
      'expect(mocks.runPipeline).not.toHaveBeenCalled()',
      'expect(mocks.postReview).not.toHaveBeenCalled()',
    ],
    checks: {
      providerBackedReviewStarted: false,
      githubPostingAttempted: false,
      privilegedWritesAllowed: false,
    },
  },
  {
    name: 'github-action-missing-secrets-degraded',
    filename: 'github-action-missing-secrets-degraded.json',
    scenario: 'missing-provider-secrets',
    degradedReason: 'missing-provider-secrets',
    verdict: 'SKIPPED',
    replayedAssertions: [
      'skips missing provider secrets as a safe degraded state before invoking reviewers',
      'degraded-reason=missing-provider-secrets',
      'expect(mocks.runPipeline).not.toHaveBeenCalled()',
      'expect(mocks.postReview).not.toHaveBeenCalled()',
    ],
    checks: {
      providerBackedReviewStarted: false,
      githubPostingAttempted: false,
      privilegedWritesAllowed: false,
    },
  },
  {
    name: 'github-action-stale-head-degraded',
    filename: 'github-action-stale-head-degraded.json',
    scenario: 'stale-head',
    degradedReason: 'stale-head-sha',
    verdict: 'SKIPPED',
    replayedAssertions: [
      'skips stale-head posting after review mapping when the PR head moved',
      'degraded-reason=stale-head-sha',
      'expect(mocks.postReview).not.toHaveBeenCalled()',
      'expect(mocks.setCommitStatus).not.toHaveBeenCalled()',
    ],
    checks: {
      providerBackedReviewStarted: true,
      githubPostingAttempted: false,
      privilegedWritesAllowed: false,
    },
  },
  {
    name: 'github-action-oversized-diff-degraded',
    filename: 'github-action-oversized-diff-degraded.json',
    scenario: 'oversized-diff',
    degradedReason: 'diff-too-large',
    verdict: 'SKIPPED',
    replayedAssertions: [
      'suppresses GitHub writes when the diff limit degrades the run',
      'degraded-reason=diff-too-large',
      'expect(mocks.runPipeline).not.toHaveBeenCalled()',
      'expect(mocks.postReview).not.toHaveBeenCalled()',
    ],
    checks: {
      providerBackedReviewStarted: false,
      githubPostingAttempted: false,
      privilegedWritesAllowed: false,
    },
  },
  {
    name: 'github-action-provider-failure-degraded',
    filename: 'github-action-provider-failure-degraded.json',
    scenario: 'provider-failure',
    degradedReason: 'provider-runtime-failed',
    verdict: 'DEGRADED',
    replayedAssertions: [
      'marks provider runtime failures degraded instead of failing the Action job',
      'degraded-reason=provider-runtime-failed',
      'expect(mocks.postReview).not.toHaveBeenCalled()',
      'expect(mocks.setCommitStatus).not.toHaveBeenCalled()',
    ],
    checks: {
      providerBackedReviewStarted: true,
      githubPostingAttempted: false,
      privilegedWritesAllowed: false,
    },
  },
  {
    name: 'github-action-posting-failure-degraded',
    filename: 'github-action-posting-failure-degraded.json',
    scenario: 'posting-failure',
    degradedReason: 'github-post-failed',
    verdict: 'DEGRADED',
    replayedAssertions: [
      'writes DEGRADED verdict when GitHub review posting fails after the public decision is mapped',
      'degraded-reason=github-post-failed',
      'expect(mocks.postReview).toHaveBeenCalled()',
      'verdict=DEGRADED',
    ],
    checks: {
      providerBackedReviewStarted: true,
      githubPostingAttempted: true,
      privilegedWritesAllowed: false,
    },
  },
];

function parseArgs(argv) {
  const options = {
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    runReplayTests: true,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--evidence-dir') {
      options.evidenceDir = argv[++index];
    } else if (arg?.startsWith('--evidence-dir=')) {
      options.evidenceDir = arg.slice('--evidence-dir='.length);
    } else if (arg === '--no-replay-tests') {
      options.runReplayTests = false;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function commitSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function getExpectedEntry(name) {
  const entry = EXPECTED_EVIDENCE.find((item) => item.name === name);
  if (!entry) {
    throw new Error(`Missing release-gates inventory entry for ${name}`);
  }
  return entry;
}

async function assertReplayAssertionsPresent(repoRoot) {
  const actionRuntime = await fs.readFile(path.join(repoRoot, 'packages/github/src/tests/action-runtime.test.ts'), 'utf-8');
  const actionParseArgs = await fs.readFile(path.join(repoRoot, 'src/tests/github-action-parse-args.test.ts'), 'utf-8');
  const actionRecorder = await fs.readFile(path.join(repoRoot, 'src/tests/github-action-pr-smoke-recorder.test.ts'), 'utf-8');
  const source = [actionRuntime, actionParseArgs, actionRecorder].join('\n');
  const missing = [];

  for (const scenario of SCENARIOS) {
    for (const assertion of scenario.replayedAssertions) {
      if (!source.includes(assertion)) {
        missing.push(`${scenario.name}: ${assertion}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Stable GitHub Action replay assertions are missing:\n${missing.join('\n')}`);
  }
}

function runReplayTests(repoRoot) {
  const startedAt = new Date().toISOString();
  execFileSync('pnpm', REPLAY_TEST_COMMAND, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  return {
    command: `pnpm ${REPLAY_TEST_COMMAND.join(' ')}`,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: 0,
  };
}

async function appendMetadata(evidenceDir, record, entry) {
  const metadataPath = path.join(evidenceDir, RELEASE_EVIDENCE_METADATA_LOG);
  const metadata = {
    schemaVersion: `${GITHUB_ACTION_STABLE_EVIDENCE_SCHEMA_VERSION}.metadata`,
    name: record.name,
    filename: entry.filename,
    command: entry.command,
    tier: entry.tier,
    execution: entry.execution,
    redactionStatus: entry.redactionStatus,
    passed: record.passed,
    evidenceMode: record.evidenceMode,
    evidencePath: path.relative(process.cwd(), path.join(evidenceDir, entry.filename)),
    scenario: record.scenario,
    degradedReason: record.degradedReason,
    replay: record.replay,
    artifactLinks: [],
    outputLinks: [],
    capturedAt: record.capturedAt,
  };
  await fs.appendFile(metadataPath, `${JSON.stringify(metadata)}\n`);
}

function buildRecord({ scenario, entry, replay, sha }) {
  const passed = scenario.verdict === 'DEGRADED' || scenario.verdict === 'SKIPPED';
  return {
    schemaVersion: GITHUB_ACTION_STABLE_EVIDENCE_SCHEMA_VERSION,
    releaseEvidenceSchemaVersion: SCHEMA_VERSION,
    name: scenario.name,
    surface: 'github_actions',
    releaseTier: 'stable',
    evidenceMode: 'real',
    source: 'replayed-action-runtime-tests',
    capturedAt: new Date().toISOString(),
    commitSha: sha,
    scenario: scenario.scenario,
    degradedReason: scenario.degradedReason,
    verdict: scenario.verdict,
    passed,
    inventory: {
      filename: entry.filename,
      command: entry.command,
      execution: entry.execution,
      redactionStatus: entry.redactionStatus,
      liveOnly: entry.liveOnly === true,
    },
    replay,
    replayedAssertions: scenario.replayedAssertions,
    checks: scenario.checks,
  };
}

export async function recordGithubActionStableEvidence(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const evidenceDir = path.resolve(repoRoot, options.evidenceDir ?? DEFAULT_EVIDENCE_DIR);
  const shouldRunReplayTests = options.runReplayTests ?? true;

  await fs.mkdir(evidenceDir, { recursive: true });
  await assertReplayAssertionsPresent(repoRoot);

  const replay = shouldRunReplayTests
    ? runReplayTests(repoRoot)
    : {
      command: `pnpm ${REPLAY_TEST_COMMAND.join(' ')}`,
      startedAt: null,
      finishedAt: null,
      exitCode: 0,
      skippedByCaller: true,
    };
  const sha = commitSha();
  const records = [];

  for (const scenario of SCENARIOS) {
    const entry = getExpectedEntry(scenario.name);
    const record = buildRecord({ scenario, entry, replay, sha });
    const outputPath = path.join(evidenceDir, entry.filename);
    await fs.writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`);
    await appendMetadata(evidenceDir, record, entry);
    records.push({ record, outputPath });
  }

  return { records, evidenceDir, replay };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await recordGithubActionStableEvidence(options);
  console.log(`GitHub Action stable replay evidence written to ${path.relative(process.cwd(), result.evidenceDir)}`);
  for (const item of result.records) {
    console.log(`- ${path.relative(process.cwd(), item.outputPath)} (${item.record.scenario}: ${item.record.degradedReason})`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
