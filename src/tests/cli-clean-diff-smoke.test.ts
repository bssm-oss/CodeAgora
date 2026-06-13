import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLEAN_FIXTURE_DIFF,
  buildReviewArgs,
  buildSessionArtifactReference,
  createSmokeConfig,
  evaluateOutcome,
  loadCredentialStoreIntoEnv,
  parseArgs,
  resolveTranscriptOutputPath,
  runSmoke,
  summarizeReview,
} from '../../scripts/cli-clean-diff-smoke.mjs';
import {
  EXPECTED_EVIDENCE,
  RELEASE_GATE_EXECUTIONS,
  deterministicLocalReleaseCommands,
} from '../../scripts/release-gates.mjs';

describe('CLI clean-diff smoke runner', () => {
  it('is exposed as an independently executable package script', () => {
    const manifest = JSON.parse(fs.readFileSync('package.json', 'utf-8')) as {
      scripts: Record<string, string>;
    };

    expect(manifest.scripts['smoke:cli-clean-diff']).toBe('node scripts/cli-clean-diff-smoke.mjs');
    expect(manifest.scripts['smoke:cli-staged-diff']).toBe(
      'node scripts/cli-clean-diff-smoke.mjs --fixture staged-diff',
    );
    expect(manifest.scripts['smoke:cli-patch-file']).toBe(
      'node scripts/cli-clean-diff-smoke.mjs --fixture patch-file',
    );
    expect(manifest.scripts['smoke:cli-invalid-config']).toBe(
      'node scripts/cli-clean-diff-smoke.mjs --fixture invalid-config',
    );
    expect(manifest.scripts['smoke:cli-missing-provider-key']).toBe(
      'node scripts/cli-clean-diff-smoke.mjs --fixture missing-provider-key',
    );
    expect(manifest.scripts['smoke:cli-provider-failure']).toBe(
      'node scripts/cli-clean-diff-smoke.mjs --fixture provider-failure',
    );
    expect(manifest.scripts['smoke:cli-timeout-runtime']).toBe(
      'node scripts/cli-clean-diff-smoke.mjs --fixture timeout-runtime',
    );
  });

  it('keeps the clean fixture small, harmless, and TypeScript-scoped', () => {
    expect(CLEAN_FIXTURE_DIFF).toContain('diff --git a/src/math.ts b/src/math.ts');
    expect(CLEAN_FIXTURE_DIFF).toContain('return a + b;');
    expect(CLEAN_FIXTURE_DIFF).not.toMatch(/token|password|secret|api[_-]?key/i);
  });

  it('builds a single-reviewer provider config for the smoke run', () => {
    const options = parseArgs(['--provider', 'groq', '--model', 'llama-3.3-70b-versatile']);
    const config = createSmokeConfig(options);

    expect(config.reviewers).toHaveLength(1);
    expect(config.reviewers[0]).toMatchObject({
      id: 'clean-diff-smoke-reviewer',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      backend: 'api',
    });
    expect(config.discussion.enabled).toBe(false);
    expect(config.errorHandling.maxRetries).toBe(0);
  });

  it('accepts the pnpm argument separator before smoke options', () => {
    expect(parseArgs(['--', '--dry-run'])).toMatchObject({
      dryRun: true,
      provider: 'openrouter',
      model: 'xiaomi/mimo-v2.5',
      fixture: 'clean-diff',
    });
  });

  it('loads saved credentials into the smoke runner environment without overriding existing env', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-smoke-credentials-'));
    try {
      const credentialsPath = path.join(dir, 'credentials');
      fs.writeFileSync(
        credentialsPath,
        [
          '# ignored',
          'OPENROUTER_API_KEY=stored-openrouter-key',
          'OPENAI_API_KEY=stored-openai-key',
          '',
        ].join('\n'),
      );
      fs.chmodSync(credentialsPath, 0o600);

      const env: Record<string, string> = {
        OPENAI_API_KEY: 'existing-openai-key',
      };
      expect(loadCredentialStoreIntoEnv(credentialsPath, env)).toBe(true);

      expect(env.OPENROUTER_API_KEY).toBe('stored-openrouter-key');
      expect(env.OPENAI_API_KEY).toBe('existing-openai-key');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds staged-diff CLI args without a patch-file input', () => {
    expect(buildReviewArgs([], parseArgs(['--fixture', 'staged-diff']))).toEqual(
      expect.arrayContaining(['review', '--staged', '--output', 'json']),
    );
    expect(buildReviewArgs([], parseArgs(['--fixture', 'staged-diff']))).not.toContain('clean.patch');
  });

  it('accepts an explicit patch-file path for the patch-file smoke fixture', () => {
    const patchPath = path.join(os.tmpdir(), 'codeagora-smoke-explicit.patch');
    const options = parseArgs(['--patch-file', patchPath]);

    expect(options).toMatchObject({
      fixture: 'patch-file',
      patchFile: path.resolve(patchPath),
    });
    expect(buildReviewArgs([], options)).toEqual(
      expect.arrayContaining(['review', path.resolve(patchPath), '--output', 'json']),
    );
    expect(buildReviewArgs([], options)).not.toContain('--staged');
  });

  it('builds invalid-config CLI args against the fixture patch without requiring provider input', () => {
    const options = parseArgs(['--fixture', 'invalid-config']);

    expect(options).toMatchObject({
      fixture: 'invalid-config',
    });
    expect(buildReviewArgs([], options)).toEqual(
      expect.arrayContaining(['review', 'clean.patch', '--output', 'json']),
    );
    expect(buildReviewArgs([], options)).not.toContain('--staged');
  });

  it('builds missing-provider-key CLI args against the fixture patch without preflight provider input', () => {
    const options = parseArgs(['--fixture', 'missing-provider-key']);

    expect(options).toMatchObject({
      fixture: 'missing-provider-key',
    });
    expect(buildReviewArgs([], options)).toEqual(
      expect.arrayContaining(['review', 'clean.patch', '--output', 'json']),
    );
    expect(buildReviewArgs([], options)).not.toContain('--staged');
  });

  it('builds provider-failure CLI args against the fixture patch without preflight provider input', () => {
    const options = parseArgs(['--fixture', 'provider-failure']);

    expect(options).toMatchObject({
      fixture: 'provider-failure',
    });
    expect(buildReviewArgs([], options)).toEqual(
      expect.arrayContaining(['review', 'clean.patch', '--output', 'json']),
    );
    expect(buildReviewArgs([], options)).not.toContain('--staged');
  });

  it('builds timeout-runtime CLI args with a one-second review timeout', () => {
    const options = parseArgs(['--fixture', 'timeout-runtime', '--timeout-ms', '60000']);
    const args = buildReviewArgs([], options);

    expect(options).toMatchObject({
      fixture: 'timeout-runtime',
      timeoutMs: 60000,
    });
    expect(args).toEqual(expect.arrayContaining(['review', 'clean.patch', '--output', 'json']));
    expect(args).not.toContain('--staged');
    expect(args.slice(args.indexOf('--timeout'), args.indexOf('--timeout') + 2)).toEqual(['--timeout', '1']);
    expect(args.slice(args.indexOf('--reviewer-timeout'), args.indexOf('--reviewer-timeout') + 2)).toEqual([
      '--reviewer-timeout',
      '1',
    ]);
  });

  it('derives a transcript sidecar path from the structured evidence output path', () => {
    expect(
      resolveTranscriptOutputPath(parseArgs(['--output', '.sisyphus/evidence/cli-live-clean-diff-smoke.json'])),
    ).toBe(path.join('.sisyphus', 'evidence', 'cli-live-clean-diff-smoke.transcript.txt'));
    expect(
      resolveTranscriptOutputPath(parseArgs([
        '--output',
        '.sisyphus/evidence/cli-live-clean-diff-smoke.json',
        '--transcript-output',
        '.sisyphus/evidence/custom-transcript.txt',
      ])),
    ).toBe(path.join('.sisyphus', 'evidence', 'custom-transcript.txt'));
  });

  it('classifies provider-free local runner validation through dry-run mode', () => {
    const outcome = evaluateOutcome({
      options: parseArgs(['--dry-run']),
      childResult: {
        exitCode: 0,
        signal: null,
        timedOut: false,
        stdout: '{"estimation":{"totalEstimatedCost":"$0.0001"},"diffMetadata":{"includedFiles":["src/math.ts"],"excludedFiles":[]},"health":[],"warnings":[]}',
        stderr: '',
        durationMs: 10,
      },
      parsed: {
        estimation: { totalEstimatedCost: '$0.0001' },
        diffMetadata: { includedFiles: ['src/math.ts'], excludedFiles: [] },
        health: [],
        warnings: [],
      },
      parseError: null,
      missingEnvVar: null,
    });

    expect(outcome).toMatchObject({
      status: 'pass',
      passed: true,
      reason: 'Dry-run clean-diff fixture passed',
    });
  });

  it('reports saved-provider credential auth failures instead of a generic CLI exit', () => {
    const outcome = evaluateOutcome({
      options: parseArgs(['--provider', 'openrouter']),
      childResult: {
        exitCode: 2,
        signal: null,
        timedOut: false,
        stdout: '',
        stderr: '',
        durationMs: 10,
      },
      parsed: {
        status: 'error',
        error: 'All reviewers failed due to provider/API failures.\n- reviewer: auth: User not found.',
      },
      parseError: null,
      missingEnvVar: null,
    });

    expect(outcome).toMatchObject({
      status: 'fail',
      passed: false,
    });
    expect(outcome.reason).toContain('Live provider check failed with saved OPENROUTER_API_KEY');
    expect(outcome.reason).toContain('credentials');
    expect(outcome.reason).toContain('User not found');
  });

  it('executes dry-run mode and returns a structured run result', async () => {
    const result = await runSmoke(parseArgs(['--dry-run']));

    expect(result).toMatchObject({
      schemaVersion: 'codeagora.cli-clean-diff-smoke.v1',
      surface: 'cli',
      passed: true,
      exitCode: 0,
      mode: 'dry-run',
      provider: 'openrouter',
      model: 'xiaomi/mimo-v2.5',
      outcome: {
        status: 'pass',
        passed: true,
      },
      fixture: {
        kind: 'clean-diff',
        expectedDecision: 'ACCEPT',
        expectedFindings: 0,
      },
    });
    expect(result.parsed.includedFiles).toContain('src/math.ts');
    expect(result.cli.exitCode).toBe(0);
  });

  it('executes staged-diff mode in an isolated git fixture and records the observed CLI exit code', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-staged-diff-record-'));
    const cliPath = path.join(dir, 'fake-cli.mjs');
    const capturePath = path.join(dir, 'fake-cli-capture.json');
    const originalKey = process.env.OPENROUTER_API_KEY;
    const originalCapture = process.env.CODEAGORA_FAKE_CAPTURE;

    try {
      fs.writeFileSync(
        cliPath,
        [
          '#!/usr/bin/env node',
          'import fs from "node:fs";',
          'import { spawnSync } from "node:child_process";',
          'const diff = spawnSync("git", ["diff", "--staged", "--", "src/math.ts"], { encoding: "utf-8" });',
          'fs.writeFileSync(process.env.CODEAGORA_FAKE_CAPTURE, JSON.stringify({',
          '  argv: process.argv.slice(2),',
          '  cwd: process.cwd(),',
          '  gitDirectoryPresent: fs.existsSync(".git"),',
          '  gitStatus: diff.status,',
          '  stagedDiff: diff.stdout,',
          '  stagedDiffError: diff.stderr',
          '}));',
          'process.exit(17);',
          '',
        ].join('\n'),
        'utf-8',
      );
      fs.chmodSync(cliPath, 0o755);
      process.env.OPENROUTER_API_KEY = 'test-live-smoke-key';
      process.env.CODEAGORA_FAKE_CAPTURE = capturePath;

      const result = await runSmoke(parseArgs(['--fixture', 'staged-diff', '--cli', cliPath]));
      const captured = JSON.parse(fs.readFileSync(capturePath, 'utf-8'));

      expect(result).toMatchObject({
        mode: 'live',
        passed: false,
        exitCode: 17,
        fixture: {
          kind: 'staged-diff',
        },
        cli: {
          exitCode: 17,
        },
        outcome: {
          status: 'fail',
          passed: false,
          reason: 'CLI exited with 17',
        },
      });
      expect(captured.argv).toContain('review');
      expect(captured.argv).toContain('--staged');
      expect(captured.argv).not.toContain('clean.patch');
      expect(captured.gitDirectoryPresent).toBe(true);
      expect(captured.gitStatus).toBe(0);
      expect(captured.stagedDiff).toContain('diff --git a/src/math.ts b/src/math.ts');
      expect(captured.stagedDiff).toContain('staged-diff smoke fixture');
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalKey;
      }
      if (originalCapture === undefined) {
        delete process.env.CODEAGORA_FAKE_CAPTURE;
      } else {
        process.env.CODEAGORA_FAKE_CAPTURE = originalCapture;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists live patch-file pass status, process exit code, and transcript in the recorded result', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-patch-file-smoke-'));
    const cliPath = path.join(dir, 'fake-cli.mjs');
    const capturePath = path.join(dir, 'fake-cli-capture.json');
    const patchPath = path.join(dir, 'external-clean.patch');
    const outputPath = path.join(dir, 'cli-live-patch-file-smoke.json');
    const transcriptPath = path.join(dir, 'cli-live-patch-file-smoke.transcript.txt');
    const originalKey = process.env.OPENROUTER_API_KEY;
    const originalCapture = process.env.CODEAGORA_FAKE_CAPTURE;

    try {
      fs.writeFileSync(patchPath, CLEAN_FIXTURE_DIFF, 'utf-8');
      fs.writeFileSync(
        cliPath,
        [
          '#!/usr/bin/env node',
          'import fs from "node:fs";',
          'import path from "node:path";',
          'const argv = process.argv.slice(2);',
          'const patchArg = argv[argv.indexOf("review") + 1];',
          'const patchContent = fs.readFileSync(patchArg, "utf-8");',
          'const sessionDir = path.join(process.cwd(), ".ca", "sessions", "2026-06-11", "patch-file-session");',
          'fs.mkdirSync(sessionDir, { recursive: true });',
          'fs.writeFileSync(path.join(sessionDir, "result.json"), JSON.stringify({ schemaVersion: "codeagora.session.v1" }));',
          'fs.writeFileSync(process.env.CODEAGORA_FAKE_CAPTURE, JSON.stringify({',
          '  argv,',
          '  cwd: process.cwd(),',
          '  patchArg,',
          '  patchContent',
          '}));',
          'console.log(JSON.stringify({',
          '  schemaVersion: "codeagora.review.v1",',
          '  status: "success",',
          '  sessionId: "patch-file-session",',
          '  date: "2026-06-11",',
          '  summary: { decision: "ACCEPT", severityCounts: {} },',
          '  evidenceDocs: []',
          '}));',
          'console.error("stderr patch-file smoke footer");',
          '',
        ].join('\n'),
        'utf-8',
      );
      fs.chmodSync(cliPath, 0o755);
      process.env.OPENROUTER_API_KEY = 'test-live-smoke-key';
      process.env.CODEAGORA_FAKE_CAPTURE = capturePath;

      const result = await runSmoke(parseArgs([
        '--fixture',
        'patch-file',
        '--patch-file',
        patchPath,
        '--cli',
        cliPath,
        '--output',
        outputPath,
      ]));
      const recorded = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      const captured = JSON.parse(fs.readFileSync(capturePath, 'utf-8'));

      expect(result).toMatchObject({
        mode: 'live',
        passed: true,
        exitCode: 0,
        fixture: {
          kind: 'patch-file',
        },
        outcome: {
          status: 'pass',
          passed: true,
        },
        cli: {
          exitCode: 0,
        },
        transcript: {
          path: transcriptPath,
          schemaVersion: 'codeagora.cli-clean-diff-smoke.transcript.v1',
          stdoutCaptured: true,
          stderrCaptured: true,
        },
        sessionArtifact: {
          state: 'present',
          reason: null,
          sessionId: 'patch-file-session',
          date: '2026-06-11',
          directory: path.join('.ca', 'sessions', '2026-06-11', 'patch-file-session'),
          resultPath: path.join('.ca', 'sessions', '2026-06-11', 'patch-file-session', 'result.json'),
          retained: false,
          retainedPath: null,
        },
      });
      expect(recorded).toMatchObject({
        schemaVersion: 'codeagora.cli-clean-diff-smoke.v1',
        mode: 'live',
        passed: true,
        exitCode: 0,
        fixture: {
          kind: 'patch-file',
        },
        outcome: {
          status: 'pass',
          passed: true,
        },
        cli: {
          exitCode: 0,
        },
        transcript: {
          path: transcriptPath,
          schemaVersion: 'codeagora.cli-clean-diff-smoke.transcript.v1',
          stdoutCaptured: true,
          stderrCaptured: true,
        },
        sessionArtifact: {
          state: 'present',
          reason: null,
          sessionId: 'patch-file-session',
          date: '2026-06-11',
          directory: path.join('.ca', 'sessions', '2026-06-11', 'patch-file-session'),
          resultPath: path.join('.ca', 'sessions', '2026-06-11', 'patch-file-session', 'result.json'),
          retained: false,
          retainedPath: null,
        },
      });
      expect(recorded.transcript.sizeBytes).toBeGreaterThan(0);
      expect(recorded.transcript.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(recorded.sessionArtifact).toMatchObject({
        state: 'present',
        sizeBytes: expect.any(Number),
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(recorded.sessionArtifact.sizeBytes).toBeGreaterThan(0);
      expect(captured.argv).toContain('review');
      expect(captured.argv).toContain(path.resolve(patchPath));
      expect(captured.argv).not.toContain('--staged');
      expect(captured.argv).not.toContain('clean.patch');
      expect(captured.patchArg).toBe(path.resolve(patchPath));
      expect(captured.patchContent).toContain('diff --git a/src/math.ts b/src/math.ts');

      const transcript = fs.readFileSync(transcriptPath, 'utf-8');
      expect(transcript).toContain('schemaVersion: codeagora.cli-clean-diff-smoke.transcript.v1');
      expect(transcript).toContain('mode: live');
      expect(transcript).toContain('exitCode: 0');
      expect(transcript).toContain('outcomeStatus: pass');
      expect(transcript).toContain(path.resolve(patchPath));
      expect(transcript).toContain('--- stdout ---');
      expect(transcript).toContain('"sessionId":"patch-file-session"');
      expect(transcript).toContain('--- stderr ---');
      expect(transcript).toContain('stderr patch-file smoke footer');
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalKey;
      }
      if (originalCapture === undefined) {
        delete process.env.CODEAGORA_FAKE_CAPTURE;
      } else {
        process.env.CODEAGORA_FAKE_CAPTURE = originalCapture;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists live staged-diff pass status, process exit code, and transcript in the recorded result', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-staged-diff-pass-record-'));
    const cliPath = path.join(dir, 'fake-cli.mjs');
    const capturePath = path.join(dir, 'fake-cli-capture.json');
    const outputPath = path.join(dir, 'cli-live-staged-diff-smoke.json');
    const transcriptPath = path.join(dir, 'cli-live-staged-diff-smoke.transcript.txt');
    const originalKey = process.env.OPENROUTER_API_KEY;
    const originalCapture = process.env.CODEAGORA_FAKE_CAPTURE;

    try {
      fs.writeFileSync(
        cliPath,
        [
          '#!/usr/bin/env node',
          'import fs from "node:fs";',
          'import path from "node:path";',
          'import { spawnSync } from "node:child_process";',
          'const diff = spawnSync("git", ["diff", "--staged", "--", "src/math.ts"], { encoding: "utf-8" });',
          'const sessionDir = path.join(process.cwd(), ".ca", "sessions", "2026-06-11", "staged-diff-session");',
          'fs.mkdirSync(sessionDir, { recursive: true });',
          'fs.writeFileSync(path.join(sessionDir, "result.json"), JSON.stringify({ schemaVersion: "codeagora.session.v1" }));',
          'fs.writeFileSync(process.env.CODEAGORA_FAKE_CAPTURE, JSON.stringify({',
          '  argv: process.argv.slice(2),',
          '  cwd: process.cwd(),',
          '  gitDirectoryPresent: fs.existsSync(".git"),',
          '  gitStatus: diff.status,',
          '  stagedDiff: diff.stdout,',
          '  stagedDiffError: diff.stderr',
          '}));',
          'console.log(JSON.stringify({',
          '  schemaVersion: "codeagora.review.v1",',
          '  status: "success",',
          '  sessionId: "staged-diff-session",',
          '  date: "2026-06-11",',
          '  summary: { decision: "ACCEPT", severityCounts: {} },',
          '  evidenceDocs: []',
          '}));',
          'console.error("stderr staged-diff smoke footer");',
          '',
        ].join('\n'),
        'utf-8',
      );
      fs.chmodSync(cliPath, 0o755);
      process.env.OPENROUTER_API_KEY = 'test-live-smoke-key';
      process.env.CODEAGORA_FAKE_CAPTURE = capturePath;

      const result = await runSmoke(parseArgs(['--fixture', 'staged-diff', '--cli', cliPath, '--output', outputPath]));
      const recorded = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      const captured = JSON.parse(fs.readFileSync(capturePath, 'utf-8'));

      expect(result).toMatchObject({
        mode: 'live',
        passed: true,
        exitCode: 0,
        fixture: {
          kind: 'staged-diff',
        },
        outcome: {
          status: 'pass',
          passed: true,
        },
        cli: {
          exitCode: 0,
        },
        transcript: {
          path: transcriptPath,
          schemaVersion: 'codeagora.cli-clean-diff-smoke.transcript.v1',
          stdoutCaptured: true,
          stderrCaptured: true,
        },
        sessionArtifact: {
          state: 'present',
          reason: null,
          sessionId: 'staged-diff-session',
          date: '2026-06-11',
          directory: path.join('.ca', 'sessions', '2026-06-11', 'staged-diff-session'),
          resultPath: path.join('.ca', 'sessions', '2026-06-11', 'staged-diff-session', 'result.json'),
          retained: false,
          retainedPath: null,
        },
      });
      expect(recorded).toMatchObject({
        schemaVersion: 'codeagora.cli-clean-diff-smoke.v1',
        mode: 'live',
        passed: true,
        exitCode: 0,
        fixture: {
          kind: 'staged-diff',
        },
        outcome: {
          status: 'pass',
          passed: true,
        },
        cli: {
          exitCode: 0,
        },
        transcript: {
          path: transcriptPath,
          schemaVersion: 'codeagora.cli-clean-diff-smoke.transcript.v1',
          stdoutCaptured: true,
          stderrCaptured: true,
        },
      });
      expect(recorded.transcript.sizeBytes).toBeGreaterThan(0);
      expect(recorded.transcript.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(recorded.sessionArtifact).toMatchObject({
        state: 'present',
        sizeBytes: expect.any(Number),
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(recorded.sessionArtifact.sizeBytes).toBeGreaterThan(0);
      expect(captured.argv).toContain('--staged');
      expect(captured.argv).not.toContain('clean.patch');
      expect(captured.gitDirectoryPresent).toBe(true);
      expect(captured.gitStatus).toBe(0);
      expect(captured.stagedDiff).toContain('staged-diff smoke fixture');

      const transcript = fs.readFileSync(transcriptPath, 'utf-8');
      expect(transcript).toContain('schemaVersion: codeagora.cli-clean-diff-smoke.transcript.v1');
      expect(transcript).toContain('mode: live');
      expect(transcript).toContain('exitCode: 0');
      expect(transcript).toContain('outcomeStatus: pass');
      expect(transcript).toContain('--staged');
      expect(transcript).toContain('--- stdout ---');
      expect(transcript).toContain('"sessionId":"staged-diff-session"');
      expect(transcript).toContain('--- stderr ---');
      expect(transcript).toContain('stderr staged-diff smoke footer');
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalKey;
      }
      if (originalCapture === undefined) {
        delete process.env.CODEAGORA_FAKE_CAPTURE;
      } else {
        process.env.CODEAGORA_FAKE_CAPTURE = originalCapture;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists live clean-diff pass status, process exit code, and transcript in the recorded result', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-clean-diff-record-'));
    const cliPath = path.join(dir, 'fake-cli.mjs');
    const outputPath = path.join(dir, 'cli-live-clean-diff-smoke.json');
    const transcriptPath = path.join(dir, 'cli-live-clean-diff-smoke.transcript.txt');
    const originalKey = process.env.OPENROUTER_API_KEY;

    try {
      fs.writeFileSync(
        cliPath,
        [
          '#!/usr/bin/env node',
          'import fs from "node:fs";',
          'import path from "node:path";',
          'const sessionDir = path.join(process.cwd(), ".ca", "sessions", "2026-06-11", "clean-diff-session");',
          'fs.mkdirSync(sessionDir, { recursive: true });',
          'fs.writeFileSync(path.join(sessionDir, "result.json"), JSON.stringify({ schemaVersion: "codeagora.session.v1" }));',
          'console.log(JSON.stringify({',
          '  schemaVersion: "codeagora.review.v1",',
          '  status: "success",',
          '  sessionId: "clean-diff-session",',
          '  date: "2026-06-11",',
          '  summary: { decision: "ACCEPT", severityCounts: {} },',
          '  evidenceDocs: []',
          '}));',
          'console.error("stderr clean-diff smoke footer");',
          '',
        ].join('\n'),
        'utf-8',
      );
      fs.chmodSync(cliPath, 0o755);
      process.env.OPENROUTER_API_KEY = 'test-live-smoke-key';

      const result = await runSmoke(parseArgs(['--cli', cliPath, '--output', outputPath]));
      const recorded = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));

      expect(result).toMatchObject({
        mode: 'live',
        passed: true,
        exitCode: 0,
        outcome: {
          status: 'pass',
          passed: true,
        },
        cli: {
          exitCode: 0,
        },
        transcript: {
          path: transcriptPath,
          schemaVersion: 'codeagora.cli-clean-diff-smoke.transcript.v1',
          stdoutCaptured: true,
          stderrCaptured: true,
        },
        sessionArtifact: {
          state: 'present',
          reason: null,
          sessionId: 'clean-diff-session',
          date: '2026-06-11',
          directory: path.join('.ca', 'sessions', '2026-06-11', 'clean-diff-session'),
          resultPath: path.join('.ca', 'sessions', '2026-06-11', 'clean-diff-session', 'result.json'),
          retained: false,
          retainedPath: null,
        },
      });
      expect(recorded).toMatchObject({
        schemaVersion: 'codeagora.cli-clean-diff-smoke.v1',
        mode: 'live',
        passed: true,
        exitCode: 0,
        outcome: {
          passed: true,
        },
        cli: {
          exitCode: 0,
        },
        transcript: {
          path: transcriptPath,
          schemaVersion: 'codeagora.cli-clean-diff-smoke.transcript.v1',
          stdoutCaptured: true,
          stderrCaptured: true,
        },
        sessionArtifact: {
          state: 'present',
          reason: null,
          sessionId: 'clean-diff-session',
          date: '2026-06-11',
          directory: path.join('.ca', 'sessions', '2026-06-11', 'clean-diff-session'),
          resultPath: path.join('.ca', 'sessions', '2026-06-11', 'clean-diff-session', 'result.json'),
          retained: false,
          retainedPath: null,
        },
      });
      expect(recorded.transcript.sizeBytes).toBeGreaterThan(0);
      expect(recorded.transcript.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(recorded.sessionArtifact).toMatchObject({
        state: 'present',
        sizeBytes: expect.any(Number),
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(recorded.sessionArtifact.sizeBytes).toBeGreaterThan(0);

      const transcript = fs.readFileSync(transcriptPath, 'utf-8');
      expect(transcript).toContain('schemaVersion: codeagora.cli-clean-diff-smoke.transcript.v1');
      expect(transcript).toContain('mode: live');
      expect(transcript).toContain('outcomeStatus: pass');
      expect(transcript).toContain('--- stdout ---');
      expect(transcript).toContain('"sessionId":"clean-diff-session"');
      expect(transcript).toContain('--- stderr ---');
      expect(transcript).toContain('stderr clean-diff smoke footer');
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalKey;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists live invalid-config pass status, exit code, transcript, and session artifact state', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-invalid-config-record-'));
    const cliPath = path.join(dir, 'fake-cli.mjs');
    const capturePath = path.join(dir, 'fake-cli-capture.json');
    const outputPath = path.join(dir, 'cli-live-invalid-config-smoke.json');
    const transcriptPath = path.join(dir, 'cli-live-invalid-config-smoke.transcript.txt');
    const originalKey = process.env.OPENROUTER_API_KEY;
    const originalCapture = process.env.CODEAGORA_FAKE_CAPTURE;

    try {
      delete process.env.OPENROUTER_API_KEY;
      fs.writeFileSync(
        cliPath,
        [
          '#!/usr/bin/env node',
          'import fs from "node:fs";',
          'const argv = process.argv.slice(2);',
          'fs.writeFileSync(process.env.CODEAGORA_FAKE_CAPTURE, JSON.stringify({',
          '  argv,',
          '  cwd: process.cwd(),',
          '  configText: fs.readFileSync(".ca/config.json", "utf-8"),',
          '  patchText: fs.readFileSync("clean.patch", "utf-8"),',
          '  openrouterPresent: Boolean(process.env.OPENROUTER_API_KEY)',
          '}));',
          'console.error("Error: JSON parse error at line 1 column 3");',
          'process.exit(2);',
          '',
        ].join('\n'),
        'utf-8',
      );
      fs.chmodSync(cliPath, 0o755);
      process.env.CODEAGORA_FAKE_CAPTURE = capturePath;

      const result = await runSmoke(parseArgs([
        '--fixture',
        'invalid-config',
        '--cli',
        cliPath,
        '--output',
        outputPath,
      ]));
      const recorded = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      const captured = JSON.parse(fs.readFileSync(capturePath, 'utf-8'));

      expect(result).toMatchObject({
        mode: 'live',
        passed: true,
        exitCode: 2,
        requiredEnvVar: null,
        fixture: {
          kind: 'invalid-config',
          expectedDecision: null,
          expectedFindings: null,
          expectedExitCode: 2,
          files: ['.ca/config.json', 'clean.patch'],
        },
        outcome: {
          status: 'pass',
          passed: true,
          reason: 'CLI invalid-config validation rejected malformed config with exit code 2',
        },
        cli: {
          exitCode: 2,
        },
        transcript: {
          path: transcriptPath,
          schemaVersion: 'codeagora.cli-clean-diff-smoke.transcript.v1',
          stdoutCaptured: true,
          stderrCaptured: true,
        },
        sessionArtifact: {
          state: 'absent',
          reason: 'invalid-config-rejected-before-session-artifact',
          sessionId: null,
          date: null,
          directory: null,
          resultPath: null,
          retained: false,
        },
      });
      expect(recorded).toMatchObject(result);
      expect(recorded.transcript.sizeBytes).toBeGreaterThan(0);
      expect(recorded.transcript.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(captured.argv).toContain('review');
      expect(captured.argv).toContain('clean.patch');
      expect(captured.argv).not.toContain('--staged');
      expect(captured.configText).toBe('{ invalid json');
      expect(captured.patchText).toContain('diff --git a/src/math.ts b/src/math.ts');
      expect(captured.openrouterPresent).toBe(false);

      const transcript = fs.readFileSync(transcriptPath, 'utf-8');
      expect(transcript).toContain('schemaVersion: codeagora.cli-clean-diff-smoke.transcript.v1');
      expect(transcript).toContain('mode: live');
      expect(transcript).toContain('exitCode: 2');
      expect(transcript).toContain('outcomeStatus: pass');
      expect(transcript).toContain('outcomeReason: CLI invalid-config validation rejected malformed config with exit code 2');
      expect(transcript).toContain('--- stderr ---');
      expect(transcript).toContain('Error: JSON parse error');
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalKey;
      }
      if (originalCapture === undefined) {
        delete process.env.CODEAGORA_FAKE_CAPTURE;
      } else {
        process.env.CODEAGORA_FAKE_CAPTURE = originalCapture;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists live missing-provider-key pass status, exit code, transcript, and session artifact state', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-missing-provider-key-record-'));
    const cliPath = path.join(dir, 'fake-cli.mjs');
    const capturePath = path.join(dir, 'fake-cli-capture.json');
    const outputPath = path.join(dir, 'cli-live-missing-provider-key-smoke.json');
    const transcriptPath = path.join(dir, 'cli-live-missing-provider-key-smoke.transcript.txt');
    const originalKey = process.env.OPENROUTER_API_KEY;
    const originalCapture = process.env.CODEAGORA_FAKE_CAPTURE;

    try {
      process.env.OPENROUTER_API_KEY = 'parent-key-that-must-not-reach-child';
      fs.writeFileSync(
        cliPath,
        [
          '#!/usr/bin/env node',
          'import fs from "node:fs";',
          'const argv = process.argv.slice(2);',
          'fs.writeFileSync(process.env.CODEAGORA_FAKE_CAPTURE, JSON.stringify({',
          '  argv,',
          '  cwd: process.cwd(),',
          '  configText: fs.readFileSync(".ca/config.json", "utf-8"),',
          '  patchText: fs.readFileSync("clean.patch", "utf-8"),',
          '  openrouterPresent: Boolean(process.env.OPENROUTER_API_KEY)',
          '}));',
          'console.error("Error: API key not found for provider \\"openrouter\\". Set OPENROUTER_API_KEY environment variable.");',
          'process.exit(2);',
          '',
        ].join('\n'),
        'utf-8',
      );
      fs.chmodSync(cliPath, 0o755);
      process.env.CODEAGORA_FAKE_CAPTURE = capturePath;

      const result = await runSmoke(parseArgs([
        '--fixture',
        'missing-provider-key',
        '--cli',
        cliPath,
        '--output',
        outputPath,
      ]));
      const recorded = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      const captured = JSON.parse(fs.readFileSync(capturePath, 'utf-8'));

      expect(result).toMatchObject({
        mode: 'live',
        passed: true,
        exitCode: 2,
        requiredEnvVar: 'OPENROUTER_API_KEY',
        fixture: {
          kind: 'missing-provider-key',
          expectedDecision: null,
          expectedFindings: null,
          expectedExitCode: 2,
          files: ['.ca/config.json', 'clean.patch'],
        },
        outcome: {
          status: 'pass',
          passed: true,
          reason: 'CLI missing-provider-key validation rejected missing OPENROUTER_API_KEY with exit code 2',
        },
        cli: {
          exitCode: 2,
        },
        transcript: {
          path: transcriptPath,
          schemaVersion: 'codeagora.cli-clean-diff-smoke.transcript.v1',
          stdoutCaptured: true,
          stderrCaptured: true,
        },
        sessionArtifact: {
          state: 'absent',
          reason: 'missing-provider-key-rejected-before-session-artifact',
          sessionId: null,
          date: null,
          directory: null,
          resultPath: null,
          retained: false,
        },
      });
      expect(recorded).toMatchObject(result);
      expect(recorded.transcript.sizeBytes).toBeGreaterThan(0);
      expect(recorded.transcript.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(captured.argv).toContain('review');
      expect(captured.argv).toContain('clean.patch');
      expect(captured.argv).not.toContain('--staged');
      expect(captured.configText).toContain('"provider": "openrouter"');
      expect(captured.patchText).toContain('diff --git a/src/math.ts b/src/math.ts');
      expect(captured.openrouterPresent).toBe(false);

      const transcript = fs.readFileSync(transcriptPath, 'utf-8');
      expect(transcript).toContain('schemaVersion: codeagora.cli-clean-diff-smoke.transcript.v1');
      expect(transcript).toContain('mode: live');
      expect(transcript).toContain('exitCode: 2');
      expect(transcript).toContain('outcomeStatus: pass');
      expect(transcript).toContain(
        'outcomeReason: CLI missing-provider-key validation rejected missing OPENROUTER_API_KEY with exit code 2',
      );
      expect(transcript).toContain('--- stderr ---');
      expect(transcript).toContain('API key not found');
      expect(transcript).toContain('OPENROUTER_API_KEY');
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalKey;
      }
      if (originalCapture === undefined) {
        delete process.env.CODEAGORA_FAKE_CAPTURE;
      } else {
        process.env.CODEAGORA_FAKE_CAPTURE = originalCapture;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists live provider-failure runtime pass status, exit code, transcript, and session artifact state', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-provider-failure-record-'));
    const cliPath = path.join(dir, 'fake-cli.mjs');
    const capturePath = path.join(dir, 'fake-cli-capture.json');
    const outputPath = path.join(dir, 'cli-live-provider-failure-smoke.json');
    const transcriptPath = path.join(dir, 'cli-live-provider-failure-smoke.transcript.txt');
    const originalKey = process.env.OPENROUTER_API_KEY;
    const originalCapture = process.env.CODEAGORA_FAKE_CAPTURE;

    try {
      process.env.OPENROUTER_API_KEY = 'parent-key-that-must-be-overridden';
      fs.writeFileSync(
        cliPath,
        [
          '#!/usr/bin/env node',
          'import fs from "node:fs";',
          'import path from "node:path";',
          'const argv = process.argv.slice(2);',
          'const sessionDir = path.join(process.cwd(), ".ca", "sessions", "2026-06-11", "provider-failure-session");',
          'fs.mkdirSync(sessionDir, { recursive: true });',
          'fs.writeFileSync(path.join(sessionDir, "result.json"), JSON.stringify({ schemaVersion: "codeagora.session.v1" }));',
          'fs.writeFileSync(process.env.CODEAGORA_FAKE_CAPTURE, JSON.stringify({',
          '  argv,',
          '  cwd: process.cwd(),',
          '  configText: fs.readFileSync(".ca/config.json", "utf-8"),',
          '  patchText: fs.readFileSync("clean.patch", "utf-8"),',
          '  openrouterKey: process.env.OPENROUTER_API_KEY',
          '}));',
          'console.log(JSON.stringify({',
          '  schemaVersion: "codeagora.review.v1",',
          '  status: "error",',
          '  sessionId: "provider-failure-session",',
          '  date: "2026-06-11",',
          '  error: "All reviewers failed due to provider/API failures: auth failed"',
          '}));',
          'console.error("provider runtime failure diagnostic");',
          'process.exit(3);',
          '',
        ].join('\n'),
        'utf-8',
      );
      fs.chmodSync(cliPath, 0o755);
      process.env.CODEAGORA_FAKE_CAPTURE = capturePath;

      const result = await runSmoke(parseArgs([
        '--fixture',
        'provider-failure',
        '--cli',
        cliPath,
        '--output',
        outputPath,
      ]));
      const recorded = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      const captured = JSON.parse(fs.readFileSync(capturePath, 'utf-8'));

      expect(result).toMatchObject({
        mode: 'live',
        passed: true,
        exitCode: 3,
        requiredEnvVar: 'OPENROUTER_API_KEY',
        fixture: {
          kind: 'provider-failure',
          expectedDecision: null,
          expectedFindings: null,
          expectedExitCode: 3,
        },
        outcome: {
          status: 'pass',
          passed: true,
          reason: 'CLI provider-failure runtime path returned structured error with exit code 3',
        },
        cli: {
          exitCode: 3,
        },
        transcript: {
          path: transcriptPath,
          schemaVersion: 'codeagora.cli-clean-diff-smoke.transcript.v1',
          stdoutCaptured: true,
          stderrCaptured: true,
        },
        sessionArtifact: {
          state: 'present',
          reason: null,
          sessionId: 'provider-failure-session',
          date: '2026-06-11',
          directory: path.join('.ca', 'sessions', '2026-06-11', 'provider-failure-session'),
          resultPath: path.join('.ca', 'sessions', '2026-06-11', 'provider-failure-session', 'result.json'),
          retained: false,
          retainedPath: null,
        },
        parsed: {
          status: 'error',
          sessionId: 'provider-failure-session',
          date: '2026-06-11',
        },
      });
      expect(recorded).toMatchObject(result);
      expect(recorded.transcript.sizeBytes).toBeGreaterThan(0);
      expect(recorded.transcript.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(recorded.sessionArtifact).toMatchObject({
        state: 'present',
        sizeBytes: expect.any(Number),
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(recorded.sessionArtifact.sizeBytes).toBeGreaterThan(0);
      expect(captured.argv).toContain('review');
      expect(captured.argv).toContain('clean.patch');
      expect(captured.argv).not.toContain('--staged');
      expect(captured.configText).toContain('"provider": "openrouter"');
      expect(captured.patchText).toContain('diff --git a/src/math.ts b/src/math.ts');
      expect(captured.openrouterKey).toBe('codeagora-provider-failure-smoke-invalid-key');

      const transcript = fs.readFileSync(transcriptPath, 'utf-8');
      expect(transcript).toContain('schemaVersion: codeagora.cli-clean-diff-smoke.transcript.v1');
      expect(transcript).toContain('mode: live');
      expect(transcript).toContain('exitCode: 3');
      expect(transcript).toContain('outcomeStatus: pass');
      expect(transcript).toContain(
        'outcomeReason: CLI provider-failure runtime path returned structured error with exit code 3',
      );
      expect(transcript).toContain('--- stdout ---');
      expect(transcript).toContain('"status":"error"');
      expect(transcript).toContain('provider/API failures');
      expect(transcript).toContain('--- stderr ---');
      expect(transcript).toContain('provider runtime failure diagnostic');
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalKey;
      }
      if (originalCapture === undefined) {
        delete process.env.CODEAGORA_FAKE_CAPTURE;
      } else {
        process.env.CODEAGORA_FAKE_CAPTURE = originalCapture;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists live timeout-runtime pass status, exit code, transcript, and session artifact state', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-timeout-runtime-record-'));
    const cliPath = path.join(dir, 'fake-cli.mjs');
    const capturePath = path.join(dir, 'fake-cli-capture.json');
    const outputPath = path.join(dir, 'cli-live-timeout-runtime-smoke.json');
    const transcriptPath = path.join(dir, 'cli-live-timeout-runtime-smoke.transcript.txt');
    const originalKey = process.env.OPENROUTER_API_KEY;
    const originalCapture = process.env.CODEAGORA_FAKE_CAPTURE;

    try {
      process.env.OPENROUTER_API_KEY = 'live-timeout-runtime-smoke-key';
      fs.writeFileSync(
        cliPath,
        [
          '#!/usr/bin/env node',
          'import fs from "node:fs";',
          'import path from "node:path";',
          'const argv = process.argv.slice(2);',
          'const sessionDir = path.join(process.cwd(), ".ca", "sessions", "2026-06-11", "timeout-runtime-session");',
          'fs.mkdirSync(sessionDir, { recursive: true });',
          'fs.writeFileSync(path.join(sessionDir, "result.json"), JSON.stringify({ schemaVersion: "codeagora.session.v1" }));',
          'fs.writeFileSync(process.env.CODEAGORA_FAKE_CAPTURE, JSON.stringify({',
          '  argv,',
          '  cwd: process.cwd(),',
          '  configText: fs.readFileSync(".ca/config.json", "utf-8"),',
          '  patchText: fs.readFileSync("clean.patch", "utf-8"),',
          '  openrouterKey: process.env.OPENROUTER_API_KEY',
          '}));',
          'console.log(JSON.stringify({',
          '  schemaVersion: "codeagora.review.v1",',
          '  status: "error",',
          '  sessionId: "timeout-runtime-session",',
          '  date: "2026-06-11",',
          '  error: "Pipeline timed out after 1s"',
          '}));',
          'console.error("timeout runtime diagnostic");',
          'process.exit(3);',
          '',
        ].join('\n'),
        'utf-8',
      );
      fs.chmodSync(cliPath, 0o755);
      process.env.CODEAGORA_FAKE_CAPTURE = capturePath;

      const result = await runSmoke(parseArgs([
        '--fixture',
        'timeout-runtime',
        '--cli',
        cliPath,
        '--output',
        outputPath,
        '--timeout-ms',
        '60000',
      ]));
      const recorded = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      const captured = JSON.parse(fs.readFileSync(capturePath, 'utf-8'));

      expect(result).toMatchObject({
        mode: 'live',
        passed: true,
        exitCode: 3,
        requiredEnvVar: 'OPENROUTER_API_KEY',
        fixture: {
          kind: 'timeout-runtime',
          expectedDecision: null,
          expectedFindings: null,
          expectedExitCode: 3,
        },
        outcome: {
          status: 'pass',
          passed: true,
          reason: 'CLI timeout runtime path returned structured error with exit code 3',
        },
        cli: {
          exitCode: 3,
          timedOut: false,
        },
        transcript: {
          path: transcriptPath,
          schemaVersion: 'codeagora.cli-clean-diff-smoke.transcript.v1',
          stdoutCaptured: true,
          stderrCaptured: true,
        },
        sessionArtifact: {
          state: 'present',
          reason: null,
          sessionId: 'timeout-runtime-session',
          date: '2026-06-11',
          directory: path.join('.ca', 'sessions', '2026-06-11', 'timeout-runtime-session'),
          resultPath: path.join('.ca', 'sessions', '2026-06-11', 'timeout-runtime-session', 'result.json'),
          retained: false,
          retainedPath: null,
        },
        parsed: {
          status: 'error',
          sessionId: 'timeout-runtime-session',
          date: '2026-06-11',
        },
      });
      expect(recorded).toMatchObject(result);
      expect(recorded.transcript.sizeBytes).toBeGreaterThan(0);
      expect(recorded.transcript.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(recorded.sessionArtifact).toMatchObject({
        state: 'present',
        sizeBytes: expect.any(Number),
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(recorded.sessionArtifact.sizeBytes).toBeGreaterThan(0);
      expect(captured.argv).toContain('review');
      expect(captured.argv).toContain('clean.patch');
      expect(captured.argv).not.toContain('--staged');
      expect(captured.argv.slice(captured.argv.indexOf('--timeout'), captured.argv.indexOf('--timeout') + 2)).toEqual([
        '--timeout',
        '1',
      ]);
      expect(captured.argv.slice(captured.argv.indexOf('--reviewer-timeout'), captured.argv.indexOf('--reviewer-timeout') + 2)).toEqual([
        '--reviewer-timeout',
        '1',
      ]);
      expect(captured.configText).toContain('"timeout": 1');
      expect(captured.patchText).toContain('diff --git a/src/math.ts b/src/math.ts');
      expect(captured.openrouterKey).toBe('live-timeout-runtime-smoke-key');

      const transcript = fs.readFileSync(transcriptPath, 'utf-8');
      expect(transcript).toContain('schemaVersion: codeagora.cli-clean-diff-smoke.transcript.v1');
      expect(transcript).toContain('mode: live');
      expect(transcript).toContain('exitCode: 3');
      expect(transcript).toContain('timedOut: false');
      expect(transcript).toContain('outcomeStatus: pass');
      expect(transcript).toContain(
        'outcomeReason: CLI timeout runtime path returned structured error with exit code 3',
      );
      expect(transcript).toContain('--- stdout ---');
      expect(transcript).toContain('"status":"error"');
      expect(transcript).toContain('Pipeline timed out after 1s');
      expect(transcript).toContain('--- stderr ---');
      expect(transcript).toContain('timeout runtime diagnostic');
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalKey;
      }
      if (originalCapture === undefined) {
        delete process.env.CODEAGORA_FAKE_CAPTURE;
      } else {
        process.env.CODEAGORA_FAKE_CAPTURE = originalCapture;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records live staged-diff session artifact absence when the CLI does not write the result file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-staged-diff-no-session-artifact-'));
    const cliPath = path.join(dir, 'fake-cli.mjs');
    const outputPath = path.join(dir, 'cli-live-staged-diff-smoke.json');
    const originalKey = process.env.OPENROUTER_API_KEY;

    try {
      fs.writeFileSync(
        cliPath,
        [
          '#!/usr/bin/env node',
          'console.log(JSON.stringify({',
          '  schemaVersion: "codeagora.review.v1",',
          '  status: "success",',
          '  sessionId: "staged-diff-session-without-result",',
          '  date: "2026-06-11",',
          '  summary: { decision: "ACCEPT", severityCounts: {} },',
          '  evidenceDocs: []',
          '}));',
          '',
        ].join('\n'),
        'utf-8',
      );
      fs.chmodSync(cliPath, 0o755);
      process.env.OPENROUTER_API_KEY = 'test-live-smoke-key';

      const result = await runSmoke(parseArgs(['--fixture', 'staged-diff', '--cli', cliPath, '--output', outputPath]));
      const recorded = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));

      expect(result).toMatchObject({
        mode: 'live',
        passed: true,
        fixture: {
          kind: 'staged-diff',
        },
        sessionArtifact: {
          state: 'absent',
          reason: 'session-artifact-result-json-missing',
          sessionId: 'staged-diff-session-without-result',
          date: '2026-06-11',
          directory: path.join('.ca', 'sessions', '2026-06-11', 'staged-diff-session-without-result'),
          resultPath: path.join(
            '.ca',
            'sessions',
            '2026-06-11',
            'staged-diff-session-without-result',
            'result.json',
          ),
          retained: false,
          retainedPath: null,
        },
      });
      expect(recorded.sessionArtifact).toMatchObject(result.sessionArtifact);
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalKey;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records an explicit absent session artifact state when no artifact reference is available', () => {
    expect(
      buildSessionArtifactReference({
        parsed: {
          schemaVersion: 'codeagora.review.v1',
          status: 'success',
          summary: { decision: 'ACCEPT' },
          evidenceDocs: [],
        },
        fixtureDir: '/tmp/codeagora-clean-diff-smoke',
        keepTemp: false,
        dryRun: false,
      }),
    ).toEqual({
      state: 'absent',
      reason: 'cli-json-missing-session-artifact-reference',
      sessionId: null,
      date: null,
      directory: null,
      resultPath: null,
      retained: false,
    });

    expect(
      buildSessionArtifactReference({
        parsed: null,
        fixtureDir: '/tmp/codeagora-clean-diff-smoke',
        keepTemp: false,
        dryRun: true,
      }),
    ).toEqual({
      state: 'absent',
      reason: 'dry-run-does-not-create-session-artifacts',
      sessionId: null,
      date: null,
      directory: null,
      resultPath: null,
      retained: false,
    });
  });

  it('returns blocked structured status for live mode when provider credentials are missing', () => {
    const outcome = evaluateOutcome({
      options: parseArgs(['--provider', 'openrouter']),
      childResult: {
        exitCode: 1,
        signal: null,
        timedOut: false,
        stdout: '',
        stderr: '',
        durationMs: 0,
      },
      parsed: null,
      parseError: null,
      missingEnvVar: 'OPENROUTER_API_KEY',
    });

    expect(outcome).toEqual({
      status: 'blocked',
      passed: false,
      reason: `OPENROUTER_API_KEY is required for live CLI clean-diff smoke; checked process env and ${path.join(os.homedir(), '.config', 'codeagora', 'credentials')}`,
    });
  });

  it('requires live clean-diff review output to accept with zero findings', () => {
    const parsed = {
      schemaVersion: 'codeagora.review.v1',
      status: 'success',
      sessionId: '001',
      date: '2026-06-11',
      summary: {
        decision: 'ACCEPT',
        severityCounts: {},
      },
      evidenceDocs: [],
    };

    expect(summarizeReview(parsed)).toMatchObject({
      schemaVersion: 'codeagora.review.v1',
      status: 'success',
      decision: 'ACCEPT',
      evidenceCount: 0,
    });
    expect(
      evaluateOutcome({
        options: parseArgs([]),
        childResult: {
          exitCode: 0,
          signal: null,
          timedOut: false,
          stdout: JSON.stringify(parsed),
          stderr: '',
          durationMs: 10,
        },
        parsed,
        parseError: null,
        missingEnvVar: null,
      }),
    ).toMatchObject({
      status: 'pass',
      passed: true,
    });
  });

  it('classifies timeout-runtime structured CLI errors as a passing runtime smoke', () => {
    const parsed = {
      schemaVersion: 'codeagora.review.v1',
      status: 'error',
      sessionId: 'timeout-session',
      date: '2026-06-11',
      error: 'Pipeline timed out after 1s',
    };

    expect(
      evaluateOutcome({
        options: parseArgs(['--fixture', 'timeout-runtime']),
        childResult: {
          exitCode: 3,
          signal: null,
          timedOut: false,
          stdout: JSON.stringify(parsed),
          stderr: '',
          durationMs: 1000,
        },
        parsed,
        parseError: null,
        missingEnvVar: null,
      }),
    ).toEqual({
      status: 'pass',
      passed: true,
      reason: 'CLI timeout runtime path returned structured error with exit code 3',
    });
  });

  it('tracks live clean-diff smoke as stable live-provider evidence, not a deterministic gate', () => {
    const entry = EXPECTED_EVIDENCE.find((item) => item.name === 'cli-live-clean-diff-smoke');
    const transcript = EXPECTED_EVIDENCE.find((item) => item.name === 'cli-live-clean-diff-transcript');
    const stagedEntry = EXPECTED_EVIDENCE.find((item) => item.name === 'cli-live-staged-diff-smoke');
    const stagedTranscript = EXPECTED_EVIDENCE.find((item) => item.name === 'cli-live-staged-diff-transcript');
    const patchFileEntry = EXPECTED_EVIDENCE.find((item) => item.name === 'cli-live-patch-file-smoke');
    const patchFileTranscript = EXPECTED_EVIDENCE.find((item) => item.name === 'cli-live-patch-file-transcript');
    const invalidConfigEntry = EXPECTED_EVIDENCE.find((item) => item.name === 'cli-live-invalid-config-smoke');
    const invalidConfigTranscript = EXPECTED_EVIDENCE.find((item) => item.name === 'cli-live-invalid-config-transcript');
    const missingProviderKeyEntry = EXPECTED_EVIDENCE.find((item) => item.name === 'cli-live-missing-provider-key-smoke');
    const missingProviderKeyTranscript = EXPECTED_EVIDENCE.find((item) => item.name === 'cli-live-missing-provider-key-transcript');
    const providerFailureEntry = EXPECTED_EVIDENCE.find((item) => item.name === 'cli-live-provider-failure-smoke');
    const providerFailureTranscript = EXPECTED_EVIDENCE.find((item) => item.name === 'cli-live-provider-failure-transcript');
    const timeoutRuntimeEntry = EXPECTED_EVIDENCE.find((item) => item.name === 'cli-live-timeout-runtime-smoke');
    const timeoutRuntimeTranscript = EXPECTED_EVIDENCE.find((item) => item.name === 'cli-live-timeout-runtime-transcript');

    expect(entry).toMatchObject({
      filename: 'cli-live-clean-diff-smoke.json',
      command: 'pnpm smoke:cli-clean-diff with provider credentials',
      tier: 'stable',
      liveOnly: true,
      execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER,
    });
    expect(transcript).toMatchObject({
      filename: 'cli-live-clean-diff-smoke.transcript.txt',
      command: 'pnpm smoke:cli-clean-diff with provider credentials',
      tier: 'stable',
      liveOnly: true,
      execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER,
    });
    expect(stagedEntry).toMatchObject({
      filename: 'cli-live-staged-diff-smoke.json',
      command: 'pnpm smoke:cli-staged-diff with provider credentials',
      tier: 'stable',
      liveOnly: true,
      execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER,
    });
    expect(stagedTranscript).toMatchObject({
      filename: 'cli-live-staged-diff-smoke.transcript.txt',
      command: 'sidecar transcript from pnpm smoke:cli-staged-diff with provider credentials',
      tier: 'stable',
      liveOnly: true,
      execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER,
    });
    expect(patchFileEntry).toMatchObject({
      filename: 'cli-live-patch-file-smoke.json',
      command: 'pnpm smoke:cli-patch-file with provider credentials',
      tier: 'stable',
      liveOnly: true,
      execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER,
    });
    expect(patchFileTranscript).toMatchObject({
      filename: 'cli-live-patch-file-smoke.transcript.txt',
      command: 'sidecar transcript from pnpm smoke:cli-patch-file with provider credentials',
      tier: 'stable',
      liveOnly: true,
      execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER,
    });
    expect(invalidConfigEntry).toMatchObject({
      filename: 'cli-live-invalid-config-smoke.json',
      command: 'pnpm smoke:cli-invalid-config',
      tier: 'stable',
      liveOnly: true,
      execution: RELEASE_GATE_EXECUTIONS.LIVE_CLI,
    });
    expect(invalidConfigTranscript).toMatchObject({
      filename: 'cli-live-invalid-config-smoke.transcript.txt',
      command: 'sidecar transcript from pnpm smoke:cli-invalid-config',
      tier: 'stable',
      liveOnly: true,
      execution: RELEASE_GATE_EXECUTIONS.LIVE_CLI,
    });
    expect(missingProviderKeyEntry).toMatchObject({
      filename: 'cli-live-missing-provider-key-smoke.json',
      command: 'pnpm smoke:cli-missing-provider-key',
      tier: 'stable',
      liveOnly: true,
      execution: RELEASE_GATE_EXECUTIONS.LIVE_CLI,
    });
    expect(missingProviderKeyTranscript).toMatchObject({
      filename: 'cli-live-missing-provider-key-smoke.transcript.txt',
      command: 'sidecar transcript from pnpm smoke:cli-missing-provider-key',
      tier: 'stable',
      liveOnly: true,
      execution: RELEASE_GATE_EXECUTIONS.LIVE_CLI,
    });
    expect(providerFailureEntry).toMatchObject({
      filename: 'cli-live-provider-failure-smoke.json',
      command: 'pnpm smoke:cli-provider-failure',
      tier: 'stable',
      liveOnly: true,
      execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER,
    });
    expect(providerFailureTranscript).toMatchObject({
      filename: 'cli-live-provider-failure-smoke.transcript.txt',
      command: 'sidecar transcript from pnpm smoke:cli-provider-failure',
      tier: 'stable',
      liveOnly: true,
      execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER,
    });
    expect(timeoutRuntimeEntry).toMatchObject({
      filename: 'cli-live-timeout-runtime-smoke.json',
      command: 'pnpm smoke:cli-timeout-runtime with provider credentials',
      tier: 'stable',
      liveOnly: true,
      execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER,
    });
    expect(timeoutRuntimeTranscript).toMatchObject({
      filename: 'cli-live-timeout-runtime-smoke.transcript.txt',
      command: 'sidecar transcript from pnpm smoke:cli-timeout-runtime with provider credentials',
      tier: 'stable',
      liveOnly: true,
      execution: RELEASE_GATE_EXECUTIONS.LIVE_PROVIDER,
    });
    expect(deterministicLocalReleaseCommands()).not.toContain('pnpm smoke:cli-clean-diff with provider credentials');
    expect(deterministicLocalReleaseCommands()).not.toContain('pnpm smoke:cli-staged-diff with provider credentials');
    expect(deterministicLocalReleaseCommands()).not.toContain('pnpm smoke:cli-patch-file with provider credentials');
    expect(deterministicLocalReleaseCommands()).not.toContain('pnpm smoke:cli-invalid-config');
    expect(deterministicLocalReleaseCommands()).not.toContain('pnpm smoke:cli-missing-provider-key');
    expect(deterministicLocalReleaseCommands()).not.toContain('pnpm smoke:cli-provider-failure');
    expect(deterministicLocalReleaseCommands()).not.toContain('pnpm smoke:cli-timeout-runtime with provider credentials');
  });
});
