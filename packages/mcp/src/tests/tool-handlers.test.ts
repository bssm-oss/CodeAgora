/**
 * MCP tool handler tests — config-get, config-set, leaderboard, stats, review-quick, review-full
 *
 * These tests exercise the actual tool handler callbacks by creating a lightweight
 * McpServer stub and capturing the handler function.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// McpServer stub — captures handler for direct invocation
// ---------------------------------------------------------------------------

type ToolHandler = (params: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function createServerStub() {
  const handlers = new Map<string, ToolHandler>();

  return {
    server: {
      tool(name: string, _desc: string, _schema: unknown, handler: ToolHandler) {
        handlers.set(name, handler);
      },
    },
    getHandler(name: string): ToolHandler {
      const h = handlers.get(name);
      if (!h) throw new Error(`Tool "${name}" not registered`);
      return h;
    },
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@codeagora/core/config/loader.js', () => ({
  loadConfig: vi.fn(),
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

vi.mock('../helpers.js', () => ({
  runReviewCompact: vi.fn(),
  runReviewRaw: vi.fn(),
  getStagedDiff: vi.fn(),
}));

vi.mock('../post-actions.js', () => ({
  formatReviewResult: vi.fn(),
  sendReviewNotification: vi.fn(),
}));

// ---------------------------------------------------------------------------
// config_get
// ---------------------------------------------------------------------------

describe('config_get handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns full config when no key given', async () => {
    const { loadConfig } = await import('@codeagora/core/config/loader.js');
    vi.mocked(loadConfig).mockResolvedValue({ discussion: { maxRounds: 3 } } as never);

    const { registerConfigGet } = await import('../tools/config-get.js');
    const { server, getHandler } = createServerStub();
    registerConfigGet(server as never);

    const result = await getHandler('config_get')({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.discussion.maxRounds).toBe(3);
    expect(result.isError).toBeUndefined();
  });

  it('returns specific key via dot notation', async () => {
    const { loadConfig } = await import('@codeagora/core/config/loader.js');
    vi.mocked(loadConfig).mockResolvedValue({ discussion: { maxRounds: 5 } } as never);

    const { registerConfigGet } = await import('../tools/config-get.js');
    const { server, getHandler } = createServerStub();
    registerConfigGet(server as never);

    const result = await getHandler('config_get')({ key: 'discussion.maxRounds' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.value).toBe(5);
  });

  it('returns error for non-existent key', async () => {
    const { loadConfig } = await import('@codeagora/core/config/loader.js');
    vi.mocked(loadConfig).mockResolvedValue({ discussion: {} } as never);

    const { registerConfigGet } = await import('../tools/config-get.js');
    const { server, getHandler } = createServerStub();
    registerConfigGet(server as never);

    const result = await getHandler('config_get')({ key: 'missing.key' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('returns error when loadConfig throws', async () => {
    const { loadConfig } = await import('@codeagora/core/config/loader.js');
    vi.mocked(loadConfig).mockRejectedValue(new Error('no config'));

    const { registerConfigGet } = await import('../tools/config-get.js');
    const { server, getHandler } = createServerStub();
    registerConfigGet(server as never);

    const result = await getHandler('config_get')({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no config');
  });
});

// ---------------------------------------------------------------------------
// config_set
// ---------------------------------------------------------------------------

describe('config_set handler', () => {
  beforeEach(() => vi.clearAllMocks());

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

  it('returns error when setConfigValue throws', async () => {
    const { setConfigValue } = await import('@codeagora/cli/commands/config-set.js');
    vi.mocked(setConfigValue).mockRejectedValue(new Error('invalid key'));

    const { registerConfigSet } = await import('../tools/config-set.js');
    const { server, getHandler } = createServerStub();
    registerConfigSet(server as never);

    const result = await getHandler('config_set')({ key: 'bad.key', value: 'x' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid key');
  });
});

// ---------------------------------------------------------------------------
// get_leaderboard
// ---------------------------------------------------------------------------

describe('get_leaderboard handler', () => {
  beforeEach(() => vi.clearAllMocks());

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
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no data');
  });
});

// ---------------------------------------------------------------------------
// get_stats
// ---------------------------------------------------------------------------

describe('get_stats handler', () => {
  beforeEach(() => vi.clearAllMocks());

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
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no sessions dir');
  });
});

// ---------------------------------------------------------------------------
// review_quick
// ---------------------------------------------------------------------------

describe('review_quick handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when no diff and not staged', async () => {
    const { registerReviewQuick } = await import('../tools/review-quick.js');
    const { server, getHandler } = createServerStub();
    registerReviewQuick(server as never);

    const result = await getHandler('review_quick')({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('required');
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
});

// ---------------------------------------------------------------------------
// review_full
// ---------------------------------------------------------------------------

describe('review_full handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when no diff and not staged', async () => {
    const { registerReviewFull } = await import('../tools/review-full.js');
    const { server, getHandler } = createServerStub();
    registerReviewFull(server as never);

    const result = await getHandler('review_full')({});
    expect(result.isError).toBe(true);
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

  it('sends notification when notify=true', async () => {
    const { runReviewRaw } = await import('../helpers.js');
    const { sendReviewNotification } = await import('../post-actions.js');
    vi.mocked(runReviewRaw).mockResolvedValue({ status: 'success' } as never);
    vi.mocked(sendReviewNotification).mockResolvedValue(undefined);

    const { registerReviewFull } = await import('../tools/review-full.js');
    const { server, getHandler } = createServerStub();
    registerReviewFull(server as never);

    // notify triggers raw path but no output_format → falls through to compact
    const { runReviewCompact } = await import('../helpers.js');
    vi.mocked(runReviewCompact).mockResolvedValue({
      decision: 'ACCEPT', reasoning: 'OK', issues: [], summary: 'ok', sessionId: '001',
    });

    await getHandler('review_full')({ diff: '+x', notify: true });
    expect(sendReviewNotification).toHaveBeenCalled();
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
