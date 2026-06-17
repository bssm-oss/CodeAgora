import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  GITHUB_ACTION_STABLE_EVIDENCE_SCHEMA_VERSION,
  recordGithubActionStableEvidence,
} from '../../scripts/github-action-stable-evidence.mjs';
import { EXPECTED_EVIDENCE, RELEASE_GATE_EXECUTIONS } from '../../scripts/release-gates.mjs';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-github-action-stable-evidence-'));
}

describe('GitHub Action stable replay evidence', () => {
  it('writes real replay evidence for all stable GitHub Action degradation paths', async () => {
    const dir = makeTmpDir();
    try {
      const result = await recordGithubActionStableEvidence({
        evidenceDir: dir,
        runReplayTests: false,
      });

      expect(result.records).toHaveLength(6);
      const records = result.records.map(({ record }) => record);
      expect(records.map((record) => record.name)).toEqual([
        'github-action-fork-pr-degraded',
        'github-action-missing-secrets-degraded',
        'github-action-stale-head-degraded',
        'github-action-oversized-diff-degraded',
        'github-action-provider-failure-degraded',
        'github-action-posting-failure-degraded',
      ]);

      for (const { record, outputPath } of result.records) {
        expect(fs.existsSync(outputPath)).toBe(true);
        expect(record).toMatchObject({
          schemaVersion: GITHUB_ACTION_STABLE_EVIDENCE_SCHEMA_VERSION,
          surface: 'github_actions',
          releaseTier: 'stable',
          evidenceMode: 'real',
          source: 'replayed-action-runtime-tests',
          passed: true,
          replay: {
            command: expect.stringContaining('pnpm vitest run'),
            exitCode: 0,
          },
        });
        expect(record.replayedAssertions.length).toBeGreaterThanOrEqual(4);
      }

      expect(records.find((record) => record.name === 'github-action-fork-pr-degraded')).toMatchObject({
        scenario: 'fork-pr',
        degradedReason: 'untrusted-fork-pr',
        verdict: 'SKIPPED',
        checks: {
          providerBackedReviewStarted: false,
          githubPostingAttempted: false,
        },
      });
      expect(records.find((record) => record.name === 'github-action-provider-failure-degraded')).toMatchObject({
        degradedReason: 'provider-runtime-failed',
        verdict: 'DEGRADED',
        checks: {
          providerBackedReviewStarted: true,
          githubPostingAttempted: false,
        },
      });
      expect(records.find((record) => record.name === 'github-action-posting-failure-degraded')).toMatchObject({
        degradedReason: 'github-post-failed',
        verdict: 'DEGRADED',
        checks: {
          providerBackedReviewStarted: true,
          githubPostingAttempted: true,
        },
      });

      const metadata = fs
        .readFileSync(path.join(dir, 'release-evidence-metadata.jsonl'), 'utf-8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(metadata).toHaveLength(6);
      expect(metadata.every((entry) => entry.evidenceMode === 'real' && entry.passed === true)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exposes the stable GitHub Action replay script through the release inventory', () => {
    const manifest = JSON.parse(fs.readFileSync('package.json', 'utf-8')) as {
      scripts: Record<string, string>;
    };
    const githubEntries = EXPECTED_EVIDENCE.filter((entry) => entry.name.startsWith('github-action-'));

    expect(manifest.scripts['evidence:github-action-stable']).toBe(
      'node scripts/github-action-stable-evidence.mjs',
    );
    expect(githubEntries.map((entry) => entry.name)).toEqual([
      'github-action-same-repo-pr-success',
      'github-action-fork-pr-degraded',
      'github-action-missing-secrets-degraded',
      'github-action-stale-head-degraded',
      'github-action-oversized-diff-degraded',
      'github-action-provider-failure-degraded',
      'github-action-posting-failure-degraded',
    ]);
    for (const entry of githubEntries.slice(1)) {
      expect(entry).toMatchObject({
        tier: 'stable',
        liveOnly: true,
        execution: RELEASE_GATE_EXECUTIONS.LIVE_GITHUB,
      });
      expect(entry.command).toContain('pnpm evidence:github-action-stable');
    }
  });
});
