import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../config/loader.js', () => ({
  isDeclarativeReviewers: vi.fn(() => false),
  loadConfig: vi.fn(),
  loadConfigFile: vi.fn(),
  normalizeConfig: vi.fn(),
}));

vi.mock('../pipeline/stage-executors.js', () => ({
  executeL1Reviews: vi.fn(),
  executeL2Discussions: vi.fn(),
  executeL3Verdict: vi.fn(),
  recordTelemetry: vi.fn(),
}));

import { loadConfig, normalizeConfig } from '../config/loader.js';
import { runPipeline } from '../pipeline/orchestrator.js';
import { executeL1Reviews } from '../pipeline/stage-executors.js';

const config = {
  reviewers: [
    { id: 'r1', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
  ],
  supporters: {
    pool: [],
    pickCount: 1,
    pickStrategy: 'random',
    devilsAdvocate: { id: 'da', backend: 'codex', model: 'test', enabled: false, timeout: 120 },
    personaPool: [],
    personaAssignment: 'random',
  },
  moderator: { backend: 'codex', model: 'test', timeout: 120 },
  discussion: {
    enabled: true,
    maxRounds: 1,
    codeSnippetRange: 5,
    registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
  },
  errorHandling: { maxRetries: 0, forfeitThreshold: 1 },
  chunking: { maxTokens: 8000 },
};

describe('pipeline timeout session artifacts', () => {
  let tmpRoot: string;
  let caRoot: string;
  let diffPath: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-pipeline-timeout-'));
    caRoot = path.join(tmpRoot, '.ca');
    diffPath = path.join(tmpRoot, 'change.diff');
    await fs.writeFile(
      diffPath,
      [
        'diff --git a/src/app.ts b/src/app.ts',
        'index 1111111..2222222 100644',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -1 +1 @@',
        '-export const value = 1;',
        '+export const value = 2;',
        '',
      ].join('\n'),
      'utf-8',
    );
    (loadConfig as Mock).mockResolvedValue(config);
    (normalizeConfig as Mock).mockReturnValue(config);
    (executeL1Reviews as Mock).mockImplementation(() => new Promise(() => {}));
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('returns the created session id and persists a failed result on pipeline timeout', async () => {
    const result = await runPipeline({ diffPath, timeoutMs: 100, noCache: true, caRoot });

    expect(result).toMatchObject({
      status: 'error',
      sessionId: '001',
      error: 'Pipeline timed out after 1s',
    });
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const sessionDir = path.join(caRoot, 'sessions', result.date, result.sessionId);
    const metadata = JSON.parse(await fs.readFile(path.join(sessionDir, 'metadata.json'), 'utf-8')) as {
      status: string;
      completedAt?: number;
    };
    const persisted = JSON.parse(await fs.readFile(path.join(sessionDir, 'result.json'), 'utf-8')) as {
      status: string;
      sessionId: string;
      date: string;
      error: string;
    };

    expect(metadata.status).toBe('failed');
    expect(metadata.completedAt).toEqual(expect.any(Number));
    expect(persisted).toMatchObject({
      status: 'error',
      sessionId: result.sessionId,
      date: result.date,
      error: result.error,
    });
  });

  it('aborts the L1 execution signal when the pipeline timeout fires', async () => {
    let observedSignal: AbortSignal | undefined;
    (executeL1Reviews as Mock).mockImplementationOnce((...args: unknown[]) => {
      observedSignal = args[7] as AbortSignal | undefined;
      return new Promise((resolve) => {
        observedSignal?.addEventListener('abort', () => {
          resolve({ allReviewResults: [], allReviewerInputs: [], forfeitFailures: [] });
        }, { once: true });
      });
    });

    const result = await runPipeline({ diffPath, timeoutMs: 100, noCache: true, caRoot });

    expect(result.status).toBe('error');
    expect(result.error).toBe('Pipeline timed out after 1s');
    expect(observedSignal).toBeInstanceOf(AbortSignal);
    expect(observedSignal?.aborted).toBe(true);
  });
});
