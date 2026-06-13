import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_EVIDENCE,
  RELEASE_GATE_EXECUTIONS,
  deterministicLocalReleaseCommands,
  deterministicLocalReleaseGates,
} from '../../scripts/release-gates.mjs';
import {
  ReleaseGateCommandError,
  runReleaseGateCommands,
} from '../../scripts/release-gate-runner.mjs';
import {
  DESKTOP_RELEASE_CHECKS,
  formatDesktopReleaseGateOutput,
  runDesktopReleaseGate,
} from '../../scripts/desktop-release-gate-runner.mjs';
import {
  assertGateExitStatusesPass,
  evaluateGateExitStatuses,
} from '../../scripts/release-gate-evaluator.mjs';
import {
  assertReleaseGateSummaryPass,
  summarizeReleaseGates,
} from '../../scripts/release-gate-summary.mjs';

describe('release gate inventory', () => {
  it('identifies the release-blocking deterministic local command set', () => {
    expect(deterministicLocalReleaseCommands()).toEqual([
      'pnpm typecheck',
      'pnpm lint',
      'pnpm build',
      'pnpm test --no-file-parallelism',
      'pnpm vitest run src/tests/cross-surface-parity.test.ts',
      'pnpm bench:ci',
      'pnpm release:beta-smoke',
      'pnpm pack --dry-run',
      'pnpm --filter @codeagora/mcp pack --dry-run',
      'pnpm build:action && pnpm release:beta-smoke',
      'pnpm desktop:app-e2e',
      'pnpm desktop:macos-webdriver-e2e',
      'pnpm desktop:visual-qa',
      'pnpm rc:desktop-gate',
      'pnpm desktop:evidence',
      'pnpm test:security',
    ]);
  });

  it('excludes live-provider and live-GitHub checks from deterministic local gates', () => {
    const deterministicGates = deterministicLocalReleaseGates();
    const deterministicNames = deterministicGates.map((entry) => entry.name);
    const deterministicCommands = deterministicGates.map((entry) => entry.command);

    expect(deterministicNames).not.toContain('live-benchmark-report');
    expect(deterministicNames).not.toContain('cli-live-clean-diff-smoke');
    expect(deterministicNames).not.toContain('cli-live-clean-diff-transcript');
    expect(deterministicNames).not.toContain('cli-live-staged-diff-smoke');
    expect(deterministicNames).not.toContain('cli-live-staged-diff-transcript');
    expect(deterministicNames).not.toContain('cli-live-patch-file-smoke');
    expect(deterministicNames).not.toContain('cli-live-patch-file-transcript');
    expect(deterministicNames).not.toContain('cli-live-invalid-config-smoke');
    expect(deterministicNames).not.toContain('cli-live-invalid-config-transcript');
    expect(deterministicNames).not.toContain('cli-live-missing-provider-key-smoke');
    expect(deterministicNames).not.toContain('cli-live-missing-provider-key-transcript');
    expect(deterministicNames).not.toContain('cli-live-provider-failure-smoke');
    expect(deterministicNames).not.toContain('cli-live-provider-failure-transcript');
    expect(deterministicNames).not.toContain('cli-live-timeout-runtime-smoke');
    expect(deterministicNames).not.toContain('cli-live-timeout-runtime-transcript');
    expect(deterministicNames).not.toContain('live-github-action-pr-smoke');
    expect(deterministicCommands).not.toContain('pnpm smoke:cli-clean-diff with provider credentials');
    expect(deterministicCommands).not.toContain('pnpm smoke:cli-staged-diff with provider credentials');
    expect(deterministicCommands).not.toContain('pnpm smoke:cli-patch-file with provider credentials');
    expect(deterministicCommands).not.toContain('pnpm smoke:cli-invalid-config');
    expect(deterministicCommands).not.toContain('pnpm smoke:cli-missing-provider-key');
    expect(deterministicCommands).not.toContain('pnpm smoke:cli-provider-failure');
    expect(deterministicCommands).not.toContain('pnpm smoke:cli-timeout-runtime with provider credentials');
    expect(deterministicCommands).not.toContain('pnpm bench:fn:run with provider secrets');
    expect(deterministicCommands).not.toContain('pnpm evidence:github-action-pr-smoke from pull_request workflow context');
    expect(deterministicCommands.join('\n')).not.toContain('provider secrets');

    const liveExecutions = EXPECTED_EVIDENCE.filter((entry) =>
      [
        RELEASE_GATE_EXECUTIONS.LIVE_CLI,
        RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER,
        RELEASE_GATE_EXECUTIONS.LIVE_GITHUB,
      ].includes(entry.execution),
    );
    expect(liveExecutions.map((entry) => entry.name)).toEqual([
      'cli-live-clean-diff-smoke',
      'cli-live-clean-diff-transcript',
      'cli-live-staged-diff-smoke',
      'cli-live-staged-diff-transcript',
      'cli-live-patch-file-smoke',
      'cli-live-patch-file-transcript',
      'cli-live-invalid-config-smoke',
      'cli-live-invalid-config-transcript',
      'cli-live-missing-provider-key-smoke',
      'cli-live-missing-provider-key-transcript',
      'cli-live-provider-failure-smoke',
      'cli-live-provider-failure-transcript',
      'cli-live-timeout-runtime-smoke',
      'cli-live-timeout-runtime-transcript',
      'live-benchmark-report',
      'live-github-action-pr-smoke',
    ]);
    expect(deterministicGates.every((entry) => entry.liveOnly !== true)).toBe(true);
  });

  it('tracks macOS arm64 signing evidence as a stable local artifact blocker', () => {
    const signingEvidence = EXPECTED_EVIDENCE.find(
      (entry) => entry.name === 'desktop-macos-arm64-signing-evidence',
    );

    expect(signingEvidence).toMatchObject({
      filename: 'desktop-macos-arm64-signing-evidence.json',
      tier: 'stable',
      redactionStatus: 'safe-to-publish',
      execution: RELEASE_GATE_EXECUTIONS.LOCAL_ARTIFACT,
    });
    expect(deterministicLocalReleaseGates()).not.toContain(signingEvidence);
  });

  it('tracks GitHub token and fork security evidence as an rc local artifact', () => {
    const rootPackage = JSON.parse(fs.readFileSync('package.json', 'utf-8')) as {
      scripts: Record<string, string>;
    };
    const evidence = EXPECTED_EVIDENCE.find(
      (entry) => entry.name === 'github-security-evidence',
    );

    expect(rootPackage.scripts['evidence:github-security']).toBe('node scripts/github-security-evidence.mjs');
    expect(evidence).toMatchObject({
      filename: 'github-security-evidence.json',
      command: 'pnpm evidence:github-security',
      tier: 'rc',
      redactionStatus: 'safe-to-publish',
      execution: RELEASE_GATE_EXECUTIONS.LOCAL_ARTIFACT,
    });
    expect(deterministicLocalReleaseGates()).not.toContain(evidence);
  });

  it('tracks desktop-specific security evidence as an rc local artifact', () => {
    const rootPackage = JSON.parse(fs.readFileSync('package.json', 'utf-8')) as {
      scripts: Record<string, string>;
    };
    const evidence = EXPECTED_EVIDENCE.find(
      (entry) => entry.name === 'desktop-security-evidence',
    );

    expect(rootPackage.scripts['evidence:desktop-security']).toBe('node scripts/desktop-security-evidence.mjs');
    expect(evidence).toMatchObject({
      filename: 'desktop-security-evidence.json',
      command: 'pnpm evidence:desktop-security',
      tier: 'rc',
      redactionStatus: 'safe-to-publish',
      execution: RELEASE_GATE_EXECUTIONS.LOCAL_ARTIFACT,
    });
    expect(deterministicLocalReleaseGates()).not.toContain(evidence);
  });

});

describe('release gate command runner', () => {
  it('executes the required desktop release checks and records passing evidence output', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-desktop-gate-'));
    const calls: Array<{ command: string; file: string; args: string[] }> = [];

    try {
      const result = await runDesktopReleaseGate({
        cwd,
        recordEvidence: true,
        runProcess: async ({ command, file, args }) => {
          calls.push({ command, file, args });
          return {
            stdout: `ok:${command}\n`,
            stderr: '',
            exitCode: 0,
          };
        },
      });

      expect(calls).toEqual(DESKTOP_RELEASE_CHECKS.map((check) => ({
        command: check.command,
        file: check.file,
        args: check.args,
      })));
      expect(result).toMatchObject({
        name: 'desktop-gate',
        command: 'pnpm rc:desktop-gate',
        filename: 'desktop-gate.log',
        exitCode: 0,
        passed: true,
      });
      expect(result.checks.map((check) => check.name)).toEqual([
        'desktop-typecheck',
        'desktop-smoke',
        'desktop-tauri-check',
        'desktop-tauri-file-access-boundary',
        'desktop-app-e2e',
        'desktop-macos-webdriver-e2e',
        'desktop-visual-qa',
        'desktop-evidence-manifest',
        'desktop-security-evidence',
        'desktop-bundle-smoke',
      ]);

      const output = formatDesktopReleaseGateOutput(result);
      expect(output).toContain('[PASS] desktop-gate: pnpm rc:desktop-gate');
      expect(output).toContain('[PASS] desktop-security-evidence: pnpm evidence:desktop-security');
      expect(output).toContain('[PASS] desktop-bundle-smoke: pnpm desktop:bundle-smoke');

      const aggregateLog = fs.readFileSync(path.join(cwd, '.sisyphus', 'evidence', 'desktop-gate.log'), 'utf-8');
      expect(aggregateLog).toContain('command: pnpm rc:desktop-gate');
      expect(aggregateLog).toContain('$ pnpm --filter @codeagora/desktop typecheck');
      expect(aggregateLog).toContain('$ pnpm evidence:desktop-security');
      expect(aggregateLog).toContain('$ pnpm desktop:bundle-smoke');

      const ledger = fs.readFileSync(path.join(cwd, '.sisyphus', 'evidence', 'gate-command-evidence.jsonl'), 'utf-8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(ledger).toContainEqual(expect.objectContaining({
        schemaVersion: 'codeagora.release-gate-command-evidence.v1',
        name: 'desktop-app-e2e',
        command: 'pnpm desktop:app-e2e',
        exitCode: 0,
        passed: true,
        logPath: path.join('.sisyphus', 'evidence', 'desktop-app-e2e.log'),
      }));
      expect(ledger).toContainEqual(expect.objectContaining({
        schemaVersion: 'codeagora.release-gate-command-evidence.v1',
        name: 'desktop-gate',
        command: 'pnpm rc:desktop-gate',
        exitCode: 0,
        passed: true,
        logPath: path.join('.sisyphus', 'evidence', 'desktop-gate.log'),
      }));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('stops the desktop release gate on the first failing check and prints failure output', async () => {
    const calls: string[] = [];
    const result = await runDesktopReleaseGate({
      runProcess: async ({ command }) => {
        calls.push(command);
        return {
          stdout: `out:${command}\n`,
          stderr: command.endsWith('smoke') ? 'desktop smoke failed\n' : '',
          exitCode: command.endsWith('smoke') ? 2 : 0,
        };
      },
    });

    expect(calls).toEqual([
      'pnpm --filter @codeagora/desktop typecheck',
      'pnpm --filter @codeagora/desktop smoke',
    ]);
    expect(result).toMatchObject({
      name: 'desktop-gate',
      exitCode: 2,
      passed: false,
    });
    expect(result.checks).toMatchObject([
      { name: 'desktop-typecheck', passed: true, exitCode: 0 },
      { name: 'desktop-smoke', passed: false, exitCode: 2, stderr: 'desktop smoke failed\n' },
    ]);
    expect(formatDesktopReleaseGateOutput(result)).toContain(
      '[FAIL] desktop-smoke: pnpm --filter @codeagora/desktop smoke',
    );
    expect(formatDesktopReleaseGateOutput(result)).toContain('desktop smoke failed');
  });

  it('executes inventory commands and captures stdout, stderr, and exit code', async () => {
    const gates = [
      { name: 'typecheck', filename: 'typecheck.log', command: 'pnpm typecheck' },
      { name: 'action-smoke', filename: 'action-smoke.log', command: 'pnpm build:action && pnpm release:beta-smoke' },
    ];
    const calls: Array<{ name: string; command: string; file: string; args: string[] }> = [];

    const results = await runReleaseGateCommands({
      gates,
      cwd: '/repo',
      env: { NODE_ENV: 'test' },
      runProcess: async ({ gate, command, file, args }) => {
        calls.push({ name: gate.name, command, file, args });
        return {
          stdout: `stdout:${command}\n`,
          stderr: `stderr:${command}\n`,
          exitCode: 0,
        };
      },
    });

    expect(calls).toEqual([
      { name: 'typecheck', command: 'pnpm typecheck', file: 'pnpm', args: ['typecheck'] },
      { name: 'action-smoke', command: 'pnpm build:action', file: 'pnpm', args: ['build:action'] },
      { name: 'action-smoke', command: 'pnpm release:beta-smoke', file: 'pnpm', args: ['release:beta-smoke'] },
    ]);
    expect(results).toMatchObject([
      {
        name: 'typecheck',
        command: 'pnpm typecheck',
        filename: 'typecheck.log',
        stdout: 'stdout:pnpm typecheck\n',
        stderr: 'stderr:pnpm typecheck\n',
        exitCode: 0,
        passed: true,
      },
      {
        name: 'action-smoke',
        command: 'pnpm build:action && pnpm release:beta-smoke',
        filename: 'action-smoke.log',
        stdout: 'stdout:pnpm build:action\nstdout:pnpm release:beta-smoke\n',
        stderr: 'stderr:pnpm build:action\nstderr:pnpm release:beta-smoke\n',
        exitCode: 0,
        passed: true,
      },
    ]);
  });

  it('fails after collecting results when any inventory command exits nonzero', async () => {
    const gates = [
      { name: 'typecheck', filename: 'typecheck.log', command: 'pnpm typecheck' },
      { name: 'build', filename: 'build.log', command: 'pnpm build' },
      { name: 'bench-ci', filename: 'bench-ci.log', command: 'pnpm bench:ci' },
    ];
    const calls: string[] = [];

    try {
      await runReleaseGateCommands({
        gates,
        runProcess: async ({ command }) => {
          calls.push(command);
          return {
            stdout: `out:${command}`,
            stderr: command === 'pnpm build' ? 'build failed' : '',
            exitCode: command === 'pnpm build' ? 2 : 0,
          };
        },
      });
      throw new Error('Expected release gate runner to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ReleaseGateCommandError);
      const gateError = error as ReleaseGateCommandError;
      expect(calls).toEqual(['pnpm typecheck', 'pnpm build', 'pnpm bench:ci']);
      expect(gateError.failedResults).toMatchObject([
        {
          name: 'build',
          stdout: 'out:pnpm build',
          stderr: 'build failed',
          exitCode: 2,
          passed: false,
        },
      ]);
      expect(gateError.results.map((result) => result.name)).toEqual(['typecheck', 'build', 'bench-ci']);
    }
  });

  it('records a durable evidence entry and log artifact for every gate command', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-gate-evidence-'));
    try {
      const gates = [
        { name: 'typecheck', filename: 'typecheck.log', command: 'pnpm typecheck' },
        { name: 'build', filename: 'build.log', command: 'pnpm build' },
      ];

      const results = await runReleaseGateCommands({
        gates,
        cwd,
        recordEvidence: true,
        failOnNonzero: false,
        runProcess: async ({ command }) => ({
          stdout: `stdout:${command}\n`,
          stderr: command === 'pnpm build' ? 'build failed\n' : '',
          exitCode: command === 'pnpm build' ? 2 : 0,
        }),
      });

      expect(results.map((result) => result.logPath)).toEqual([
        path.join('.sisyphus', 'evidence', 'typecheck.log'),
        path.join('.sisyphus', 'evidence', 'build.log'),
      ]);

      const ledgerPath = path.join(cwd, '.sisyphus', 'evidence', 'gate-command-evidence.jsonl');
      const entries = fs
        .readFileSync(ledgerPath, 'utf-8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));

      expect(entries).toMatchObject([
        {
          schemaVersion: 'codeagora.release-gate-command-evidence.v1',
          name: 'typecheck',
          command: 'pnpm typecheck',
          exitCode: 0,
          passed: true,
          logPath: path.join('.sisyphus', 'evidence', 'typecheck.log'),
          logLink: null,
        },
        {
          schemaVersion: 'codeagora.release-gate-command-evidence.v1',
          name: 'build',
          command: 'pnpm build',
          exitCode: 2,
          passed: false,
          logPath: path.join('.sisyphus', 'evidence', 'build.log'),
          logLink: null,
        },
      ]);
      expect(entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(entries[1].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const buildLog = fs.readFileSync(path.join(cwd, '.sisyphus', 'evidence', 'build.log'), 'utf-8');
      expect(buildLog).toContain('command: pnpm build');
      expect(buildLog).toContain('exitCode: 2');
      expect(buildLog).toContain('stdout:pnpm build');
      expect(buildLog).toContain('build failed');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('release gate exit-status evaluator', () => {
  const gates = [
    { name: 'typecheck', filename: 'typecheck.log', command: 'pnpm typecheck', tier: 'beta' },
    { name: 'build', filename: 'build.log', command: 'pnpm build', tier: 'beta' },
    { name: 'cross-surface-parity', filename: 'cross-surface-parity.log', command: 'pnpm vitest run src/tests/cross-surface-parity.test.ts', tier: 'rc' },
  ];

  function evidenceFor(gate: typeof gates[number], overrides: Record<string, unknown> = {}) {
    return {
      schemaVersion: 'codeagora.release-gate-command-evidence.v1',
      name: gate.name,
      command: gate.command,
      exitCode: 0,
      passed: true,
      timestamp: '2026-06-11T00:01:00.000Z',
      startedAt: '2026-06-11T00:00:00.000Z',
      finishedAt: '2026-06-11T00:01:00.000Z',
      logPath: path.join('.sisyphus', 'evidence', gate.filename),
      logLink: null,
      ...overrides,
    };
  }

  it('passes only when every required deterministic gate has latest exit code 0', () => {
    const evaluation = evaluateGateExitStatuses(
      [
        evidenceFor(gates[0], { exitCode: 1, passed: false, timestamp: '2026-06-11T00:00:00.000Z' }),
        evidenceFor(gates[0], { exitCode: 0, timestamp: '2026-06-11T00:01:00.000Z' }),
        evidenceFor(gates[1]),
        evidenceFor(gates[2]),
        {
          schemaVersion: 'codeagora.release-gate-command-evidence.v1',
          name: 'live-benchmark-report',
          command: 'pnpm bench:fn:run with provider secrets',
          exitCode: 1,
          timestamp: '2026-06-11T00:01:00.000Z',
          logPath: path.join('.sisyphus', 'evidence', 'live-benchmark-report.md'),
        },
      ],
      { gates },
    );

    expect(evaluation.passed).toBe(true);
    expect(evaluation.passedCount).toBe(3);
    expect(evaluation.failed).toEqual([]);
    expect(evaluation.missing).toEqual([]);
    expect(evaluation.incomplete).toEqual([]);
    expect(() => assertGateExitStatusesPass(evaluation)).not.toThrow();
  });

  it('fails when any required deterministic gate is missing or exits nonzero', () => {
    const evaluation = evaluateGateExitStatuses(
      [
        evidenceFor(gates[0]),
        evidenceFor(gates[1], { exitCode: 2, passed: false }),
      ],
      { gates },
    );

    expect(evaluation.passed).toBe(false);
    expect(evaluation.failed).toMatchObject([{ name: 'build', exitCode: 2 }]);
    expect(evaluation.missing).toMatchObject([{ name: 'cross-surface-parity', exitCode: null }]);
    expect(() => assertGateExitStatusesPass(evaluation)).toThrow(
      'Deterministic release gates did not all record complete passing evidence: failed: build (2); missing: cross-surface-parity',
    );
  });

  it('fails when a gate has an exit code but lacks complete recorded evidence', () => {
    const evaluation = evaluateGateExitStatuses(
      [
        evidenceFor(gates[0]),
        evidenceFor(gates[1], { logPath: '', logLink: null }),
        evidenceFor(gates[2], { schemaVersion: 'wrong.schema', command: 'pnpm test' }),
      ],
      { gates },
    );

    expect(evaluation.passed).toBe(false);
    expect(evaluation.failed).toEqual([]);
    expect(evaluation.incomplete).toMatchObject([
      { name: 'build', completeness: ['logPathOrLink'] },
      { name: 'cross-surface-parity', completeness: ['schemaVersion', 'command'] },
    ]);
    expect(() => assertGateExitStatusesPass(evaluation)).toThrow(
      'Deterministic release gates did not all record complete passing evidence: incomplete: build (logPathOrLink), cross-surface-parity (schemaVersion, command)',
    );
  });

  it('summarizes success only when gate exit status and evidence completeness both pass', () => {
    const gateExitStatus = evaluateGateExitStatuses(gates.map((gate) => evidenceFor(gate)), { gates });
    const entries = gates.map((gate) => ({
      name: gate.name,
      filename: gate.filename,
      tier: gate.tier,
      path: path.join('.sisyphus', 'evidence', gate.filename),
      exists: true,
    }));

    const summary = summarizeReleaseGates({ entries, gateExitStatus, requiredTier: 'rc' });

    expect(summary).toMatchObject({
      schemaVersion: 'codeagora.release-gate-summary.v1',
      requiredTier: 'rc',
      passed: true,
      gateExitStatusPassed: true,
      evidenceComplete: true,
      requiredEvidenceCount: 3,
      missingEvidence: [],
      failedGates: [],
      missingGateEvidence: [],
      incompleteGateEvidence: [],
    });
    expect(() => assertReleaseGateSummaryPass(summary)).not.toThrow();
  });

  it('summarizes failure when gate exit status fails even if evidence files exist', () => {
    const gateExitStatus = evaluateGateExitStatuses(
      [
        evidenceFor(gates[0]),
        evidenceFor(gates[1], { exitCode: 1, passed: false }),
        evidenceFor(gates[2]),
      ],
      { gates },
    );
    const entries = gates.map((gate) => ({
      name: gate.name,
      filename: gate.filename,
      tier: gate.tier,
      exists: true,
    }));

    const summary = summarizeReleaseGates({ entries, gateExitStatus, requiredTier: 'rc' });

    expect(summary.passed).toBe(false);
    expect(summary.gateExitStatusPassed).toBe(false);
    expect(summary.evidenceComplete).toBe(true);
    expect(summary.failedGates).toMatchObject([{ name: 'build', exitCode: 1 }]);
    expect(() => assertReleaseGateSummaryPass(summary)).toThrow(
      'Release gate summary did not pass: gate exit status failed',
    );
  });

  it('summarizes missing evidence as failure even when gate exit statuses pass', () => {
    const gateExitStatus = evaluateGateExitStatuses(gates.map((gate) => evidenceFor(gate)), { gates });
    const entries = gates.map((gate) => ({
      name: gate.name,
      filename: gate.filename,
      tier: gate.tier,
      exists: gate.name !== 'build',
    }));

    const summary = summarizeReleaseGates({ entries, gateExitStatus, requiredTier: 'rc' });

    expect(summary.passed).toBe(false);
    expect(summary.gateExitStatusPassed).toBe(true);
    expect(summary.evidenceComplete).toBe(false);
    expect(summary.missingEvidence).toEqual([
      {
        name: 'build',
        filename: 'build.log',
        tier: 'beta',
        path: null,
      },
    ]);
    expect(() => assertReleaseGateSummaryPass(summary)).toThrow(
      'Release gate summary did not pass: missing evidence: build.log',
    );
  });
});
