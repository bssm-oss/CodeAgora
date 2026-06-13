import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../action-policy.js', () => ({
  getActionGuidance: vi.fn((reason: string) => ({
    why: `Why ${reason}`,
    nextSteps: [`Step for ${reason}`],
  })),
}));

describe('GitHub Action reporting', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeChecksOctokit(existingRuns: Array<{ id: number; name: string; head_sha: string }> = []) {
    return {
      checks: {
        listForRef: vi.fn().mockResolvedValue({ data: { check_runs: existingRuns } }),
        create: vi.fn().mockResolvedValue({
          data: { id: 1001, html_url: 'https://github.com/owner/repo/runs/1001' },
        }),
        update: vi.fn().mockResolvedValue({
          data: { id: 2002, html_url: 'https://github.com/owner/repo/runs/2002' },
        }),
      },
    };
  }

  it('writes the documented action outputs in a stable order', async () => {
    const { writeDocumentedActionOutputs } = await import('../action-reporting.js');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-reporting-'));
    const outputFile = path.join(tempDir, 'output.txt');

    writeDocumentedActionOutputs({
      headSha: 'head123',
      baseSha: 'base123',
      degraded: true,
      degradedReason: 'posting-disabled',
      verdict: 'ACCEPT',
      reviewUrl: '',
      sessionId: 'session-001',
      sarifFile: '/tmp/codeagora-results.sarif',
    }, { GITHUB_OUTPUT: outputFile });

    const output = await readFile(outputFile, 'utf-8');
    expect(output).toBe([
      'head-sha=head123',
      'base-sha=base123',
      'degraded=true',
      'degraded-reason=posting-disabled',
      'verdict=ACCEPT',
      'review-url=',
      'session-id=session-001',
      'sarif-file=/tmp/codeagora-results.sarif',
      '',
    ].join('\n'));

    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes degraded summaries with reason-specific guidance', async () => {
    const { writeActionSummary } = await import('../action-reporting.js');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-reporting-'));
    const summaryFile = path.join(tempDir, 'summary.md');

    writeActionSummary(
      'degraded',
      'posting-disabled',
      'Posting disabled by workflow input.',
      { GITHUB_STEP_SUMMARY: summaryFile },
    );

    const summary = await readFile(summaryFile, 'utf-8');
    expect(summary).toContain('### CodeAgora review degraded');
    expect(summary).toContain('Reason: `posting-disabled`');
    expect(summary).toContain('Why posting-disabled');
    expect(summary).toContain('Posting disabled by workflow input.');
    expect(summary).toContain('Step for posting-disabled');

    await rm(tempDir, { recursive: true, force: true });
  });

  it.each([
    ['ACCEPT', 'success'],
    ['REJECT', 'failure'],
    ['NEEDS_HUMAN', 'neutral'],
    ['DEGRADED', 'neutral'],
    ['SKIPPED', 'neutral'],
  ] as const)('maps %s to check-run conclusion %s', async (verdict, conclusion) => {
    const { mapActionVerdictToCheckRunConclusion } = await import('../action-reporting.js');
    expect(mapActionVerdictToCheckRunConclusion(verdict)).toBe(conclusion);
  });

  it('creates the configured check-run for the reviewed PR commit', async () => {
    const { reportActionCheckRun } = await import('../action-reporting.js');
    const octokit = makeChecksOctokit();

    const result = await reportActionCheckRun({
      config: { token: 'ghp_test', owner: 'owner', repo: 'repo' },
      sha: 'reviewed-head-sha',
      verdict: 'ACCEPT',
      checkRunName: 'CodeAgora RC Gate',
      reviewUrl: 'https://github.com/owner/repo/pull/1#pullrequestreview-1',
      summary: 'Review passed.',
      octokit,
    });

    expect(result).toEqual({
      id: 1001,
      htmlUrl: 'https://github.com/owner/repo/runs/1001',
      conclusion: 'success',
      operation: 'created',
    });
    expect(octokit.checks.listForRef).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'owner',
      repo: 'repo',
      ref: 'reviewed-head-sha',
      check_name: 'CodeAgora RC Gate',
    }));
    expect(octokit.checks.create).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'owner',
      repo: 'repo',
      name: 'CodeAgora RC Gate',
      head_sha: 'reviewed-head-sha',
      conclusion: 'success',
      details_url: 'https://github.com/owner/repo/pull/1#pullrequestreview-1',
      output: expect.objectContaining({
        title: 'CodeAgora ACCEPT',
        summary: 'Review passed.',
      }),
    }));
    expect(octokit.checks.update).not.toHaveBeenCalled();
  });

  it('renders a skipped bypass explicitly even if the caller passes an ACCEPT verdict', async () => {
    const { reportActionCheckRun } = await import('../action-reporting.js');
    const octokit = makeChecksOctokit();

    const result = await reportActionCheckRun({
      config: { token: 'ghp_test', owner: 'owner', repo: 'repo' },
      sha: 'reviewed-head-sha',
      verdict: 'ACCEPT',
      executionOutcome: 'skipped',
      degradedReason: 'untrusted-fork-pr',
      checkRunName: 'CodeAgora Review',
      summary: 'CodeAgora completed successfully with no issues found.',
      octokit,
    });

    expect(result.conclusion).toBe('neutral');
    expect(octokit.checks.create).toHaveBeenCalledWith(expect.objectContaining({
      conclusion: 'neutral',
      output: expect.objectContaining({
        title: 'CodeAgora SKIPPED',
        summary: expect.stringContaining('CodeAgora review skipped. Review execution did not run.'),
      }),
    }));
    expect(octokit.checks.create).toHaveBeenCalledWith(expect.objectContaining({
      output: expect.objectContaining({
        summary: expect.stringContaining('Reason: untrusted-fork-pr.'),
      }),
    }));
    expect(octokit.checks.create).not.toHaveBeenCalledWith(expect.objectContaining({
      conclusion: 'success',
      output: expect.objectContaining({
        title: 'CodeAgora ACCEPT',
      }),
    }));
  });

  it('renders a blocked bypass explicitly instead of a successful review verdict', async () => {
    const { reportActionCheckRun } = await import('../action-reporting.js');
    const octokit = makeChecksOctokit();

    const result = await reportActionCheckRun({
      config: { token: 'ghp_test', owner: 'owner', repo: 'repo' },
      sha: 'reviewed-head-sha',
      verdict: 'ACCEPT',
      executionOutcome: 'blocked',
      degradedReason: 'missing-provider-secrets',
      checkRunName: 'CodeAgora Review',
      summary: 'CodeAgora completed successfully with no issues found.',
      octokit,
    });

    expect(result.conclusion).toBe('neutral');
    expect(octokit.checks.create).toHaveBeenCalledWith(expect.objectContaining({
      conclusion: 'neutral',
      output: expect.objectContaining({
        title: 'CodeAgora BLOCKED',
        summary: expect.stringContaining('CodeAgora review blocked. Review execution did not run.'),
      }),
    }));
    expect(octokit.checks.create).toHaveBeenCalledWith(expect.objectContaining({
      output: expect.objectContaining({
        summary: expect.stringContaining('Reason: missing-provider-secrets.'),
      }),
    }));
    expect(octokit.checks.create).not.toHaveBeenCalledWith(expect.objectContaining({
      conclusion: 'success',
      output: expect.objectContaining({
        title: 'CodeAgora ACCEPT',
      }),
    }));
  });

  it('updates the existing configured check-run for the same reviewed commit', async () => {
    const { reportActionCheckRun } = await import('../action-reporting.js');
    const octokit = makeChecksOctokit([
      { id: 44, name: 'CodeAgora Review', head_sha: 'reviewed-head-sha' },
    ]);

    const result = await reportActionCheckRun({
      config: { token: 'ghp_test', owner: 'owner', repo: 'repo' },
      sha: 'reviewed-head-sha',
      verdict: 'DEGRADED',
      checkRunName: 'CodeAgora Review',
      summary: 'Posting failed.',
      octokit,
    });

    expect(result.operation).toBe('updated');
    expect(result.conclusion).toBe('neutral');
    expect(octokit.checks.update).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'owner',
      repo: 'repo',
      check_run_id: 44,
      name: 'CodeAgora Review',
      conclusion: 'neutral',
      output: expect.objectContaining({
        title: 'CodeAgora DEGRADED',
        summary: 'Posting failed.',
      }),
    }));
    expect(octokit.checks.create).not.toHaveBeenCalled();
  });
});
