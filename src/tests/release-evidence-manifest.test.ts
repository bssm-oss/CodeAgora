import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';

const scriptPath = path.resolve('scripts/evidence-manifest.mjs');

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-evidence-'));
}

describe('release evidence manifest', () => {
  it('writes manifest entries with hashes for present evidence files', () => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'typecheck.log'), 'typecheck ok\n');
      fs.writeFileSync(path.join(dir, 'build.log'), 'build ok\n');
      const output = path.join(dir, 'manifest.json');

      execFileSync(process.execPath, [scriptPath, '--evidence-dir', dir, '--output', output], {
        stdio: 'pipe',
      });

      const manifest = JSON.parse(fs.readFileSync(output, 'utf-8'));
      expect(manifest.schemaVersion).toBe('codeagora.release-evidence.v1');
      expect(manifest.commitSha).toMatch(/^[0-9a-f]{40}$|^unknown$/);

      const typecheck = manifest.entries.find((entry: { name: string }) => entry.name === 'typecheck');
      expect(typecheck.exists).toBe(true);
      expect(typecheck.sizeBytes).toBeGreaterThan(0);
      expect(typecheck.sha256).toMatch(/^[0-9a-f]{64}$/);

      const liveBenchmark = manifest.entries.find((entry: { name: string }) => entry.name === 'live-benchmark-report');
      expect(liveBenchmark.liveOnly).toBe(true);
      expect(liveBenchmark.tier).toBe('stable');
      expect(liveBenchmark.path).toBe('docs/live-benchmark-report.md');
      expect(liveBenchmark.exists).toBe(true);
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
      expect(result.stderr).toContain('Missing required beta evidence');
      expect(result.stderr).toContain('build.log');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not require private-preview desktop evidence for release tiers', () => {
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
      ];
      for (const file of rcFiles) {
        fs.writeFileSync(path.join(dir, file), `${file} ok\n`);
      }

      const result = spawnSync(process.execPath, [scriptPath, '--evidence-dir', dir, '--require=rc'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');

      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'evidence-manifest.json'), 'utf-8'));
      const desktopGate = manifest.entries.find((entry: { name: string }) => entry.name === 'desktop-gate');
      expect(desktopGate.requiredForRelease).toBe(false);
      expect(desktopGate.exists).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
