import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIVE_GITHUB_ACTION_PR_SMOKE_SCHEMA_VERSION,
  LIVE_GITHUB_ACTION_PR_SMOKE_METADATA_SCHEMA_VERSION,
  parseGitHubOutputText,
  recordGithubActionPrSmoke,
} from '../../scripts/github-action-pr-smoke-recorder.mjs';
import {
  EXPECTED_EVIDENCE,
  RELEASE_GATE_EXECUTIONS,
  deterministicLocalReleaseCommands,
} from '../../scripts/release-gates.mjs';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-action-pr-smoke-'));
}

function writePullRequestEvent(dir: string, overrides: Record<string, unknown> = {}): string {
  const event = {
    action: 'synchronize',
    repository: {
      full_name: 'bssm-oss/CodeAgora',
    },
    pull_request: {
      number: 532,
      html_url: 'https://github.com/bssm-oss/CodeAgora/pull/532',
      title: 'Live action smoke',
      base: {
        ref: 'main',
        sha: 'base123',
        repo: {
          full_name: 'bssm-oss/CodeAgora',
        },
      },
      head: {
        ref: 'codex/live-action-smoke',
        sha: 'head456',
        repo: {
          full_name: 'bssm-oss/CodeAgora',
          fork: false,
        },
      },
    },
    ...overrides,
  };
  const eventPath = path.join(dir, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify(event, null, 2));
  return eventPath;
}

function githubEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_REPOSITORY: 'bssm-oss/CodeAgora',
    GITHUB_WORKFLOW: 'CodeAgora Review',
    GITHUB_JOB: 'review',
    GITHUB_RUN_ID: '25317789874',
    GITHUB_RUN_NUMBER: '137',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_ACTOR: 'justn-hyeok',
    GITHUB_SHA: 'workflowsha',
    ...overrides,
  };
}

describe('GitHub Action PR smoke evidence recorder', () => {
  it('parses GitHub output files, including multiline values', () => {
    expect(parseGitHubOutputText([
      'verdict=ACCEPT',
      'review-url<<EOF_review',
      'https://github.com/bssm-oss/CodeAgora/pull/532#pullrequestreview-4219826536',
      'EOF_review',
      'head-sha=head456',
      '',
    ].join('\n'))).toEqual({
      verdict: 'ACCEPT',
      'review-url': 'https://github.com/bssm-oss/CodeAgora/pull/532#pullrequestreview-4219826536',
      'head-sha': 'head456',
    });
  });

  it('records required metadata from a pull_request event and CodeAgora Action outputs', async () => {
    const dir = makeTmpDir();
    try {
      const eventPath = writePullRequestEvent(dir);
      const outputsPath = path.join(dir, 'review.outputs');
      const summaryPath = path.join(dir, 'summary.md');
      const output = path.join(dir, 'live-github-action-pr-smoke.md');
      const evidenceDir = path.join(dir, 'evidence');

      fs.writeFileSync(outputsPath, [
        'verdict=ACCEPT',
        'review-url=https://github.com/bssm-oss/CodeAgora/pull/532#pullrequestreview-4219826536',
        'session-id=2026-06-11/001',
        'degraded=false',
        'head-sha=head456',
        'base-sha=base123',
        '',
      ].join('\n'));
      fs.writeFileSync(summaryPath, '### CodeAgora review passed\n\n- Verdict: ACCEPT\n');

      const result = await recordGithubActionPrSmoke({
        eventPath,
        outputsPath,
        summaryPath,
        output,
        evidenceDir,
      }, githubEnv({
        CODEAGORA_REVIEW_STEP_OUTCOME: 'success',
        CODEAGORA_REVIEW_STEP_CONCLUSION: 'success',
        CODEAGORA_JOB_STATUS: 'success',
      }));

      expect(result.record).toMatchObject({
        schemaVersion: LIVE_GITHUB_ACTION_PR_SMOKE_SCHEMA_VERSION,
        scenario: 'same-repo-pr',
        extractionPassed: true,
        workflowRun: {
          eventName: 'pull_request',
          eventAction: 'synchronize',
          repository: 'bssm-oss/CodeAgora',
          workflow: 'CodeAgora Review',
          runId: '25317789874',
          runUrl: 'https://github.com/bssm-oss/CodeAgora/actions/runs/25317789874',
        },
        pullRequest: {
          number: 532,
          fork: false,
          base: {
            repo: 'bssm-oss/CodeAgora',
            ref: 'main',
            sha: 'base123',
          },
          head: {
            repo: 'bssm-oss/CodeAgora',
            ref: 'codex/live-action-smoke',
            sha: 'head456',
          },
        },
        actionOutputs: {
          verdict: 'ACCEPT',
          reviewUrl: 'https://github.com/bssm-oss/CodeAgora/pull/532#pullrequestreview-4219826536',
          sessionId: '2026-06-11/001',
          degraded: 'false',
          headSha: 'head456',
          baseSha: 'base123',
          reviewStepOutcome: 'success',
          reviewStepConclusion: 'success',
          jobStatus: 'success',
        },
        checks: {
          actualPullRequestContext: true,
          outputHeadShaMatchesEvent: true,
          outputBaseShaMatchesEvent: true,
          hasVerdict: true,
          hasRunUrl: true,
        },
      });
      expect(result.markdown).toContain('Source: actual GitHub Actions `pull_request` event context plus CodeAgora Action outputs.');
      expect(result.markdown).toContain('- `head-sha`: `head456`');
      expect(result.markdown).toContain('- Output base SHA matches event base SHA: `pass`');
      expect(fs.readFileSync(output, 'utf-8')).toBe(result.markdown);
      expect(result.metadata.entry).toMatchObject({
        schemaVersion: LIVE_GITHUB_ACTION_PR_SMOKE_METADATA_SCHEMA_VERSION,
        name: 'live-github-action-pr-smoke',
        command: 'pnpm evidence:github-action-pr-smoke from pull_request workflow context',
        tier: 'stable',
        execution: 'live-github',
        passed: true,
        evidencePath: path.relative(process.cwd(), output),
        scenario: 'same-repo-pr',
        workflowRun: {
          runUrl: 'https://github.com/bssm-oss/CodeAgora/actions/runs/25317789874',
        },
        actionOutputs: {
          reviewUrl: 'https://github.com/bssm-oss/CodeAgora/pull/532#pullrequestreview-4219826536',
        },
        artifactLinks: expect.arrayContaining([
          {
            label: 'GitHub Actions run',
            url: 'https://github.com/bssm-oss/CodeAgora/actions/runs/25317789874',
          },
          {
            label: 'Pull request',
            url: 'https://github.com/bssm-oss/CodeAgora/pull/532',
          },
        ]),
        outputLinks: [
          {
            label: 'review-url',
            url: 'https://github.com/bssm-oss/CodeAgora/pull/532#pullrequestreview-4219826536',
          },
        ],
      });
      const metadataEntries = fs
        .readFileSync(path.join(evidenceDir, 'release-evidence-metadata.jsonl'), 'utf-8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(metadataEntries).toHaveLength(1);
      expect(metadataEntries[0].artifactLinks).toEqual(result.metadata.entry.artifactLinks);
      expect(metadataEntries[0].outputLinks).toEqual(result.metadata.entry.outputLinks);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects non-pull_request contexts instead of producing stable live evidence', async () => {
    const dir = makeTmpDir();
    try {
      const eventPath = writePullRequestEvent(dir);
      const outputsPath = path.join(dir, 'review.outputs');
      fs.writeFileSync(outputsPath, [
        'verdict=SKIPPED',
        'degraded=true',
        'degraded-reason=missing-provider-secrets',
        'head-sha=head456',
        'base-sha=base123',
        '',
      ].join('\n'));

      await expect(recordGithubActionPrSmoke({
        eventPath,
        outputsPath,
        output: path.join(dir, 'out.md'),
        evidenceDir: path.join(dir, 'evidence'),
      }, githubEnv({ GITHUB_EVENT_NAME: 'workflow_dispatch' }))).rejects.toThrow(
        'must come from a pull_request event',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('marks SHA mismatches as failed extraction checks', async () => {
    const dir = makeTmpDir();
    try {
      const eventPath = writePullRequestEvent(dir);
      const outputsPath = path.join(dir, 'review.outputs');
      fs.writeFileSync(outputsPath, [
        'verdict=SKIPPED',
        'degraded=true',
        'degraded-reason=stale-head-sha',
        'head-sha=oldhead',
        'base-sha=base123',
        '',
      ].join('\n'));

      const result = await recordGithubActionPrSmoke({
        eventPath,
        outputsPath,
        output: path.join(dir, 'out.md'),
        evidenceDir: path.join(dir, 'evidence'),
        scenario: 'stale-head',
      }, githubEnv());

      expect(result.record.extractionPassed).toBe(false);
      expect(result.record.checks.outputHeadShaMatchesEvent).toBe(false);
      expect(result.markdown).toContain('- Output head SHA matches event head SHA: `fail`');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tracks live GitHub Action PR smoke as stable live-GitHub evidence', () => {
    const manifest = JSON.parse(fs.readFileSync('package.json', 'utf-8')) as {
      scripts: Record<string, string>;
    };
    const entry = EXPECTED_EVIDENCE.find((item) => item.name === 'live-github-action-pr-smoke');

    expect(manifest.scripts['evidence:github-action-pr-smoke']).toBe(
      'node scripts/github-action-pr-smoke-recorder.mjs',
    );
    expect(entry).toMatchObject({
      filename: 'live-github-action-pr-smoke.md',
      sourcePath: 'docs/archived/live-github-action-pr-smoke.md',
      command: 'pnpm evidence:github-action-pr-smoke from pull_request workflow context',
      tier: 'stable',
      liveOnly: true,
      execution: RELEASE_GATE_EXECUTIONS.LIVE_GITHUB,
    });
    expect(deterministicLocalReleaseCommands()).not.toContain(
      'pnpm evidence:github-action-pr-smoke from pull_request workflow context',
    );
  });
});
