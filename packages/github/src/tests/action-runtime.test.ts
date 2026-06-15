import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildSarifReport: vi.fn(() => ({ runs: [] })),
  createAppOctokit: vi.fn(),
  determineActionPolicy: vi.fn(),
  evaluatePrivilegedGitHubOperation: vi.fn(),
  fetchPrMetadata: vi.fn(),
  getActionGuidance: vi.fn((reason: string) => ({
    why: `Why ${reason}`,
    nextSteps: [`Step for ${reason}`],
  })),
  handleNeedsHuman: vi.fn(),
  isStaleHead: vi.fn(),
  loadConfigFile: vi.fn(),
  mapToGitHubReview: vi.fn(() => ({
    commit_id: '0123456789abcdef0123456789abcdef01234567',
    event: 'APPROVE',
    verdict: 'ACCEPT',
    body: 'review',
    comments: [],
  })),
  parseActionInputs: vi.fn(),
  postReview: vi.fn(),
  readFile: vi.fn(),
  runPipeline: vi.fn(),
  setCommitStatus: vi.fn(),
  serializeSarif: vi.fn(() => '{"runs":[]}' ),
  filterSarifPublishableEvidenceDocs: vi.fn((docs: unknown[]) => docs),
  writeFile: vi.fn(),
  validateActionDiffPath: vi.fn(),
  validateActionOutputPath: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: mocks.readFile,
    writeFile: mocks.writeFile,
  },
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
}));

vi.mock('@codeagora/core/pipeline/orchestrator.js', () => ({
  runPipeline: mocks.runPipeline,
}));

vi.mock('@codeagora/core/config/loader.js', () => ({
  loadConfigFile: mocks.loadConfigFile,
}));

vi.mock('../action-policy.js', () => ({
  determineActionPolicy: mocks.determineActionPolicy,
  evaluatePrivilegedGitHubOperation: mocks.evaluatePrivilegedGitHubOperation,
  getActionGuidance: mocks.getActionGuidance,
  isStaleHead: mocks.isStaleHead,
  parseActionInputs: mocks.parseActionInputs,
  validateActionDiffPath: mocks.validateActionDiffPath,
  validateActionOutputPath: mocks.validateActionOutputPath,
}));

vi.mock('../mapper.js', () => ({
  mapToGitHubReview: mocks.mapToGitHubReview,
}));

vi.mock('../poster.js', () => ({
  postReview: mocks.postReview,
  setCommitStatus: mocks.setCommitStatus,
  handleNeedsHuman: mocks.handleNeedsHuman,
}));

vi.mock('../client.js', () => ({
  createAppOctokit: mocks.createAppOctokit,
}));

vi.mock('../pr-diff.js', () => ({
  fetchPrMetadata: mocks.fetchPrMetadata,
}));

vi.mock('../diff-parser.js', () => ({
  buildDiffPositionIndex: vi.fn(() => ({})),
}));

vi.mock('../sarif.js', () => ({
  buildSarifReport: mocks.buildSarifReport,
  filterSarifPublishableEvidenceDocs: mocks.filterSarifPublishableEvidenceDocs,
  serializeSarif: mocks.serializeSarif,
}));

describe('GitHub Action runtime', () => {
  const eventHeadSha = '0123456789abcdef0123456789abcdef01234567';
  const inputSha = 'fedcba9876543210fedcba9876543210fedcba98';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.mocked(mocks.evaluatePrivilegedGitHubOperation).mockReturnValue({ allowed: true, operation: 'review-comment' } as never);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`unexpected process.exit(${code ?? 'undefined'})`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_OUTPUT;
    delete process.env.GITHUB_STEP_SUMMARY;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_EVENT_NAME;
    delete process.env.GITHUB_EVENT_PATH;
    delete process.env.OPENROUTER_API_KEY;
  });

  it('skips missing provider secrets as a safe degraded state before invoking reviewers', async () => {
    const { mkdtemp, readFile, rm, writeFile } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-runtime-'));
    const outputFile = path.join(tempDir, 'output.txt');
    const summaryFile = path.join(tempDir, 'summary.md');
    const diffFile = path.join(tempDir, 'diff.patch');
    const eventFile = path.join(tempDir, 'event.json');

    process.env.GITHUB_OUTPUT = outputFile;
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.GITHUB_EVENT_PATH = eventFile;
    await writeFile(eventFile, JSON.stringify({ pull_request: { head: { sha: eventHeadSha } } }));

    vi.mocked(mocks.parseActionInputs).mockReturnValue({
      repo: 'owner/repo',
      sha: inputSha,
      pr: 42,
      diff: diffFile,
      token: 'ghp_test',
      configPath: '.ca/config.json',
      baseSha: 'base123',
      maxDiffLines: 0,
      failOnReject: false,
      postResults: true,
      reporterMode: 'check-run',
      baseRepo: 'owner/repo',
      headRepo: 'owner/repo',
      checkRunName: 'CodeAgora Review',
    } as never);

    vi.mocked(mocks.determineActionPolicy).mockReturnValue({
      degraded: true,
      degradedReason: 'missing-provider-secrets',
      shouldRunReview: false,
      shouldPostResults: false,
      verdictOverride: 'SKIPPED',
    } as never);

    vi.mocked(mocks.validateActionDiffPath).mockResolvedValue(diffFile);
    vi.mocked(mocks.createAppOctokit).mockResolvedValue(null as never);

    await import('../action.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.runPipeline).not.toHaveBeenCalled();
    expect(mocks.loadConfigFile).not.toHaveBeenCalled();
    expect(mocks.mapToGitHubReview).not.toHaveBeenCalled();
    expect(mocks.postReview).not.toHaveBeenCalled();
    expect(mocks.setCommitStatus).not.toHaveBeenCalled();
    expect(mocks.fetchPrMetadata).not.toHaveBeenCalled();
    expect(mocks.handleNeedsHuman).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.validateActionOutputPath).not.toHaveBeenCalled();

    const output = await readFile(outputFile, 'utf-8');
    expect(output).toContain(`head-sha=${eventHeadSha}`);
    expect(output).toContain('base-sha=base123');
    expect(output).toContain('degraded=true');
    expect(output).toContain('degraded-reason=missing-provider-secrets');
    expect(output).not.toContain('degraded-reason=github-post-failed');
    expect(output).toContain('verdict=SKIPPED');

    const summary = await readFile(summaryFile, 'utf-8');
    expect(summary).toContain('CodeAgora review skipped');
    expect(summary).toContain('Reason: `missing-provider-secrets`');
    expect(summary).toContain('Step for missing-provider-secrets');

    await rm(tempDir, { recursive: true, force: true });
  });

  it('skips untrusted fork PRs before invoking reviewers or provider-backed pipeline work', async () => {
    const { mkdtemp, readFile, rm, writeFile } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-runtime-'));
    const outputFile = path.join(tempDir, 'output.txt');
    const summaryFile = path.join(tempDir, 'summary.md');
    const diffFile = path.join(tempDir, 'diff.patch');
    const eventFile = path.join(tempDir, 'event.json');

    process.env.GITHUB_OUTPUT = outputFile;
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.OPENROUTER_API_KEY = 'provider-secret-that-must-not-be-used';
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.GITHUB_EVENT_PATH = eventFile;
    await writeFile(eventFile, JSON.stringify({ pull_request: { head: { sha: eventHeadSha } } }));

    vi.mocked(mocks.parseActionInputs).mockReturnValue({
      repo: 'owner/repo',
      sha: inputSha,
      pr: 42,
      diff: diffFile,
      token: 'ghp_test',
      configPath: '.ca/config.json',
      baseSha: 'base123',
      maxDiffLines: 0,
      failOnReject: false,
      postResults: true,
      reporterMode: 'check-run',
      baseRepo: 'owner/repo',
      headRepo: 'fork/repo',
      checkRunName: 'CodeAgora Review',
    } as never);

    vi.mocked(mocks.determineActionPolicy).mockReturnValue({
      degraded: true,
      degradedReason: 'untrusted-fork-pr',
      shouldRunReview: false,
      shouldPostResults: false,
      verdictOverride: 'SKIPPED',
    } as never);

    vi.mocked(mocks.validateActionDiffPath).mockResolvedValue(diffFile);

    await import('../action.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.runPipeline).not.toHaveBeenCalled();
    expect(mocks.loadConfigFile).not.toHaveBeenCalled();
    expect(mocks.mapToGitHubReview).not.toHaveBeenCalled();
    expect(mocks.postReview).not.toHaveBeenCalled();
    expect(mocks.setCommitStatus).not.toHaveBeenCalled();
    expect(mocks.fetchPrMetadata).not.toHaveBeenCalled();
    expect(mocks.handleNeedsHuman).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.validateActionOutputPath).not.toHaveBeenCalled();

    const output = await readFile(outputFile, 'utf-8');
    expect(output).toContain(`head-sha=${eventHeadSha}`);
    expect(output).toContain('base-sha=base123');
    expect(output).toContain('degraded=true');
    expect(output).toContain('degraded-reason=untrusted-fork-pr');
    expect(output).toContain('verdict=SKIPPED');

    const summary = await readFile(summaryFile, 'utf-8');
    expect(summary).toContain('CodeAgora review skipped');
    expect(summary).toContain('Reason: `untrusted-fork-pr`');
    expect(summary).toContain('Step for untrusted-fork-pr');

    await rm(tempDir, { recursive: true, force: true });
  });

  it('records degraded output and summary when post-results is disabled', async () => {
    const { mkdtemp, readFile, rm, writeFile } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-runtime-'));
    const outputFile = path.join(tempDir, 'output.txt');
    const summaryFile = path.join(tempDir, 'summary.md');
    const diffFile = path.join(tempDir, 'diff.patch');
    const sarifFile = path.join(tempDir, 'results.sarif');
    const eventFile = path.join(tempDir, 'event.json');

    process.env.GITHUB_OUTPUT = outputFile;
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.GITHUB_EVENT_PATH = eventFile;
    await writeFile(eventFile, JSON.stringify({ pull_request: { head: { sha: eventHeadSha } } }));

    vi.mocked(mocks.parseActionInputs).mockReturnValue({
      repo: 'owner/repo',
      sha: inputSha,
      pr: 42,
      diff: diffFile,
      token: 'ghp_test',
      configPath: '.ca/config.json',
      baseSha: undefined,
      maxDiffLines: 0,
      failOnReject: false,
      postResults: false,
      reporterMode: 'check-run',
      checkRunName: 'CodeAgora Review',
    } as never);

    vi.mocked(mocks.determineActionPolicy).mockReturnValue({
      degraded: true,
      degradedReason: 'posting-disabled',
      shouldRunReview: true,
      shouldPostResults: false,
      verdictOverride: undefined,
    } as never);

    vi.mocked(mocks.validateActionDiffPath).mockResolvedValue(diffFile);
    vi.mocked(mocks.validateActionOutputPath).mockResolvedValue(sarifFile);
    vi.mocked(mocks.loadConfigFile).mockResolvedValue(null as never);
    vi.mocked(mocks.runPipeline).mockResolvedValue({
      status: 'success',
      summary: { decision: 'ACCEPT' },
      sessionId: 'session-001',
      date: '2026-06-08',
      evidenceDocs: [],
      discussions: [],
    } as never);
    vi.mocked(mocks.writeFile).mockResolvedValue(undefined);

    await import('../action.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.postReview).not.toHaveBeenCalled();
    expect(mocks.setCommitStatus).not.toHaveBeenCalled();
    expect(mocks.fetchPrMetadata).not.toHaveBeenCalled();
    expect(mocks.createAppOctokit).not.toHaveBeenCalled();
    expect(mocks.handleNeedsHuman).not.toHaveBeenCalled();

    const output = await readFile(outputFile, 'utf-8');
    expect(output).toContain(`head-sha=${eventHeadSha}`);
    expect(output).toContain('degraded=true');
    expect(output).toContain('degraded-reason=posting-disabled');
    expect(output).toContain('verdict=ACCEPT');
    expect(output).toContain('review-url=');
    expect(output).toContain('session-id=session-001');
    expect(output).toContain(`sarif-file=${sarifFile}`);

    const summary = await readFile(summaryFile, 'utf-8');
    expect(summary).toContain('CodeAgora review degraded');
    expect(summary).toContain('Reason: `posting-disabled`');
    expect(summary).toContain('Step for posting-disabled');

    await rm(tempDir, { recursive: true, force: true });
  });

  it('filters unverified findings before writing Action SARIF output', async () => {
    const { mkdtemp, readFile, rm, writeFile } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-runtime-'));
    const outputFile = path.join(tempDir, 'output.txt');
    const summaryFile = path.join(tempDir, 'summary.md');
    const diffFile = path.join(tempDir, 'diff.patch');
    const sarifFile = path.join(tempDir, 'results.sarif');
    const eventFile = path.join(tempDir, 'event.json');

    const lowConfidenceDoc = {
      issueTitle: 'low confidence',
      problem: 'may be wrong',
      evidence: ['weak evidence'],
      severity: 'CRITICAL',
      suggestion: 'check manually',
      filePath: 'src/app.ts',
      lineRange: [7, 7],
      confidence: 24,
    };
    const publishableDoc = {
      issueTitle: 'verified issue',
      problem: 'definite bug',
      evidence: ['strong evidence'],
      severity: 'CRITICAL',
      suggestion: 'fix it',
      filePath: 'src/app.ts',
      lineRange: [9, 9],
      confidence: 91,
    };

    process.env.GITHUB_OUTPUT = outputFile;
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.GITHUB_EVENT_PATH = eventFile;
    await writeFile(eventFile, JSON.stringify({ pull_request: { head: { sha: eventHeadSha } } }));

    vi.mocked(mocks.parseActionInputs).mockReturnValue({
      repo: 'owner/repo',
      sha: inputSha,
      pr: 42,
      diff: diffFile,
      token: 'ghp_test',
      configPath: '.ca/config.json',
      baseSha: undefined,
      maxDiffLines: 0,
      failOnReject: false,
      postResults: false,
      reporterMode: 'check-run',
      checkRunName: 'CodeAgora Review',
    } as never);

    vi.mocked(mocks.determineActionPolicy).mockReturnValue({
      degraded: true,
      degradedReason: 'posting-disabled',
      shouldRunReview: true,
      shouldPostResults: false,
      verdictOverride: undefined,
    } as never);

    vi.mocked(mocks.validateActionDiffPath).mockResolvedValue(diffFile);
    vi.mocked(mocks.validateActionOutputPath).mockResolvedValue(sarifFile);
    vi.mocked(mocks.loadConfigFile).mockResolvedValue(null as never);
    vi.mocked(mocks.runPipeline).mockResolvedValue({
      status: 'success',
      summary: { decision: 'NEEDS_HUMAN' },
      sessionId: 'session-001',
      date: '2026-06-08',
      evidenceDocs: [lowConfidenceDoc, publishableDoc],
      discussions: [],
    } as never);
    vi.mocked(mocks.filterSarifPublishableEvidenceDocs).mockReturnValue([publishableDoc]);
    vi.mocked(mocks.writeFile).mockResolvedValue(undefined);

    await import('../action.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.filterSarifPublishableEvidenceDocs).toHaveBeenCalledWith([lowConfidenceDoc, publishableDoc]);
    expect(mocks.buildSarifReport).toHaveBeenCalledWith([publishableDoc], 'session-001', '2026-06-08');
    expect(mocks.serializeSarif).toHaveBeenCalledWith({ runs: [] });
    expect(mocks.writeFile).toHaveBeenCalledWith(sarifFile, '{"runs":[]}');
    expect(await readFile(outputFile, 'utf-8')).toContain(`sarif-file=${sarifFile}`);

    await rm(tempDir, { recursive: true, force: true });
  });

  it('suppresses GitHub writes when the diff limit degrades the run', async () => {
    const { mkdtemp, readFile, rm, writeFile } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-runtime-'));
    const outputFile = path.join(tempDir, 'output.txt');
    const summaryFile = path.join(tempDir, 'summary.md');
    const diffFile = path.join(tempDir, 'diff.patch');
    const eventFile = path.join(tempDir, 'event.json');

    process.env.GITHUB_OUTPUT = outputFile;
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.OPENROUTER_API_KEY = 'provider-secret';
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.GITHUB_EVENT_PATH = eventFile;
    await writeFile(eventFile, JSON.stringify({ pull_request: { head: { sha: eventHeadSha } } }));

    vi.mocked(mocks.parseActionInputs).mockReturnValue({
      repo: 'owner/repo',
      sha: inputSha,
      pr: 42,
      diff: diffFile,
      token: 'ghp_test',
      configPath: '.ca/config.json',
      baseSha: 'base123',
      maxDiffLines: 1,
      failOnReject: false,
      postResults: true,
      reporterMode: 'commit-status',
      baseRepo: 'owner/repo',
      headRepo: 'owner/repo',
      checkRunName: 'CodeAgora Review',
    } as never);

    vi.mocked(mocks.determineActionPolicy).mockReturnValue({
      degraded: false,
      shouldRunReview: true,
      shouldPostResults: true,
      verdictOverride: undefined,
    } as never);

    vi.mocked(mocks.validateActionDiffPath).mockResolvedValue(diffFile);
    vi.mocked(mocks.readFile).mockResolvedValue('line 1\nline 2\nline 3');

    await import('../action.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.runPipeline).not.toHaveBeenCalled();
    expect(mocks.loadConfigFile).not.toHaveBeenCalled();
    expect(mocks.mapToGitHubReview).not.toHaveBeenCalled();
    expect(mocks.postReview).not.toHaveBeenCalled();
    expect(mocks.setCommitStatus).not.toHaveBeenCalled();
    expect(mocks.fetchPrMetadata).not.toHaveBeenCalled();
    expect(mocks.createAppOctokit).not.toHaveBeenCalled();
    expect(mocks.handleNeedsHuman).not.toHaveBeenCalled();
    expect(mocks.validateActionOutputPath).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();

    const output = await readFile(outputFile, 'utf-8');
    expect(output).toContain(`head-sha=${eventHeadSha}`);
    expect(output).toContain('base-sha=base123');
    expect(output).toContain('degraded=true');
    expect(output).toContain('degraded-reason=diff-too-large');
    expect(output).toContain('verdict=SKIPPED');
    expect(output).not.toContain('degraded-reason=github-post-failed');

    const summary = await readFile(summaryFile, 'utf-8');
    expect(summary).toContain('CodeAgora review skipped');
    expect(summary).toContain('Reason: `diff-too-large`');

    await rm(tempDir, { recursive: true, force: true });
  });

  it('suppresses review comments, commit statuses, and reviewer mutations after config-load degradation', async () => {
    const { mkdtemp, readFile, rm, writeFile } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-runtime-'));
    const outputFile = path.join(tempDir, 'output.txt');
    const summaryFile = path.join(tempDir, 'summary.md');
    const diffFile = path.join(tempDir, 'diff.patch');
    const sarifFile = path.join(tempDir, 'results.sarif');
    const eventFile = path.join(tempDir, 'event.json');

    process.env.GITHUB_OUTPUT = outputFile;
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.OPENROUTER_API_KEY = 'provider-secret';
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.GITHUB_EVENT_PATH = eventFile;
    await writeFile(eventFile, JSON.stringify({ pull_request: { head: { sha: eventHeadSha } } }));

    vi.mocked(mocks.parseActionInputs).mockReturnValue({
      repo: 'owner/repo',
      sha: inputSha,
      pr: 42,
      diff: diffFile,
      token: 'ghp_test',
      configPath: '.ca/config.json',
      baseSha: 'base123',
      maxDiffLines: 0,
      failOnReject: false,
      postResults: true,
      reporterMode: 'commit-status',
      baseRepo: 'owner/repo',
      headRepo: 'owner/repo',
      checkRunName: 'CodeAgora Review',
    } as never);

    vi.mocked(mocks.determineActionPolicy).mockReturnValue({
      degraded: false,
      shouldRunReview: true,
      shouldPostResults: true,
      verdictOverride: undefined,
    } as never);

    vi.mocked(mocks.validateActionDiffPath).mockResolvedValue(diffFile);
    vi.mocked(mocks.validateActionOutputPath).mockResolvedValue(sarifFile);
    vi.mocked(mocks.readFile).mockResolvedValue('diff --git a/src/app.ts b/src/app.ts\n+changed');
    vi.mocked(mocks.loadConfigFile).mockRejectedValue(new Error('invalid config'));
    vi.mocked(mocks.runPipeline).mockResolvedValue({
      status: 'success',
      summary: {
        decision: 'NEEDS_HUMAN',
        reasoning: 'manual review required',
        totalReviewers: 3,
        forfeitedReviewers: 0,
        severityCounts: { WARNING: 1 },
        topIssues: [],
        totalDiscussions: 1,
        resolved: 0,
        escalated: 1,
      },
      sessionId: 'session-003',
      date: '2026-06-08',
      evidenceDocs: [{ issueTitle: 'manual check', filePath: 'src/app.ts', lineRange: [7, 7], severity: 'WARNING' }],
      discussions: [],
    } as never);
    vi.mocked(mocks.mapToGitHubReview).mockReturnValue({
      commit_id: eventHeadSha,
      event: 'COMMENT',
      verdict: 'NEEDS_HUMAN',
      body: 'NEEDS HUMAN REVIEW',
      comments: [{ path: 'src/app.ts', position: 7, side: 'RIGHT', body: 'manual check' }],
    } as never);
    vi.mocked(mocks.writeFile).mockResolvedValue(undefined);

    await import('../action.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.runPipeline).toHaveBeenCalledWith(expect.objectContaining({
      diffPath: diffFile,
      repoPath: process.cwd(),
      configPath: undefined,
    }));
    expect(mocks.mapToGitHubReview).toHaveBeenCalled();
    expect(mocks.postReview).not.toHaveBeenCalled();
    expect(mocks.setCommitStatus).not.toHaveBeenCalled();
    expect(mocks.fetchPrMetadata).not.toHaveBeenCalled();
    expect(mocks.createAppOctokit).not.toHaveBeenCalled();
    expect(mocks.handleNeedsHuman).not.toHaveBeenCalled();

    const output = await readFile(outputFile, 'utf-8');
    expect(output).toContain(`head-sha=${eventHeadSha}`);
    expect(output).toContain('base-sha=base123');
    expect(output).toContain('degraded=true');
    expect(output).toContain('degraded-reason=config-load-failed');
    expect(output).toContain('verdict=NEEDS_HUMAN');
    expect(output).toContain('review-url=');
    expect(output).toContain('session-id=session-003');
    expect(output).toContain(`sarif-file=${sarifFile}`);
    expect(output).not.toContain('degraded-reason=github-post-failed');

    const summary = await readFile(summaryFile, 'utf-8');
    expect(summary).toContain('CodeAgora review degraded');
    expect(summary).toContain('Reason: `config-load-failed`');
    expect(summary).not.toContain('posting-disabled');

    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes the mapped public review verdict to Action outputs when it differs from the raw head decision', async () => {
    const { mkdtemp, readFile, rm, writeFile } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-runtime-'));
    const outputFile = path.join(tempDir, 'output.txt');
    const diffFile = path.join(tempDir, 'diff.patch');
    const sarifFile = path.join(tempDir, 'results.sarif');
    const eventFile = path.join(tempDir, 'event.json');

    process.env.GITHUB_OUTPUT = outputFile;
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.OPENROUTER_API_KEY = 'provider-secret';
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.GITHUB_EVENT_PATH = eventFile;
    await writeFile(eventFile, JSON.stringify({ pull_request: { head: { sha: eventHeadSha } } }));

    vi.mocked(mocks.parseActionInputs).mockReturnValue({
      repo: 'owner/repo',
      sha: inputSha,
      pr: 42,
      diff: diffFile,
      token: 'ghp_test',
      configPath: '.ca/config.json',
      baseSha: 'base123',
      maxDiffLines: 0,
      failOnReject: false,
      postResults: false,
      reporterMode: 'review-comment',
      baseRepo: 'owner/repo',
      headRepo: 'owner/repo',
      checkRunName: 'CodeAgora Review',
    } as never);
    vi.mocked(mocks.determineActionPolicy).mockReturnValue({
      degraded: false,
      shouldRunReview: true,
      shouldPostResults: false,
      verdictOverride: undefined,
    } as never);
    vi.mocked(mocks.determineActionPolicy).mockReturnValue({
      degraded: false,
      shouldRunReview: true,
      shouldPostResults: false,
      degradedReason: 'posting-disabled',
      verdictOverride: undefined,
    } as never);
    vi.mocked(mocks.validateActionDiffPath).mockResolvedValue(diffFile);
    vi.mocked(mocks.validateActionOutputPath).mockResolvedValue(sarifFile);
    vi.mocked(mocks.readFile).mockResolvedValue('diff --git a/src/app.ts b/src/app.ts\n+changed');
    vi.mocked(mocks.loadConfigFile).mockResolvedValue({ github: {} } as never);
    vi.mocked(mocks.runPipeline).mockResolvedValue({
      status: 'success',
      summary: {
        decision: 'REJECT',
        reasoning: 'raw verdict rejected',
        totalReviewers: 3,
        forfeitedReviewers: 0,
        severityCounts: { CRITICAL: 1 },
        topIssues: [],
        totalDiscussions: 0,
        resolved: 0,
        escalated: 0,
      },
      sessionId: 'session-public',
      date: '2026-06-08',
      evidenceDocs: [],
      discussions: [],
    } as never);
    vi.mocked(mocks.mapToGitHubReview).mockReturnValue({
      commit_id: eventHeadSha,
      event: 'APPROVE',
      verdict: 'ACCEPT',
      body: 'Decision: ACCEPT',
      comments: [],
    } as never);
    vi.mocked(mocks.writeFile).mockResolvedValue(undefined);

    await import('../action.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.mapToGitHubReview).toHaveBeenCalled();
    expect(mocks.postReview).not.toHaveBeenCalled();

    const output = await readFile(outputFile, 'utf-8');
    expect(output).toContain('verdict=ACCEPT');
    expect(output).not.toContain('verdict=REJECT');
    expect(output).toContain('session-id=session-public');
    expect(output).toContain(`sarif-file=${sarifFile}`);

    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes structured NEEDS_HUMAN Action output without parsing review body copy', async () => {
    const { mkdtemp, readFile, rm, writeFile } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-runtime-'));
    const outputFile = path.join(tempDir, 'output.txt');
    const summaryFile = path.join(tempDir, 'summary.md');
    const diffFile = path.join(tempDir, 'diff.patch');
    const sarifFile = path.join(tempDir, 'results.sarif');
    const eventFile = path.join(tempDir, 'event.json');

    process.env.GITHUB_OUTPUT = outputFile;
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.GITHUB_EVENT_PATH = eventFile;
    await writeFile(eventFile, JSON.stringify({ pull_request: { head: { sha: eventHeadSha } } }));

    vi.mocked(mocks.parseActionInputs).mockReturnValue({
      token: '',
      repo: 'owner/repo',
      pr: 7,
      diff: 'changes.diff',
      configPath: '.ca/config.json',
      postResults: false,
      failOnReject: true,
      baseSha: inputSha,
      maxDiffLines: 0,
      reporterMode: 'check-run',
      checkRunName: 'CodeAgora Review',
      baseRepo: 'owner/repo',
      headRepo: 'owner/repo',
      verdictOverride: undefined,
    } as never);
    vi.mocked(mocks.determineActionPolicy).mockReturnValue({
      degraded: false,
      shouldRunReview: true,
      shouldPostResults: false,
      degradedReason: 'posting-disabled',
      verdictOverride: undefined,
    } as never);
    vi.mocked(mocks.validateActionDiffPath).mockResolvedValue(diffFile);
    vi.mocked(mocks.validateActionOutputPath).mockResolvedValue(sarifFile);
    vi.mocked(mocks.readFile).mockResolvedValue('diff --git a/src/app.ts b/src/app.ts\n+changed');
    vi.mocked(mocks.loadConfigFile).mockResolvedValue({ github: {} } as never);
    vi.mocked(mocks.runPipeline).mockResolvedValue({
      status: 'success',
      summary: {
        decision: 'NEEDS_HUMAN',
        reasoning: 'raw verdict needs human',
        totalReviewers: 3,
        forfeitedReviewers: 0,
        severityCounts: { CRITICAL: 1 },
        topIssues: [],
        totalDiscussions: 1,
        resolved: 0,
        escalated: 1,
      },
      sessionId: 'session-human',
      date: '2026-06-08',
      evidenceDocs: [],
      discussions: [],
    } as never);
    vi.mocked(mocks.mapToGitHubReview).mockReturnValue({
      commit_id: eventHeadSha,
      event: 'COMMENT',
      verdict: 'NEEDS_HUMAN',
      body: 'Manual maintainer decision required.',
      comments: [],
    } as never);
    vi.mocked(mocks.writeFile).mockResolvedValue(undefined);

    await import('../action.js');
    await new Promise((resolve) => setImmediate(resolve));

    const output = await readFile(outputFile, 'utf-8');
    expect(output).toContain('verdict=NEEDS_HUMAN');
    expect(output).not.toContain('verdict=ACCEPT');

    await rm(tempDir, { recursive: true, force: true });
  });

  it('marks provider runtime failures degraded instead of failing the Action job', async () => {
    const { mkdtemp, readFile, rm, writeFile } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-runtime-'));
    const outputFile = path.join(tempDir, 'output.txt');
    const summaryFile = path.join(tempDir, 'summary.md');
    const diffFile = path.join(tempDir, 'diff.patch');
    const eventFile = path.join(tempDir, 'event.json');

    process.env.GITHUB_OUTPUT = outputFile;
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.OPENROUTER_API_KEY = 'provider-secret';
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.GITHUB_EVENT_PATH = eventFile;
    await writeFile(eventFile, JSON.stringify({ pull_request: { head: { sha: eventHeadSha } } }));

    vi.mocked(mocks.parseActionInputs).mockReturnValue({
      repo: 'owner/repo',
      sha: inputSha,
      pr: 42,
      diff: diffFile,
      token: 'ghp_test',
      configPath: '.ca/config.json',
      baseSha: 'base123',
      maxDiffLines: 0,
      failOnReject: true,
      postResults: true,
      reporterMode: 'check-run',
      baseRepo: 'owner/repo',
      headRepo: 'owner/repo',
      checkRunName: 'CodeAgora Review',
    } as never);

    vi.mocked(mocks.determineActionPolicy).mockReturnValue({
      degraded: false,
      shouldRunReview: true,
      shouldPostResults: true,
      verdictOverride: undefined,
    } as never);

    vi.mocked(mocks.validateActionDiffPath).mockResolvedValue(diffFile);
    vi.mocked(mocks.loadConfigFile).mockResolvedValue({ github: {} } as never);
    vi.mocked(mocks.runPipeline).mockResolvedValue({
      status: 'error',
      sessionId: '001',
      date: '2026-06-13',
      error: [
        'All reviewers failed (forfeited or errored) due to provider/API failures.',
        '- r-gpt5 (openrouter/openai/gpt-5.3-codex): auth: Auth error (permanent): Key limit exceeded (weekly limit).',
        'Recovery hint: check provider API keys, quota/rate limits, network connectivity, and circuit breaker status with `agora doctor --live`.',
      ].join('\n'),
    } as never);

    await import('../action.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.mapToGitHubReview).not.toHaveBeenCalled();
    expect(mocks.postReview).not.toHaveBeenCalled();
    expect(mocks.setCommitStatus).not.toHaveBeenCalled();
    expect(mocks.fetchPrMetadata).not.toHaveBeenCalled();
    expect(mocks.createAppOctokit).not.toHaveBeenCalled();
    expect(mocks.handleNeedsHuman).not.toHaveBeenCalled();
    expect(mocks.validateActionOutputPath).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();

    const output = await readFile(outputFile, 'utf-8');
    expect(output).toContain(`head-sha=${eventHeadSha}`);
    expect(output).toContain('base-sha=base123');
    expect(output).toContain('degraded=true');
    expect(output).toContain('degraded-reason=provider-runtime-failed');
    expect(output).toContain('verdict=DEGRADED');
    expect(output).toContain('review-url=');
    expect(output).toContain('session-id=001');

    const summary = await readFile(summaryFile, 'utf-8');
    expect(summary).toContain('CodeAgora review degraded');
    expect(summary).toContain('Reason: `provider-runtime-failed`');
    expect(summary).toContain('Key limit exceeded');
    expect(summary).toContain('agora doctor --live');

    await rm(tempDir, { recursive: true, force: true });
  });

  it('blocks privileged GitHub comments, reporters, and mutations when the write context is not trusted', async () => {
    const { mkdtemp, readFile, rm, writeFile } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-runtime-'));
    const outputFile = path.join(tempDir, 'output.txt');
    const summaryFile = path.join(tempDir, 'summary.md');
    const diffFile = path.join(tempDir, 'diff.patch');
    const sarifFile = path.join(tempDir, 'results.sarif');
    const eventFile = path.join(tempDir, 'event.json');

    process.env.GITHUB_OUTPUT = outputFile;
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.OPENROUTER_API_KEY = 'provider-secret';
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.GITHUB_EVENT_PATH = eventFile;
    await writeFile(eventFile, JSON.stringify({ pull_request: { head: { sha: eventHeadSha } } }));

    vi.mocked(mocks.parseActionInputs).mockReturnValue({
      repo: 'owner/repo',
      sha: inputSha,
      pr: 42,
      diff: diffFile,
      token: 'ghp_test',
      configPath: '.ca/config.json',
      baseSha: 'base123',
      maxDiffLines: 0,
      failOnReject: false,
      postResults: true,
      reporterMode: 'commit-status',
      baseRepo: 'owner/repo',
      headRepo: 'owner/repo',
      checkRunName: 'CodeAgora Review',
    } as never);

    vi.mocked(mocks.determineActionPolicy).mockReturnValue({
      degraded: false,
      shouldRunReview: true,
      shouldPostResults: true,
      verdictOverride: undefined,
    } as never);
    vi.mocked(mocks.evaluatePrivilegedGitHubOperation).mockImplementation((operation: string) => ({
      allowed: operation !== 'review-comment',
      operation,
      degradedReason: operation === 'review-comment' ? 'untrusted-github-context' : undefined,
      message: operation === 'review-comment' ? 'Blocked privileged GitHub review-comment because PR context is untrusted.' : undefined,
    }) as never);

    vi.mocked(mocks.validateActionDiffPath).mockResolvedValue(diffFile);
    vi.mocked(mocks.validateActionOutputPath).mockResolvedValue(sarifFile);
    vi.mocked(mocks.readFile).mockResolvedValue('diff --git a/src/app.ts b/src/app.ts\n+changed');
    vi.mocked(mocks.loadConfigFile).mockResolvedValue({ github: { sarifOutputPath: sarifFile } } as never);
    vi.mocked(mocks.runPipeline).mockResolvedValue({
      status: 'success',
      summary: {
        decision: 'NEEDS_HUMAN',
        reasoning: 'manual review required',
        totalReviewers: 3,
        forfeitedReviewers: 0,
        severityCounts: { WARNING: 1 },
        topIssues: [],
        totalDiscussions: 1,
        resolved: 0,
        escalated: 1,
      },
      sessionId: 'session-004',
      date: '2026-06-08',
      evidenceDocs: [{ issueTitle: 'manual check', filePath: 'src/app.ts', lineRange: [7, 7], severity: 'WARNING' }],
      discussions: [],
    } as never);
    vi.mocked(mocks.mapToGitHubReview).mockReturnValue({
      commit_id: eventHeadSha,
      event: 'COMMENT',
      verdict: 'NEEDS_HUMAN',
      body: 'NEEDS HUMAN REVIEW',
      comments: [{ path: 'src/app.ts', position: 7, side: 'RIGHT', body: 'manual check' }],
    } as never);
    vi.mocked(mocks.writeFile).mockResolvedValue(undefined);

    await import('../action.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.evaluatePrivilegedGitHubOperation).toHaveBeenCalledWith('review-comment', expect.objectContaining({
      token: 'ghp_test',
      baseRepo: 'owner/repo',
      headRepo: 'owner/repo',
      repository: 'owner/repo',
    }));
    expect(mocks.createAppOctokit).not.toHaveBeenCalled();
    expect(mocks.fetchPrMetadata).not.toHaveBeenCalled();
    expect(mocks.postReview).not.toHaveBeenCalled();
    expect(mocks.setCommitStatus).not.toHaveBeenCalled();
    expect(mocks.handleNeedsHuman).not.toHaveBeenCalled();

    const output = await readFile(outputFile, 'utf-8');
    expect(output).toContain('degraded=true');
    expect(output).toContain('degraded-reason=untrusted-github-context');
    expect(output).toContain('verdict=NEEDS_HUMAN');
    expect(output).toContain('review-url=');
    expect(output).toContain('session-id=session-004');

    const summary = await readFile(summaryFile, 'utf-8');
    expect(summary).toContain('CodeAgora review degraded');
    expect(summary).toContain('Reason: `untrusted-github-context`');
    expect(summary).toContain('Blocked privileged GitHub review-comment');

    await rm(tempDir, { recursive: true, force: true });
  });

  it('posts the configured PR-facing review when post-results is enabled', async () => {
    const { mkdtemp, readFile, rm, writeFile } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-runtime-'));
    const outputFile = path.join(tempDir, 'output.txt');
    const diffFile = path.join(tempDir, 'diff.patch');
    const sarifFile = path.join(tempDir, 'results.sarif');
    const eventFile = path.join(tempDir, 'event.json');
    const reviewUrl = 'https://github.com/owner/repo/pull/42#pullrequestreview-99';
    const appKit = {
      auth: 'app',
      checks: {
        listForRef: vi.fn().mockResolvedValue({ data: { check_runs: [] } }),
        create: vi.fn().mockResolvedValue({
          data: { id: 123, html_url: 'https://github.com/owner/repo/runs/123' },
        }),
        update: vi.fn(),
      },
    };
    const mappedReview = {
      commit_id: 'head123',
      event: 'REQUEST_CHANGES',
      verdict: 'REJECT',
      body: 'configured PR-facing review',
      comments: [
        { path: 'src/app.ts', position: 7, side: 'RIGHT', body: 'configured inline result' },
      ],
    } as const;

    process.env.GITHUB_OUTPUT = outputFile;
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.GITHUB_EVENT_PATH = eventFile;
    await writeFile(eventFile, JSON.stringify({ pull_request: { head: { sha: eventHeadSha } } }));

    vi.mocked(mocks.parseActionInputs).mockReturnValue({
      repo: 'owner/repo',
      sha: inputSha,
      pr: 42,
      diff: diffFile,
      token: 'ghp_test',
      configPath: '.ca/config.json',
      baseSha: 'base123',
      maxDiffLines: 0,
      failOnReject: false,
      postResults: true,
      reporterMode: 'check-run',
      baseRepo: 'owner/repo',
      headRepo: 'owner/repo',
      checkRunName: 'CodeAgora Security Review',
    } as never);

    vi.mocked(mocks.determineActionPolicy).mockReturnValue({
      degraded: false,
      shouldRunReview: true,
      shouldPostResults: true,
      verdictOverride: undefined,
    } as never);

    vi.mocked(mocks.validateActionDiffPath).mockResolvedValue(diffFile);
    vi.mocked(mocks.validateActionOutputPath).mockResolvedValue(sarifFile);
    vi.mocked(mocks.readFile).mockResolvedValue('diff --git a/src/app.ts b/src/app.ts\n+changed');
    vi.mocked(mocks.loadConfigFile).mockResolvedValue({
      github: {
        postSuggestions: true,
        collapseDiscussions: false,
        minConfidence: 0.72,
        humanReviewers: ['alice'],
        humanTeams: ['platform'],
        needsHumanLabel: 'needs-human-review',
        sarifOutputPath: sarifFile,
      },
    } as never);
    vi.mocked(mocks.runPipeline).mockResolvedValue({
      status: 'success',
      summary: {
        decision: 'REJECT',
        reasoning: 'blocking issue',
        totalReviewers: 3,
        forfeitedReviewers: 0,
        severityCounts: { CRITICAL: 1 },
        topIssues: [],
        totalDiscussions: 1,
        resolved: 0,
        escalated: 1,
      },
      sessionId: 'session-001',
      date: '2026-06-08',
      evidenceDocs: [{ issueTitle: 'unsafe path', filePath: 'src/app.ts', lineRange: [7, 7], severity: 'CRITICAL' }],
      discussions: [],
      reviewerMap: { 'src/app.ts:7': ['reviewer-1'] },
      reviewerOpinions: { 'src/app.ts:7': [] },
      devilsAdvocateId: 'devil',
      supporterModelMap: { supporter: 'model-a' },
      reviewRun: { roles: [] },
      reviewQueues: {
        suggestions: [],
        unconfirmed: [],
        suppressed: [],
        hallucinationRemoved: [],
        hallucinationUncertain: [],
      },
    } as never);
    vi.mocked(mocks.createAppOctokit).mockResolvedValue(appKit as never);
    vi.mocked(mocks.fetchPrMetadata).mockResolvedValue({ headSha: eventHeadSha } as never);
    vi.mocked(mocks.isStaleHead).mockReturnValue(false);
    vi.mocked(mocks.mapToGitHubReview).mockReturnValue(mappedReview as never);
    vi.mocked(mocks.postReview).mockResolvedValue({ reviewId: 99, reviewUrl, verdict: 'REJECT' } as never);
    vi.mocked(mocks.setCommitStatus).mockResolvedValue(undefined);
    vi.mocked(mocks.writeFile).mockResolvedValue(undefined);

    await import('../action.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.mapToGitHubReview).toHaveBeenCalledWith(expect.objectContaining({
      headSha: eventHeadSha,
      sessionId: 'session-001',
      sessionDate: '2026-06-08',
      options: {
        postSuggestions: true,
        collapseDiscussions: false,
      },
      minConfidence: 0.72,
      devilsAdvocateId: 'devil',
    }));
    expect(mocks.fetchPrMetadata).toHaveBeenCalledWith(
      { token: 'ghp_test', owner: 'owner', repo: 'repo' },
      42,
      appKit,
    );
    expect(mocks.postReview).toHaveBeenCalledWith(
      { token: 'ghp_test', owner: 'owner', repo: 'repo' },
      42,
      mappedReview,
      appKit,
    );
    expect(mocks.setCommitStatus).not.toHaveBeenCalled();
    expect(appKit.checks.listForRef).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'owner',
      repo: 'repo',
      ref: eventHeadSha,
      check_name: 'CodeAgora Security Review',
    }));
    expect(appKit.checks.create).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'owner',
      repo: 'repo',
      name: 'CodeAgora Security Review',
      head_sha: eventHeadSha,
      conclusion: 'failure',
      details_url: reviewUrl,
    }));

    const output = await readFile(outputFile, 'utf-8');
    expect(output).toContain('degraded=false');
    expect(output).toContain(`review-url=${reviewUrl}`);
    expect(output).toContain('verdict=REJECT');
    expect(output).toContain('session-id=session-001');
    expect(output).toContain(`sarif-file=${sarifFile}`);

    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes DEGRADED verdict when GitHub review posting fails after the public decision is mapped', async () => {
    const { mkdtemp, readFile, rm, writeFile } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-runtime-'));
    const outputFile = path.join(tempDir, 'output.txt');
    const summaryFile = path.join(tempDir, 'summary.md');
    const diffFile = path.join(tempDir, 'diff.patch');
    const sarifFile = path.join(tempDir, 'results.sarif');
    const eventFile = path.join(tempDir, 'event.json');

    process.env.GITHUB_OUTPUT = outputFile;
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.GITHUB_EVENT_PATH = eventFile;
    await writeFile(eventFile, JSON.stringify({ pull_request: { head: { sha: eventHeadSha } } }));

    vi.mocked(mocks.parseActionInputs).mockReturnValue({
      repo: 'owner/repo',
      sha: inputSha,
      pr: 42,
      diff: diffFile,
      token: 'ghp_test',
      configPath: '.ca/config.json',
      baseSha: 'base123',
      maxDiffLines: 0,
      failOnReject: true,
      postResults: true,
      reporterMode: 'check-run',
      baseRepo: 'owner/repo',
      headRepo: 'owner/repo',
      checkRunName: 'CodeAgora Review',
    } as never);
    vi.mocked(mocks.determineActionPolicy).mockReturnValue({
      degraded: false,
      shouldRunReview: true,
      shouldPostResults: true,
      verdictOverride: undefined,
    } as never);
    vi.mocked(mocks.validateActionDiffPath).mockResolvedValue(diffFile);
    vi.mocked(mocks.validateActionOutputPath).mockResolvedValue(sarifFile);
    vi.mocked(mocks.readFile).mockResolvedValue('diff --git a/src/app.ts b/src/app.ts\n+changed');
    vi.mocked(mocks.loadConfigFile).mockResolvedValue({ github: { sarifOutputPath: sarifFile } } as never);
    vi.mocked(mocks.runPipeline).mockResolvedValue({
      status: 'success',
      summary: {
        decision: 'REJECT',
        reasoning: 'blocking issue',
        totalReviewers: 3,
        forfeitedReviewers: 0,
        severityCounts: { CRITICAL: 1 },
        topIssues: [],
        totalDiscussions: 0,
        resolved: 0,
        escalated: 0,
      },
      sessionId: 'session-post-failed',
      date: '2026-06-08',
      evidenceDocs: [],
      discussions: [],
    } as never);
    vi.mocked(mocks.createAppOctokit).mockResolvedValue(undefined);
    vi.mocked(mocks.fetchPrMetadata).mockResolvedValue({ headSha: eventHeadSha } as never);
    vi.mocked(mocks.isStaleHead).mockReturnValue(false);
    vi.mocked(mocks.mapToGitHubReview).mockReturnValue({
      commit_id: eventHeadSha,
      event: 'REQUEST_CHANGES',
      verdict: 'REJECT',
      body: 'configured PR-facing review',
      comments: [],
    } as never);
    vi.mocked(mocks.postReview).mockRejectedValue(new Error('GitHub createReview failed'));
    vi.mocked(mocks.writeFile).mockResolvedValue(undefined);

    await import('../action.js');
    await new Promise((resolve) => setImmediate(resolve));

    const output = await readFile(outputFile, 'utf-8');
    expect(output).toContain('degraded=true');
    expect(output).toContain('degraded-reason=github-post-failed');
    expect(output).toContain('verdict=DEGRADED');
    expect(output).toContain('review-url=');
    expect(output).toContain('session-id=session-post-failed');
    expect(mocks.postReview).toHaveBeenCalled();

    await rm(tempDir, { recursive: true, force: true });
  });

  it('posts only the commit-status reporter when configured', async () => {
    const { mkdtemp, readFile, rm, writeFile } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-runtime-'));
    const outputFile = path.join(tempDir, 'output.txt');
    const diffFile = path.join(tempDir, 'diff.patch');
    const sarifFile = path.join(tempDir, 'results.sarif');
    const eventFile = path.join(tempDir, 'event.json');
    const reviewUrl = 'https://github.com/owner/repo/pull/42#pullrequestreview-100';
    const appKit = {
      auth: 'app',
      checks: {
        listForRef: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    const mappedReview = {
      commit_id: 'head123',
      event: 'COMMENT',
      verdict: 'ACCEPT',
      body: 'configured PR-facing review',
      comments: [],
    } as const;

    process.env.GITHUB_OUTPUT = outputFile;
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.GITHUB_EVENT_PATH = eventFile;
    await writeFile(eventFile, JSON.stringify({ pull_request: { head: { sha: eventHeadSha } } }));

    vi.mocked(mocks.parseActionInputs).mockReturnValue({
      repo: 'owner/repo',
      sha: inputSha,
      pr: 42,
      diff: diffFile,
      token: 'ghp_test',
      configPath: '.ca/config.json',
      baseSha: 'base123',
      maxDiffLines: 0,
      failOnReject: false,
      postResults: true,
      reporterMode: 'commit-status',
      baseRepo: 'owner/repo',
      headRepo: 'owner/repo',
      checkRunName: 'CodeAgora Security Review',
    } as never);

    vi.mocked(mocks.determineActionPolicy).mockReturnValue({
      degraded: false,
      shouldRunReview: true,
      shouldPostResults: true,
      verdictOverride: undefined,
    } as never);

    vi.mocked(mocks.validateActionDiffPath).mockResolvedValue(diffFile);
    vi.mocked(mocks.validateActionOutputPath).mockResolvedValue(sarifFile);
    vi.mocked(mocks.readFile).mockResolvedValue('diff --git a/src/app.ts b/src/app.ts\n+changed');
    vi.mocked(mocks.loadConfigFile).mockResolvedValue({ github: { sarifOutputPath: sarifFile } } as never);
    vi.mocked(mocks.runPipeline).mockResolvedValue({
      status: 'success',
      summary: {
        decision: 'ACCEPT',
        reasoning: 'accepted',
        totalReviewers: 3,
        forfeitedReviewers: 0,
        severityCounts: {},
        topIssues: [],
        totalDiscussions: 0,
        resolved: 0,
        escalated: 0,
      },
      sessionId: 'session-002',
      date: '2026-06-08',
      evidenceDocs: [],
      discussions: [],
    } as never);
    vi.mocked(mocks.createAppOctokit).mockResolvedValue(appKit as never);
    vi.mocked(mocks.fetchPrMetadata).mockResolvedValue({ headSha: eventHeadSha } as never);
    vi.mocked(mocks.isStaleHead).mockReturnValue(false);
    vi.mocked(mocks.mapToGitHubReview).mockReturnValue(mappedReview as never);
    vi.mocked(mocks.postReview).mockResolvedValue({ reviewId: 100, reviewUrl, verdict: 'ACCEPT' } as never);
    vi.mocked(mocks.setCommitStatus).mockResolvedValue(undefined);
    vi.mocked(mocks.writeFile).mockResolvedValue(undefined);

    await import('../action.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.postReview).toHaveBeenCalledWith(
      { token: 'ghp_test', owner: 'owner', repo: 'repo' },
      42,
      mappedReview,
      appKit,
    );
    expect(mocks.setCommitStatus).toHaveBeenCalledWith(
      { token: 'ghp_test', owner: 'owner', repo: 'repo' },
      eventHeadSha,
      'ACCEPT',
      reviewUrl,
      appKit,
    );
    expect(appKit.checks.listForRef).not.toHaveBeenCalled();
    expect(appKit.checks.create).not.toHaveBeenCalled();
    expect(appKit.checks.update).not.toHaveBeenCalled();

    const output = await readFile(outputFile, 'utf-8');
    expect(output).toContain('degraded=false');
    expect(output).toContain(`review-url=${reviewUrl}`);
    expect(output).toContain('verdict=ACCEPT');
    expect(output).toContain('session-id=session-002');
    expect(output).toContain(`sarif-file=${sarifFile}`);

    await rm(tempDir, { recursive: true, force: true });
  });
});
