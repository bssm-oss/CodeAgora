import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildSarifReport: vi.fn(() => ({ runs: [] })),
  createAppOctokit: vi.fn(),
  determineActionPolicy: vi.fn(),
  fetchPrMetadata: vi.fn(),
  getActionGuidance: vi.fn((reason: string) => ({
    why: `Why ${reason}`,
    nextSteps: [`Step for ${reason}`],
  })),
  isStaleHead: vi.fn(),
  loadConfigFile: vi.fn(),
  mapToGitHubReview: vi.fn(() => ({ comments: [], body: 'review' })),
  parseActionInputs: vi.fn(),
  postReview: vi.fn(),
  runPipeline: vi.fn(),
  setCommitStatus: vi.fn(),
  serializeSarif: vi.fn(() => '{"runs":[]}' ),
  writeFile: vi.fn(),
  validateActionDiffPath: vi.fn(),
  validateActionOutputPath: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: mocks.writeFile,
  },
  readFile: vi.fn(),
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
  handleNeedsHuman: vi.fn(),
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
  serializeSarif: mocks.serializeSarif,
}));

describe('GitHub Action runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`unexpected process.exit(${code ?? 'undefined'})`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_OUTPUT;
    delete process.env.GITHUB_STEP_SUMMARY;
    delete process.env.GITHUB_TOKEN;
  });

  it('records degraded output and summary when post-results is disabled', async () => {
    const { mkdtemp, readFile, rm } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-runtime-'));
    const outputFile = path.join(tempDir, 'output.txt');
    const summaryFile = path.join(tempDir, 'summary.md');
    const diffFile = path.join(tempDir, 'diff.patch');
    const sarifFile = path.join(tempDir, 'results.sarif');

    process.env.GITHUB_OUTPUT = outputFile;
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
    process.env.GITHUB_TOKEN = 'ghp_test';

    vi.mocked(mocks.parseActionInputs).mockReturnValue({
      repo: 'owner/repo',
      sha: 'abc123',
      pr: 42,
      diff: diffFile,
      token: 'ghp_test',
      configPath: '.ca/config.json',
      baseSha: undefined,
      maxDiffLines: 0,
      failOnReject: false,
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
    expect(mocks.createAppOctokit).toHaveBeenCalledTimes(1);

    const output = await readFile(outputFile, 'utf-8');
    expect(output).toContain('degraded=true');
    expect(output).toContain('degraded-reason=posting-disabled');
    expect(output).toContain('verdict=ACCEPT');

    const summary = await readFile(summaryFile, 'utf-8');
    expect(summary).toContain('CodeAgora review degraded');
    expect(summary).toContain('Reason: `posting-disabled`');
    expect(summary).toContain('Step for posting-disabled');

    await rm(tempDir, { recursive: true, force: true });
  });
});
