import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import {
  RELEASE_TIERS,
  deterministicLocalReleaseGates,
} from '../../scripts/release-gates.mjs';

const scriptPath = path.resolve('scripts/evidence-manifest.mjs');
const securitySmokeScriptPath = path.resolve('scripts/security-evidence-smoke.mjs');

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-evidence-'));
}

function tierIncluded(entryTier: string, requiredTier: string): boolean {
  return RELEASE_TIERS.indexOf(entryTier) <= RELEASE_TIERS.indexOf(requiredTier);
}

function writeGateLedger(dir: string, requiredTier: string, overrides: Record<string, number> = {}): void {
  const entries = deterministicLocalReleaseGates()
    .filter((gate) => tierIncluded(gate.tier, requiredTier))
    .map((gate) => ({
      schemaVersion: 'codeagora.release-gate-command-evidence.v1',
      name: gate.name,
      command: gate.command,
      exitCode: overrides[gate.name] ?? 0,
      passed: (overrides[gate.name] ?? 0) === 0,
      timestamp: '2026-06-11T00:00:00.000Z',
      startedAt: '2026-06-11T00:00:00.000Z',
      finishedAt: '2026-06-11T00:00:01.000Z',
      logPath: path.join(dir, gate.filename),
      logLink: null,
    }));

  fs.writeFileSync(path.join(dir, 'gate-command-evidence.jsonl'), entries.map((entry) => JSON.stringify(entry)).join('\n'));
}

function writeRealArtifact(dir: string, file: string): void {
  fs.writeFileSync(path.join(dir, file), `${JSON.stringify({
    schemaVersion: `test.${file}.v1`,
    evidenceMode: 'real',
    tests: {
      skipped: false,
      passed: true,
    },
  }, null, 2)}\n`);
}

describe('release evidence manifest', () => {
  it('writes manifest entries with hashes for present evidence files', () => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'typecheck.log'), 'typecheck ok\n');
      fs.writeFileSync(path.join(dir, 'build.log'), 'build ok\n');
      fs.writeFileSync(path.join(dir, 'release-evidence-metadata.jsonl'), `${JSON.stringify({
        schemaVersion: 'codeagora.live-github-action-pr-smoke-metadata.v1',
        name: 'live-github-action-pr-smoke',
        command: 'pnpm evidence:github-action-pr-smoke from pull_request workflow context',
        tier: 'stable',
        execution: 'live-github',
        passed: true,
        timestamp: '2026-06-11T00:00:00.000Z',
        evidencePath: 'docs/archived/live-github-action-pr-smoke.md',
        scenario: 'same-repo-pr',
        workflowRun: {
          runUrl: 'https://github.com/bssm-oss/CodeAgora/actions/runs/25317789874',
        },
        pullRequest: {
          url: 'https://github.com/bssm-oss/CodeAgora/pull/532',
        },
        artifactLinks: [
          {
            label: 'GitHub Actions run',
            url: 'https://github.com/bssm-oss/CodeAgora/actions/runs/25317789874',
          },
        ],
        outputLinks: [
          {
            label: 'review-url',
            url: 'https://github.com/bssm-oss/CodeAgora/pull/532#pullrequestreview-4219826536',
          },
        ],
      })}\n`);
      const output = path.join(dir, 'manifest.json');

      execFileSync(process.execPath, [scriptPath, '--evidence-dir', dir, '--output', output], {
        stdio: 'pipe',
      });

      const manifest = JSON.parse(fs.readFileSync(output, 'utf-8'));
      expect(manifest.schemaVersion).toBe('codeagora.release-evidence.v1');
      expect(manifest.commitSha).toMatch(/^[0-9a-f]{40}$|^unknown$/);
      expect(manifest.gateExitStatus.schemaVersion).toBe('codeagora.release-gate-exit-status.v1');
      expect(manifest.gateSummary.schemaVersion).toBe('codeagora.release-gate-summary.v1');

      const typecheck = manifest.entries.find((entry: { name: string }) => entry.name === 'typecheck');
      expect(typecheck.exists).toBe(true);
      expect(typecheck.sizeBytes).toBeGreaterThan(0);
      expect(typecheck.sha256).toMatch(/^[0-9a-f]{64}$/);

      const liveBenchmark = manifest.entries.find((entry: { name: string }) => entry.name === 'live-benchmark-report');
      expect(liveBenchmark.liveOnly).toBe(true);
      expect(liveBenchmark.tier).toBe('stable');
      expect(liveBenchmark.path).toBe('docs/archived/live-benchmark-report.md');
      expect(liveBenchmark.exists).toBe(true);

      const liveActionSmoke = manifest.entries.find((entry: { name: string }) => entry.name === 'live-github-action-pr-smoke');
      expect(manifest.evidenceMetadataStore).toBe(
        path.relative(process.cwd(), path.join(dir, 'release-evidence-metadata.jsonl')),
      );
      expect(liveActionSmoke.latestMetadata).toMatchObject({
        schemaVersion: 'codeagora.live-github-action-pr-smoke-metadata.v1',
        scenario: 'same-repo-pr',
        workflowRun: {
          runUrl: 'https://github.com/bssm-oss/CodeAgora/actions/runs/25317789874',
        },
      });
      expect(liveActionSmoke.artifactLinks).toEqual([
        {
          label: 'GitHub Actions run',
          url: 'https://github.com/bssm-oss/CodeAgora/actions/runs/25317789874',
        },
      ]);
      expect(liveActionSmoke.outputLinks).toEqual([
        {
          label: 'review-url',
          url: 'https://github.com/bssm-oss/CodeAgora/pull/532#pullrequestreview-4219826536',
        },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when required tier evidence is missing', () => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'typecheck.log'), 'typecheck ok\n');

      const result = spawnSync(process.execPath, [scriptPath, '--evidence-dir', dir, '--require=beta'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Missing or invalid required beta evidence');
      expect(result.stderr).toContain('build.log');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('requires desktop evidence for rc release tiers', () => {
    const dir = makeTmpDir();
    try {
      const rcFiles = [
        'typecheck.log',
        'lint.log',
        'build.log',
        'test.log',
        'bench-ci.log',
        'beta-smoke.log',
        'cross-surface-parity.log',
        'package-root-dry-run.log',
        'package-mcp-dry-run.log',
        'action-smoke.log',
        'mcp-smoke.log',
        'desktop-app-e2e.log',
        'desktop-macos-webdriver-e2e.log',
        'desktop-visual-qa.json',
        'desktop-gate.log',
        'desktop-evidence-manifest.json',
        'desktop-security-evidence.json',
        'security-regression.log',
        'redaction-path-safety-evidence.json',
        'github-security-evidence.json',
      ];
      for (const file of rcFiles) {
        if ([
          'desktop-security-evidence.json',
          'redaction-path-safety-evidence.json',
          'github-security-evidence.json',
        ].includes(file)) {
          writeRealArtifact(dir, file);
        } else {
          fs.writeFileSync(path.join(dir, file), `${file} ok\n`);
        }
      }
      writeGateLedger(dir, 'rc');

      const result = spawnSync(process.execPath, [scriptPath, '--evidence-dir', dir, '--require=rc'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');

      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'evidence-manifest.json'), 'utf-8'));
      const desktopGate = manifest.entries.find((entry: { name: string }) => entry.name === 'desktop-gate');
      const desktopSecurity = manifest.entries.find((entry: { name: string }) => entry.name === 'desktop-security-evidence');
      const redactionPathSafety = manifest.entries.find((entry: { name: string }) => entry.name === 'redaction-path-safety-evidence');
      const githubSecurity = manifest.entries.find((entry: { name: string }) => entry.name === 'github-security-evidence');
      expect(desktopGate.requiredForRelease).not.toBe(false);
      expect(desktopGate.exists).toBe(true);
      expect(desktopSecurity).toMatchObject({
        filename: 'desktop-security-evidence.json',
        command: 'pnpm evidence:desktop-security',
        tier: 'rc',
        exists: true,
      });
      expect(redactionPathSafety).toMatchObject({
        filename: 'redaction-path-safety-evidence.json',
        command: 'pnpm evidence:redaction-path-safety',
        tier: 'rc',
        exists: true,
      });
      expect(githubSecurity).toMatchObject({
        filename: 'github-security-evidence.json',
        command: 'pnpm evidence:github-security',
        tier: 'rc',
        exists: true,
      });
      expect(desktopSecurity.releaseValidity).toMatchObject({ evidenceMode: 'real', validForRelease: true });
      expect(redactionPathSafety.releaseValidity).toMatchObject({ evidenceMode: 'real', validForRelease: true });
      expect(githubSecurity.releaseValidity).toMatchObject({ evidenceMode: 'real', validForRelease: true });
      expect(manifest.gateExitStatus.passed).toBe(true);
      expect(manifest.gateSummary.passed).toBe(true);
      expect(manifest.gateExitStatus.failed).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows CLI/MCP/GitHub scoped rc manifests without desktop evidence', () => {
    const dir = makeTmpDir();
    try {
      const rcFiles = [
        'typecheck.log',
        'lint.log',
        'build.log',
        'test.log',
        'bench-ci.log',
        'beta-smoke.log',
        'cross-surface-parity.log',
        'package-root-dry-run.log',
        'package-mcp-dry-run.log',
        'action-smoke.log',
        'mcp-smoke.log',
        'security-regression.log',
        'redaction-path-safety-evidence.json',
        'github-security-evidence.json',
      ];
      for (const file of rcFiles) {
        if ([
          'redaction-path-safety-evidence.json',
          'github-security-evidence.json',
        ].includes(file)) {
          writeRealArtifact(dir, file);
        } else {
          fs.writeFileSync(path.join(dir, file), `${file} ok\n`);
        }
      }
      writeGateLedger(dir, 'rc');

      const result = spawnSync(
        process.execPath,
        [scriptPath, '--evidence-dir', dir, '--require=rc', '--surface=cli-mcp-github'],
        {
          encoding: 'utf-8',
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');

      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'evidence-manifest.json'), 'utf-8'));
      expect(manifest.surface).toBe('cli-mcp-github');
      expect(manifest.entries.some((entry: { name: string }) => entry.name.startsWith('desktop-'))).toBe(false);
      expect(manifest.gateExitStatus.missing).toEqual([]);
      expect(manifest.gateSummary.passed).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('smokes security command evidence capture into an rc manifest entry', () => {
    const dir = makeTmpDir();
    try {
      const result = spawnSync(
        process.execPath,
        [securitySmokeScriptPath, '--mock-security', '--evidence-dir', dir],
        {
          encoding: 'utf-8',
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Security evidence smoke passed');

      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'evidence-manifest.json'), 'utf-8'));
      const securityEntry = manifest.entries.find((entry: { name: string }) => entry.name === 'security-regression');
      const redactionPathSafetyEntry = manifest.entries.find((entry: { name: string }) => entry.name === 'redaction-path-safety-evidence');
      const desktopSecurityEntry = manifest.entries.find((entry: { name: string }) => entry.name === 'desktop-security-evidence');
      const githubSecurityEntry = manifest.entries.find((entry: { name: string }) => entry.name === 'github-security-evidence');
      expect(securityEntry).toMatchObject({
        filename: 'security-regression.log',
        command: 'pnpm test:security',
        tier: 'rc',
        exists: true,
        latestCommandEvidence: {
          schemaVersion: 'codeagora.release-gate-command-evidence.v1',
          name: 'security-regression',
          command: 'pnpm test:security',
          exitCode: 0,
          passed: true,
        },
      });
      expect(securityEntry.latestCommandEvidence.logPath).toContain('security-regression.log');
      expect(redactionPathSafetyEntry).toMatchObject({
        filename: 'redaction-path-safety-evidence.json',
        command: 'pnpm evidence:redaction-path-safety',
        tier: 'rc',
        exists: true,
      });
      const redactionPathSafetyArtifact = JSON.parse(
        fs.readFileSync(path.join(dir, 'redaction-path-safety-evidence.json'), 'utf-8'),
      );
      expect(redactionPathSafetyArtifact).toMatchObject({
        schemaVersion: 'codeagora.redaction-path-safety-evidence.v1',
        evidenceMode: 'skipped',
        releaseTier: 'rc',
        tests: {
          skipped: true,
          passed: true,
        },
        checks: {
          persistedSessionArtifactRedaction: true,
          symlinkEscapesRejected: true,
        },
      });
      expect(desktopSecurityEntry).toMatchObject({
        filename: 'desktop-security-evidence.json',
        command: 'pnpm evidence:desktop-security',
        tier: 'rc',
        exists: true,
      });
      const desktopSecurityArtifact = JSON.parse(
        fs.readFileSync(path.join(dir, 'desktop-security-evidence.json'), 'utf-8'),
      );
      expect(desktopSecurityArtifact).toMatchObject({
        schemaVersion: 'codeagora.desktop-security-evidence.v1',
        evidenceMode: 'skipped',
        releaseTier: 'rc',
        tests: {
          skipped: true,
          passed: true,
        },
        checks: {
          minimalMainWindowCapability: true,
          workspacePathBoundariesEnforced: true,
          desktopExportsRedactSecrets: true,
        },
      });
      expect(githubSecurityEntry).toMatchObject({
        filename: 'github-security-evidence.json',
        command: 'pnpm evidence:github-security',
        tier: 'rc',
        exists: true,
        releaseValidity: {
          evidenceMode: 'placeholder',
          validForRelease: false,
        },
      });
      expect(manifest.gateSummary.passed).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails required manifests when a deterministic gate has nonzero exit evidence', () => {
    const dir = makeTmpDir();
    try {
      const betaFiles = [
        'typecheck.log',
        'lint.log',
        'build.log',
        'test.log',
        'bench-ci.log',
        'beta-smoke.log',
      ];
      for (const file of betaFiles) {
        fs.writeFileSync(path.join(dir, file), `${file} ok\n`);
      }
      writeGateLedger(dir, 'beta', { build: 2 });

      const result = spawnSync(process.execPath, [scriptPath, '--evidence-dir', dir, '--require=beta'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Deterministic release gates did not all record complete passing evidence');
      expect(result.stderr).toContain('build (2)');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails required manifests when deterministic gate logs exist without command evidence records', () => {
    const dir = makeTmpDir();
    try {
      const betaFiles = [
        'typecheck.log',
        'lint.log',
        'build.log',
        'test.log',
        'bench-ci.log',
        'beta-smoke.log',
      ];
      for (const file of betaFiles) {
        fs.writeFileSync(path.join(dir, file), `${file} ok\n`);
      }

      const result = spawnSync(process.execPath, [scriptPath, '--evidence-dir', dir, '--require=beta'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Deterministic release gates did not all record complete passing evidence');
      expect(result.stderr).toContain('missing: typecheck, lint, build, test, bench-ci, beta-smoke');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects skipped or placeholder artifacts for required rc manifests', () => {
    const dir = makeTmpDir();
    try {
      const rcFiles = [
        'typecheck.log',
        'lint.log',
        'build.log',
        'test.log',
        'bench-ci.log',
        'beta-smoke.log',
        'cross-surface-parity.log',
        'package-root-dry-run.log',
        'package-mcp-dry-run.log',
        'action-smoke.log',
        'mcp-smoke.log',
        'desktop-app-e2e.log',
        'desktop-macos-webdriver-e2e.log',
        'desktop-visual-qa.json',
        'desktop-gate.log',
        'desktop-evidence-manifest.json',
        'desktop-security-evidence.json',
        'security-regression.log',
        'redaction-path-safety-evidence.json',
        'github-security-evidence.json',
      ];
      for (const file of rcFiles) {
        if (file === 'desktop-security-evidence.json') {
          fs.writeFileSync(path.join(dir, file), `${JSON.stringify({ evidenceMode: 'skipped' })}\n`);
        } else if (file === 'github-security-evidence.json') {
          fs.writeFileSync(path.join(dir, file), `${JSON.stringify({ evidenceMode: 'placeholder' })}\n`);
        } else if (file === 'redaction-path-safety-evidence.json') {
          writeRealArtifact(dir, file);
        } else {
          fs.writeFileSync(path.join(dir, file), `${file} ok\n`);
        }
      }
      writeGateLedger(dir, 'rc');

      const result = spawnSync(process.execPath, [scriptPath, '--evidence-dir', dir, '--require=rc'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Missing or invalid required rc evidence');
      expect(result.stderr).toContain('desktop-security-evidence.json (invalid evidence mode: skipped)');
      expect(result.stderr).toContain('github-security-evidence.json (invalid evidence mode: placeholder)');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
