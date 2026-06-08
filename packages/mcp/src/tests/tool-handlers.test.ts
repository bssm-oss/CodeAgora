/**
 * MCP tool handler tests — config-get, config-set, leaderboard, stats, review-quick, review-full
 *
 * These tests exercise the actual tool handler callbacks by creating a lightweight
 * McpServer stub and capturing the handler function.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCP_ERROR_CODES } from '@codeagora/shared/contracts/stable.js';

// ---------------------------------------------------------------------------
// McpServer stub — captures handler for direct invocation
// ---------------------------------------------------------------------------

type ToolHandler = (params: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function parseToolJson(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

const testDir = path.dirname(fileURLToPath(import.meta.url));

async function resolveToolDir() {
  const candidates = [
    path.resolve(testDir, '..', 'tools'),
    path.join(process.cwd(), 'src', 'tools'),
    path.join(process.cwd(), 'packages', 'mcp', 'src', 'tools'),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(`Unable to locate tools directory from ${testDir}`);
}

function createServerStub() {
  const handlers = new Map<string, ToolHandler>();
  const schemas = new Map<string, unknown>();

  return {
    server: {
      tool(name: string, _desc: string, _schema: unknown, handler: ToolHandler) {
        schemas.set(name, _schema);
        handlers.set(name, handler);
      },
    },
    getHandler(name: string): ToolHandler {
      const h = handlers.get(name);
      if (!h) throw new Error(`Tool "${name}" not registered`);
      return h;
    },
    getSchema(name: string): unknown {
      const schema = schemas.get(name);
      if (!schema) throw new Error(`Schema "${name}" not registered`);
      return schema;
    },
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@codeagora/core/config/loader.js', () => ({
  loadConfig: vi.fn(),
  loadConfigFrom: vi.fn(),
}));

vi.mock('@codeagora/cli/commands/config-set.js', () => ({
  setConfigValue: vi.fn(),
}));

vi.mock('@codeagora/core/l0/leaderboard.js', () => ({
  getModelLeaderboard: vi.fn(),
  formatLeaderboard: vi.fn(),
}));

vi.mock('@codeagora/core/session/queries.js', () => ({
  getSessionStats: vi.fn(),
  formatSessionStats: vi.fn(),
}));

vi.mock('@codeagora/cli/commands/explain.js', () => ({
  explainSession: vi.fn(),
}));

vi.mock('../helpers.js', () => ({
  compactFromPipelineResult: vi.fn((result: { status?: string; summary?: { decision?: string } }) => ({
    decision: result.summary?.decision ?? 'ERROR',
    reasoning: result.status === 'success' ? 'OK' : 'Pipeline failed',
    issues: [],
    summary: result.status === 'success' ? 'ok' : 'error',
    sessionId: 'raw-compact',
  })),
  runReviewCompact: vi.fn(),
  runReviewRaw: vi.fn(),
  getStagedDiff: vi.fn(),
}));

vi.mock('../post-actions.js', () => ({
  formatReviewResult: vi.fn(),
  postToGitHub: vi.fn(),
}));

// ---------------------------------------------------------------------------
// config_get
// ---------------------------------------------------------------------------

describe('config_get handler', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns full config when no key given', async () => {
    const { loadConfigFrom } = await import('@codeagora/core/config/loader.js');
    vi.mocked(loadConfigFrom).mockResolvedValue({ discussion: { maxRounds: 3 } } as never);

    const { registerConfigGet } = await import('../tools/config-get.js');
    const { server, getHandler } = createServerStub();
    registerConfigGet(server as never);

    const result = await getHandler('config_get')({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.discussion.maxRounds).toBe(3);
    expect(result.isError).toBeUndefined();
  });

  it('returns specific key via dot notation', async () => {
    const { loadConfigFrom } = await import('@codeagora/core/config/loader.js');
    vi.mocked(loadConfigFrom).mockResolvedValue({ discussion: { maxRounds: 5 } } as never);

    const { registerConfigGet } = await import('../tools/config-get.js');
    const { server, getHandler } = createServerStub();
    registerConfigGet(server as never);

    const result = await getHandler('config_get')({ key: 'discussion.maxRounds' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.value).toBe(5);
  });

  it('returns error for non-existent key', async () => {
    const { loadConfigFrom } = await import('@codeagora/core/config/loader.js');
    vi.mocked(loadConfigFrom).mockResolvedValue({ discussion: {} } as never);

    const { registerConfigGet } = await import('../tools/config-get.js');
    const { server, getHandler } = createServerStub();
    registerConfigGet(server as never);

    const result = await getHandler('config_get')({ key: 'missing.key' });
    const parsed = parseToolJson(result);
    expect(result.isError).toBe(true);
    expect(parsed).toMatchObject({
      status: 'error',
      code: 'CONFIG_GET_FAILED',
      message: 'Key "missing.key" not found in config',
      details: { key: 'missing.key' },
    });
  });

  it('returns error when loadConfig throws', async () => {
    const { loadConfigFrom } = await import('@codeagora/core/config/loader.js');
    vi.mocked(loadConfigFrom).mockRejectedValue(new Error('no config'));

    const { registerConfigGet } = await import('../tools/config-get.js');
    const { server, getHandler } = createServerStub();
    registerConfigGet(server as never);

    const result = await getHandler('config_get')({});
    const parsed = parseToolJson(result);
    expect(result.isError).toBe(true);
    expect(parsed).toMatchObject({
      status: 'error',
      code: 'CONFIG_GET_FAILED',
      message: 'no config',
    });
  });

  it('resolves repo_path before loading config', async () => {
    const { loadConfigFrom } = await import('@codeagora/core/config/loader.js');
    vi.mocked(loadConfigFrom).mockResolvedValue({ discussion: { maxRounds: 3 } } as never);

    const { registerConfigGet } = await import('../tools/config-get.js');
    const { server, getHandler } = createServerStub();
    registerConfigGet(server as never);

    await getHandler('config_get')({ repo_path: process.cwd() });
    expect(loadConfigFrom).toHaveBeenCalledWith(await fs.realpath(process.cwd()));
  });
});

// ---------------------------------------------------------------------------
// review_pr
// ---------------------------------------------------------------------------

describe('review_pr handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses repo_path as cwd when resolving PR number and fetching diff', async () => {
    const cwd = await fs.realpath(process.cwd());
    const execCalls: Array<[string, string[], unknown]> = [];
    const execFile = vi.fn((cmd: string, args: string[], optionsOrCallback: unknown, maybeCallback?: unknown) => {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
      if (typeof callback !== 'function') {
        throw new Error('missing callback');
      }
      if (cmd === 'git' && args[0] === 'rev-parse') {
        callback(null, `${cwd}\n`, '');
        return;
      }
      if (cmd === 'git') {
        callback(null, 'https://github.com/owner/repo.git\n', '');
        return;
      }
      if (cmd === 'gh') {
        callback(null, 'diff --git a/file.ts b/file.ts\n+change\n', '');
        return;
      }
      callback(new Error(`unexpected command ${cmd}`), '', '');
    });
    Object.assign(execFile, {
      [promisify.custom]: async (cmd: string, args: string[], options?: unknown) => {
        execCalls.push([cmd, args, options]);
        if (cmd === 'git' && args[0] === 'rev-parse') {
          return { stdout: `${cwd}\n`, stderr: '' };
        }
        if (cmd === 'git') {
          return { stdout: 'https://github.com/owner/repo.git\n', stderr: '' };
        }
        if (cmd === 'gh') {
          return { stdout: 'diff --git a/file.ts b/file.ts\n+change\n', stderr: '' };
        }
        throw new Error(`unexpected command ${cmd} ${String(options)}`);
      },
    });
    vi.doMock('child_process', () => ({ execFile }));

    const { runReviewCompact } = await import('../helpers.js');
    vi.mocked(runReviewCompact).mockResolvedValue({
      decision: 'ACCEPT', reasoning: 'OK', issues: [], summary: 'ok', sessionId: '001',
    });

    const { registerReviewPr } = await import('../tools/review-pr.js');
    const { server, getHandler } = createServerStub();
    registerReviewPr(server as never);

    const result = await getHandler('review_pr')({ pr_number: 7, repo_path: process.cwd() });

    if (result.isError) {
      throw new Error(result.content[0].text);
    }
    expect(result.isError).toBeUndefined();
    expect(execCalls).toContainEqual(['git', ['remote', 'get-url', 'origin'], { cwd }]);
    expect(execCalls).toContainEqual(['gh', ['pr', 'diff', 'https://github.com/owner/repo/pull/7'], { cwd }]);
    expect(runReviewCompact).toHaveBeenCalledWith(expect.stringContaining('diff --git'), expect.objectContaining({ repoPath: cwd }));
  });

  it('parses dotted repository names from git remotes', async () => {
    const cwd = await fs.realpath(process.cwd());
    const execCalls: Array<[string, string[], unknown]> = [];
    const execFile = vi.fn();
    Object.assign(execFile, {
      [promisify.custom]: async (cmd: string, args: string[], options?: unknown) => {
        execCalls.push([cmd, args, options]);
        if (cmd === 'git' && args[0] === 'rev-parse') {
          return { stdout: `${cwd}\n`, stderr: '' };
        }
        if (cmd === 'git') {
          return { stdout: 'git@github.com:owner/service.api.git\n', stderr: '' };
        }
        if (cmd === 'gh') {
          return { stdout: 'diff --git a/file.ts b/file.ts\n+change\n', stderr: '' };
        }
        throw new Error(`unexpected command ${cmd}`);
      },
    });
    vi.doMock('child_process', () => ({ execFile }));

    const { runReviewCompact } = await import('../helpers.js');
    vi.mocked(runReviewCompact).mockResolvedValue({
      decision: 'ACCEPT', reasoning: 'OK', issues: [], summary: 'ok', sessionId: '001',
    });

    const { registerReviewPr } = await import('../tools/review-pr.js');
    const { server, getHandler } = createServerStub();
    registerReviewPr(server as never);

    const result = await getHandler('review_pr')({ pr_number: 7, repo_path: process.cwd() });

    if (result.isError) {
      throw new Error(result.content[0].text);
    }
    expect(execCalls).toContainEqual(['gh', ['pr', 'diff', 'https://github.com/owner/service.api/pull/7'], { cwd }]);
  });

  it('posts review without running the pipeline twice for compact responses', async () => {
    const execFile = vi.fn();
    Object.assign(execFile, {
      [promisify.custom]: async (cmd: string) => {
        if (cmd === 'gh') {
          return { stdout: 'diff --git a/file.ts b/file.ts\n+change\n', stderr: '' };
        }
        throw new Error(`unexpected command ${cmd}`);
      },
    });
    vi.doMock('child_process', () => ({ execFile }));

    const { compactFromPipelineResult, runReviewCompact, runReviewRaw } = await import('../helpers.js');
    const { postToGitHub } = await import('../post-actions.js');
    vi.mocked(runReviewRaw).mockResolvedValue({ status: 'success', summary: { decision: 'ACCEPT' } } as never);
    vi.mocked(postToGitHub).mockResolvedValue({});

    const { registerReviewPr } = await import('../tools/review-pr.js');
    const { server, getHandler } = createServerStub();
    registerReviewPr(server as never);

    const result = await getHandler('review_pr')({ pr_url: 'https://github.com/owner/repo/pull/7', post_review: true });
    const parsed = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(parsed.decision).toBe('ACCEPT');
    expect(runReviewRaw).toHaveBeenCalledTimes(1);
    expect(postToGitHub).toHaveBeenCalledTimes(1);
    expect(compactFromPipelineResult).toHaveBeenCalledTimes(1);
    expect(runReviewCompact).not.toHaveBeenCalled();
  });

  it('rejects missing pr_url and pr_number at the schema layer', async () => {
    const { registerReviewPr } = await import('../tools/review-pr.js');
    const { server, getSchema } = createServerStub();
    registerReviewPr(server as never);

    const schema = getSchema('review_pr') as { safeParse: (value: unknown) => { success: boolean } };
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ pr_number: 7 }).success).toBe(true);
    expect(schema.safeParse({ pr_url: 'https://github.com/owner/repo/pull/7' }).success).toBe(true);
  });

  it('returns structured error when post_review fails', async () => {
    const execFile = vi.fn((cmd: string, _args: string[], optionsOrCallback: unknown, maybeCallback?: unknown) => {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
      if (typeof callback !== 'function') {
        throw new Error('missing callback');
      }
      if (cmd === 'gh') {
        callback(null, 'diff --git a/file.ts b/file.ts\n+change\n', '');
        return;
      }
      callback(new Error(`unexpected command ${cmd}`), '', '');
    });
    Object.assign(execFile, {
      [promisify.custom]: async (cmd: string) => {
        if (cmd === 'gh') {
          return { stdout: 'diff --git a/file.ts b/file.ts\n+change\n', stderr: '' };
        }
        throw new Error(`unexpected command ${cmd}`);
      },
    });
    vi.doMock('child_process', () => ({ execFile }));

    const { runReviewRaw } = await import('../helpers.js');
    const { postToGitHub } = await import('../post-actions.js');
    vi.mocked(runReviewRaw).mockResolvedValue({ status: 'success', summary: { decision: 'ACCEPT' } } as never);
    vi.mocked(postToGitHub).mockRejectedValue(new Error('posting failed'));

    const { registerReviewPr } = await import('../tools/review-pr.js');
    const { server, getHandler } = createServerStub();
    registerReviewPr(server as never);

    const result = await getHandler('review_pr')({ pr_url: 'https://github.com/owner/repo/pull/7', post_review: true });
    const parsed = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(parsed).toMatchObject({
      status: 'error',
      code: 'REVIEW_PR_FAILED',
      message: 'Failed to review PR: posting failed',
    });
  });
});

// ---------------------------------------------------------------------------
// config_set
// ---------------------------------------------------------------------------

describe('config_set handler', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls setConfigValue and returns success', async () => {
    const { setConfigValue } = await import('@codeagora/cli/commands/config-set.js');
    vi.mocked(setConfigValue).mockResolvedValue(undefined);

    const { registerConfigSet } = await import('../tools/config-set.js');
    const { server, getHandler } = createServerStub();
    registerConfigSet(server as never);

    const result = await getHandler('config_set')({ key: 'discussion.maxRounds', value: 5 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('updated');
    expect(parsed.key).toBe('discussion.maxRounds');
    expect(setConfigValue).toHaveBeenCalledWith(expect.any(String), 'discussion.maxRounds', '5');
  });

  it('rejects invalid repo_path before mutating config', async () => {
    const { setConfigValue } = await import('@codeagora/cli/commands/config-set.js');

    const { registerConfigSet } = await import('../tools/config-set.js');
    const { server, getHandler } = createServerStub();
    registerConfigSet(server as never);

    const result = await getHandler('config_set')({ key: 'mode', value: 'auto', repo_path: path.parse(process.cwd()).root });
    const parsed = parseToolJson(result);

    expect(result.isError).toBe(true);
    expect(parsed).toMatchObject({ status: 'error', code: 'INVALID_REPO_PATH' });
    expect(parsed.guidance).toEqual(expect.arrayContaining([
      expect.stringContaining('Omit `repo_path`'),
      expect.stringContaining('exact workspace root'),
    ]));
    expect(setConfigValue).not.toHaveBeenCalled();
  });

  it('returns error when setConfigValue throws', async () => {
    const { setConfigValue } = await import('@codeagora/cli/commands/config-set.js');
    vi.mocked(setConfigValue).mockRejectedValue(new Error('invalid key'));

    const { registerConfigSet } = await import('../tools/config-set.js');
    const { server, getHandler } = createServerStub();
    registerConfigSet(server as never);

    const result = await getHandler('config_set')({ key: 'bad.key', value: 'x' });
    const parsed = parseToolJson(result);
    expect(result.isError).toBe(true);
    expect(parsed).toMatchObject({
      status: 'error',
      code: 'CONFIG_SET_FAILED',
      message: 'invalid key',
      details: { key: 'bad.key' },
    });
  });
});

// ---------------------------------------------------------------------------
// get_leaderboard
// ---------------------------------------------------------------------------

describe('get_leaderboard handler', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns formatted leaderboard', async () => {
    const { getModelLeaderboard, formatLeaderboard } = await import('@codeagora/core/l0/leaderboard.js');
    vi.mocked(getModelLeaderboard).mockResolvedValue([]);
    vi.mocked(formatLeaderboard).mockReturnValue('Model | WinRate\ngpt-4 | 0.85');

    const { registerLeaderboard } = await import('../tools/leaderboard.js');
    const { server, getHandler } = createServerStub();
    registerLeaderboard(server as never);

    const result = await getHandler('get_leaderboard')({});
    expect(result.content[0].text).toContain('gpt-4');
    expect(result.isError).toBeUndefined();
  });

  it('returns error on failure', async () => {
    const { getModelLeaderboard } = await import('@codeagora/core/l0/leaderboard.js');
    vi.mocked(getModelLeaderboard).mockRejectedValue(new Error('no data'));

    const { registerLeaderboard } = await import('../tools/leaderboard.js');
    const { server, getHandler } = createServerStub();
    registerLeaderboard(server as never);

    const result = await getHandler('get_leaderboard')({});
    const parsed = parseToolJson(result);
    expect(result.isError).toBe(true);
    expect(parsed).toMatchObject({
      status: 'error',
      code: 'LEADERBOARD_FAILED',
      message: 'no data',
    });
  });
});

// ---------------------------------------------------------------------------
// get_stats
// ---------------------------------------------------------------------------

describe('get_stats handler', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns formatted stats', async () => {
    const { getSessionStats, formatSessionStats } = await import('@codeagora/core/session/queries.js');
    vi.mocked(getSessionStats).mockResolvedValue({ total: 10 } as never);
    vi.mocked(formatSessionStats).mockReturnValue('Total: 10 sessions');

    const { registerStats } = await import('../tools/stats.js');
    const { server, getHandler } = createServerStub();
    registerStats(server as never);

    const result = await getHandler('get_stats')({});
    expect(result.content[0].text).toContain('10 sessions');
  });

  it('returns error on failure', async () => {
    const { getSessionStats } = await import('@codeagora/core/session/queries.js');
    vi.mocked(getSessionStats).mockRejectedValue(new Error('no sessions dir'));

    const { registerStats } = await import('../tools/stats.js');
    const { server, getHandler } = createServerStub();
    registerStats(server as never);

    const result = await getHandler('get_stats')({});
    const parsed = parseToolJson(result);
    expect(result.isError).toBe(true);
    expect(parsed).toMatchObject({
      status: 'error',
      code: 'STATS_FAILED',
      message: 'no sessions dir',
    });
    expect(parsed.guidance).toEqual(expect.arrayContaining([
      expect.stringContaining('Omit `repo_path`'),
      expect.stringContaining('workspace'),
    ]));
  });

  it('accepts repo_path and resolves it before stats lookup', async () => {
    const { getSessionStats } = await import('@codeagora/core/session/queries.js');
    vi.mocked(getSessionStats).mockResolvedValue({ total: 10 } as never);

    const { registerStats } = await import('../tools/stats.js');
    const { server, getHandler } = createServerStub();
    registerStats(server as never);

    await getHandler('get_stats')({ repo_path: process.cwd() });
    expect(getSessionStats).toHaveBeenCalledWith(await fs.realpath(process.cwd()));
  });
});

// ---------------------------------------------------------------------------
// explain_session
// ---------------------------------------------------------------------------

describe('explain_session handler', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects invalid repo_path before explanation', async () => {
    const { explainSession } = await import('@codeagora/cli/commands/explain.js');

    const { registerExplain } = await import('../tools/explain.js');
    const { server, getHandler } = createServerStub();
    registerExplain(server as never);

    const result = await getHandler('explain_session')({ session: '2026-03-19/001', repo_path: path.parse(process.cwd()).root });
    const parsed = parseToolJson(result);

    expect(result.isError).toBe(true);
    expect(parsed).toMatchObject({ status: 'error', code: 'INVALID_REPO_PATH' });
    expect(parsed.guidance).toEqual(expect.arrayContaining([
      expect.stringContaining('Omit `repo_path`'),
      expect.stringContaining('exact workspace root'),
    ]));
    expect(explainSession).not.toHaveBeenCalled();
  });

  it('passes validated repo_path to explainSession', async () => {
    const { explainSession } = await import('@codeagora/cli/commands/explain.js');
    vi.mocked(explainSession).mockResolvedValue({ sessionPath: '2026-03-19/001', narrative: 'ok' } as never);

    const { registerExplain } = await import('../tools/explain.js');
    const { server, getHandler } = createServerStub();
    registerExplain(server as never);

    const result = await getHandler('explain_session')({ session: '2026-03-19/001', repo_path: process.cwd() });
    expect(result.isError).toBeUndefined();
    expect(explainSession).toHaveBeenCalledWith(await fs.realpath(process.cwd()), '2026-03-19/001');
  });
});

// ---------------------------------------------------------------------------
// review_quick
// ---------------------------------------------------------------------------

describe('stable MCP error contract', () => {
  it('registers every structured MCP error code used by stable tools', () => {
    expect(MCP_ERROR_CODES).toEqual(expect.arrayContaining([
      'INVALID_INPUT',
      'INVALID_REPO_PATH',
      'REVIEW_FAILED',
      'REVIEW_PR_FAILED',
      'DRY_RUN_FAILED',
      'CONFIG_GET_FAILED',
      'CONFIG_SET_FAILED',
      'EXPLAIN_SESSION_FAILED',
      'LEADERBOARD_FAILED',
      'STATS_FAILED',
    ]));
  });

  it('keeps tool implementations off ad-hoc text and unversioned error bodies', async () => {
    const toolDir = await resolveToolDir();
    const entries = await fs.readdir(toolDir);
    const toolFiles = entries.filter((entry) => entry.endsWith('.ts') && !entry.startsWith('shared-'));

    for (const entry of toolFiles) {
      const content = await fs.readFile(path.join(toolDir, entry), 'utf-8');
      expect(content, `${entry} should not return plain Error: text`).not.toContain('`Error:');
      expect(content, `${entry} should not return unversioned { error } JSON`).not.toContain('JSON.stringify({ error');
    }
  });
});

// ---------------------------------------------------------------------------
// review_quick
// ---------------------------------------------------------------------------

describe('review_quick handler', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns error when no diff and not staged', async () => {
    const { registerReviewQuick } = await import('../tools/review-quick.js');
    const { server, getHandler } = createServerStub();
    registerReviewQuick(server as never);

    const result = await getHandler('review_quick')({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('required');
  });

  it('returns structured error for whitespace-only diff without running review', async () => {
    const { runReviewCompact } = await import('../helpers.js');
    const { registerReviewQuick } = await import('../tools/review-quick.js');
    const { server, getHandler } = createServerStub();
    registerReviewQuick(server as never);

    const result = await getHandler('review_quick')({ diff: '   ' });
    const parsed = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(parsed).toMatchObject({
      status: 'error',
      code: 'INVALID_INPUT',
      message: 'Either diff or staged=true is required',
    });
    expect(parsed.guidance).toEqual(expect.arrayContaining([
      expect.stringContaining('Pass a unified diff'),
      expect.stringContaining('staged=true'),
    ]));
    expect(runReviewCompact).not.toHaveBeenCalled();
  });

  it('runs compact review with diff', async () => {
    const { runReviewCompact } = await import('../helpers.js');
    vi.mocked(runReviewCompact).mockResolvedValue({
      decision: 'ACCEPT',
      reasoning: 'OK',
      issues: [],
      summary: 'ok',
      sessionId: '001',
    });

    const { registerReviewQuick } = await import('../tools/review-quick.js');
    const { server, getHandler } = createServerStub();
    registerReviewQuick(server as never);

    const result = await getHandler('review_quick')({ diff: '+added line' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.decision).toBe('ACCEPT');
    expect(result.isError).toBeUndefined();
  });

  it('uses staged diff when staged=true', async () => {
    const { runReviewCompact, getStagedDiff } = await import('../helpers.js');
    vi.mocked(getStagedDiff).mockResolvedValue('+staged change');
    vi.mocked(runReviewCompact).mockResolvedValue({
      decision: 'ACCEPT', reasoning: 'OK', issues: [], summary: 'ok', sessionId: '001',
    });

    const { registerReviewQuick } = await import('../tools/review-quick.js');
    const { server, getHandler } = createServerStub();
    registerReviewQuick(server as never);

    const result = await getHandler('review_quick')({ staged: true });
    expect(getStagedDiff).toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
  });

  it('returns error on pipeline failure', async () => {
    const { runReviewCompact } = await import('../helpers.js');
    vi.mocked(runReviewCompact).mockRejectedValue(new Error('pipeline boom'));

    const { registerReviewQuick } = await import('../tools/review-quick.js');
    const { server, getHandler } = createServerStub();
    registerReviewQuick(server as never);

    const result = await getHandler('review_quick')({ diff: '+x' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('pipeline boom');
  });

  it('passes reviewer options through', async () => {
    const { runReviewCompact } = await import('../helpers.js');
    vi.mocked(runReviewCompact).mockResolvedValue({
      decision: 'ACCEPT', reasoning: 'OK', issues: [], summary: 'ok', sessionId: '001',
    });

    const { registerReviewQuick } = await import('../tools/review-quick.js');
    const { server, getHandler } = createServerStub();
    registerReviewQuick(server as never);

    await getHandler('review_quick')({
      diff: '+x',
      reviewer_count: 5,
      provider: 'groq',
      model: 'llama-3',
      timeout_seconds: 60,
    });

    expect(runReviewCompact).toHaveBeenCalledWith('+x', expect.objectContaining({
      skipDiscussion: true,
      skipHead: true,
      reviewerCount: 5,
      provider: 'groq',
      model: 'llama-3',
      timeoutSeconds: 60,
    }));
  });

  it('returns structured error for invalid repo_path without running review', async () => {
    const { runReviewCompact } = await import('../helpers.js');
    const { registerReviewQuick } = await import('../tools/review-quick.js');
    const { server, getHandler } = createServerStub();
    registerReviewQuick(server as never);

    const result = await getHandler('review_quick')({ diff: '+x', repo_path: path.parse(process.cwd()).root });
    const parsed = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(parsed).toMatchObject({
      status: 'error',
      code: 'INVALID_REPO_PATH',
    });
    expect(parsed.message).toContain('repo_path');
    expect(runReviewCompact).not.toHaveBeenCalled();
  });

  it('forwards valid repo_path to the review pipeline', async () => {
    const { runReviewCompact } = await import('../helpers.js');
    vi.mocked(runReviewCompact).mockResolvedValue({
      decision: 'ACCEPT', reasoning: 'OK', issues: [], summary: 'ok', sessionId: '001',
    });

    const { registerReviewQuick } = await import('../tools/review-quick.js');
    const { server, getHandler } = createServerStub();
    registerReviewQuick(server as never);

    await getHandler('review_quick')({ diff: '+x', repo_path: process.cwd() });

    expect(runReviewCompact).toHaveBeenCalledWith('+x', expect.objectContaining({
      repoPath: await fs.realpath(process.cwd()),
    }));
  });

  it('rejects symlink repo_path before running review', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-mcp-symlink-'));
    const outsideDir = path.join(tempDir, 'outside');
    const linkPath = path.join(process.cwd(), `.codeagora-mcp-test-link-${Date.now()}`);
    await fs.mkdir(outsideDir);
    await fs.symlink(outsideDir, linkPath);

    try {
      const { runReviewCompact } = await import('../helpers.js');
      const { registerReviewQuick } = await import('../tools/review-quick.js');
      const { server, getHandler } = createServerStub();
      registerReviewQuick(server as never);

      const result = await getHandler('review_quick')({ diff: '+x', repo_path: linkPath });
      const parsed = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(parsed).toMatchObject({
        status: 'error',
        code: 'INVALID_REPO_PATH',
        message: 'repo_path must not be a symbolic link',
      });
      expect(runReviewCompact).not.toHaveBeenCalled();
    } finally {
      await fs.rm(linkPath, { force: true }).catch((error: unknown) => {
        void error;
      });
      await fs.rm(tempDir, { recursive: true, force: true }).catch((error: unknown) => {
        void error;
      });
    }
  });

  it('uses repo_path as cwd for staged diffs', async () => {
    const { runReviewCompact, getStagedDiff } = await import('../helpers.js');
    vi.mocked(getStagedDiff).mockResolvedValue('+staged change');
    vi.mocked(runReviewCompact).mockResolvedValue({
      decision: 'ACCEPT', reasoning: 'OK', issues: [], summary: 'ok', sessionId: '001',
    });

    const { registerReviewQuick } = await import('../tools/review-quick.js');
    const { server, getHandler } = createServerStub();
    registerReviewQuick(server as never);

    await getHandler('review_quick')({ staged: true, repo_path: process.cwd() });

    expect(getStagedDiff).toHaveBeenCalledWith(await fs.realpath(process.cwd()));
  });
});

// ---------------------------------------------------------------------------
// review_full
// ---------------------------------------------------------------------------

describe('review_full handler', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns error when no diff and not staged', async () => {
    const { registerReviewFull } = await import('../tools/review-full.js');
    const { server, getHandler } = createServerStub();
    registerReviewFull(server as never);

    const result = await getHandler('review_full')({});
    expect(result.isError).toBe(true);
  });

  it('returns structured error for whitespace-only diff without running review', async () => {
    const { runReviewCompact } = await import('../helpers.js');
    const { registerReviewFull } = await import('../tools/review-full.js');
    const { server, getHandler } = createServerStub();
    registerReviewFull(server as never);

    const result = await getHandler('review_full')({ diff: '   ' });
    const parsed = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(parsed).toMatchObject({
      status: 'error',
      code: 'INVALID_INPUT',
      message: 'Either diff or staged=true is required',
    });
    expect(parsed.guidance).toEqual(expect.arrayContaining([
      expect.stringContaining('Pass a unified diff'),
      expect.stringContaining('staged=true'),
    ]));
    expect(runReviewCompact).not.toHaveBeenCalled();
  });

  it('runs compact review with diff', async () => {
    const { runReviewCompact } = await import('../helpers.js');
    vi.mocked(runReviewCompact).mockResolvedValue({
      decision: 'REJECT', reasoning: 'Issues found', issues: [{ severity: 'CRITICAL' }], summary: 'bad', sessionId: '002',
    } as never);

    const { registerReviewFull } = await import('../tools/review-full.js');
    const { server, getHandler } = createServerStub();
    registerReviewFull(server as never);

    const result = await getHandler('review_full')({ diff: '+bad code' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.decision).toBe('REJECT');
  });

  it('uses custom output format when specified', async () => {
    const { runReviewRaw } = await import('../helpers.js');
    const { formatReviewResult } = await import('../post-actions.js');
    vi.mocked(runReviewRaw).mockResolvedValue({ status: 'success' } as never);
    vi.mocked(formatReviewResult).mockResolvedValue('# Markdown Report');

    const { registerReviewFull } = await import('../tools/review-full.js');
    const { server, getHandler } = createServerStub();
    registerReviewFull(server as never);

    const result = await getHandler('review_full')({ diff: '+x', output_format: 'md' });
    expect(result.content[0].text).toBe('# Markdown Report');
    expect(formatReviewResult).toHaveBeenCalledWith(expect.anything(), 'md');
  });

  it('routes output_format=json through the versioned review formatter', async () => {
    const { runReviewRaw } = await import('../helpers.js');
    const { formatReviewResult } = await import('../post-actions.js');
    vi.mocked(runReviewRaw).mockResolvedValue({ status: 'success' } as never);
    vi.mocked(formatReviewResult).mockResolvedValue('{"schemaVersion":"codeagora.review.v1"}');

    const { registerReviewFull } = await import('../tools/review-full.js');
    const { server, getHandler } = createServerStub();
    registerReviewFull(server as never);

    const result = await getHandler('review_full')({ diff: '+x', output_format: 'json' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.schemaVersion).toBe('codeagora.review.v1');
    expect(formatReviewResult).toHaveBeenCalledWith(expect.anything(), 'json');
  });

  it('returns error on pipeline failure', async () => {
    const { runReviewCompact } = await import('../helpers.js');
    vi.mocked(runReviewCompact).mockRejectedValue(new Error('out of tokens'));

    const { registerReviewFull } = await import('../tools/review-full.js');
    const { server, getHandler } = createServerStub();
    registerReviewFull(server as never);

    const result = await getHandler('review_full')({ diff: '+x' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('out of tokens');
  });
});
