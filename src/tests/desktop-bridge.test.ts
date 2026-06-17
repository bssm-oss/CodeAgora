import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();

type WindowShim = typeof globalThis & {
  window?: Window & typeof globalThis;
};

function installBrowserWindow(localStorageValue?: string): void {
  const storage = new Map<string, string>();
  if (localStorageValue !== undefined) storage.set('codeagora.desktop.config', localStorageValue);

  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size;
    },
  } as Storage;

  (globalThis as WindowShim).window = {
    location: { pathname: '/packages/desktop/' },
    localStorage,
  } as unknown as Window & typeof globalThis;
}

function installTauriWindow(): void {
  (globalThis as WindowShim).window = {
    __TAURI_INTERNALS__: { invoke: invokeMock },
    location: { pathname: '/repo' },
    localStorage: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    } as unknown as Storage,
  } as unknown as Window & typeof globalThis;
}

async function importBridge() {
  return import('../../packages/desktop/src/api/desktop-bridge.ts');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete (globalThis as WindowShim).window;
});

describe('desktop bridge browser fallback contract', () => {
  it('normalizes browser fallback sessions, details, config, and repo info', async () => {
    installBrowserWindow('{"language":"en"}');
    const bridge = await importBridge();

    const sessions = await bridge.listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({
      id: expect.any(String),
      status: expect.any(String),
      decision: expect.any(String),
      publicDecision: expect.any(String),
      severityCounts: expect.any(Object),
      topIssues: expect.any(Array),
    });
    expect(sessions[0]!.decision).toBe('REJECT');
    expect(sessions[0]!.publicDecision).toBe('ACCEPT');

    const detail = await bridge.getSessionDetail(sessions[0].id);
    expect(detail).toMatchObject({
      id: sessions[0].id,
      decision: 'REJECT',
      publicDecision: 'ACCEPT',
      decisionBrief: expect.objectContaining({ decision: 'ACCEPT' }),
      markdown: expect.any(String),
      evidenceCount: expect.any(Number),
      discussionsCount: expect.any(Number),
    });
    expect(detail.markdown).toContain('Decision: ACCEPT');
    expect(detail.markdown).not.toContain('Decision: REJECT');

    const raw = '{"reviewers":[]}';
    expect(await bridge.validateConfig(raw)).toMatchObject({ valid: true, errors: [], warnings: [] });

    expect(await bridge.validateConfig('not json')).toMatchObject({ valid: false, errors: expect.any(Array), warnings: [] });

    expect(await bridge.readConfig()).toMatchObject({ path: '.ca/config.json', raw: '{"language":"en"}' });

    expect(await bridge.getRepoInfo()).toMatchObject({
      isGitRepo: false,
      trusted: false,
      trustReason: expect.any(String),
      sessionsRoot: '.ca/sessions',
    });
  });

  it('fails closed for mutating and process browser preview calls', async () => {
    installBrowserWindow('{"language":"en"}');
    const bridge = await importBridge();
    const raw = '{"reviewers":[]}';

    await expect(bridge.runReview(true)).rejects.toMatchObject({ code: 'DESKTOP_PREVIEW_DISABLED' });
    await expect(bridge.startReviewRun(true)).rejects.toMatchObject({ code: 'DESKTOP_PREVIEW_DISABLED' });
    await expect(bridge.getReviewRun('preview')).rejects.toMatchObject({ code: 'DESKTOP_PREVIEW_DISABLED' });
    await expect(bridge.cancelReviewRun('preview')).rejects.toMatchObject({ code: 'DESKTOP_PREVIEW_DISABLED' });
    await expect(bridge.writeConfig(raw)).rejects.toMatchObject({ code: 'DESKTOP_PREVIEW_DISABLED' });
    await expect(bridge.openRepository('/tmp/repo')).rejects.toMatchObject({ code: 'DESKTOP_PREVIEW_DISABLED' });
    expect(window.localStorage.getItem('codeagora.desktop.config')).toBe('{"language":"en"}');
  });
});

describe('desktop bridge Tauri contract normalization', () => {
  it('normalizes CLI session list entries into SessionSummary shape', async () => {
    installTauriWindow();
    invokeMock.mockResolvedValueOnce({
      sessions: [
        {
          date: '2026-05-01',
          sessionId: '007',
          status: 'completed',
          publicDecision: 'ACCEPT',
          verdict: {
            decision: 'REJECT',
            issues: [
              { severity: 'CRITICAL', filePath: 'src/a.ts', line: 12, title: 'Bug' },
              { severity: 'WARNING', filePath: 'src/b.ts', lineRange: [3, 5], title: 'Smell' },
            ],
          },
        },
      ],
    });

    const bridge = await importBridge();
    const [session] = await bridge.listSessions();

    expect(invokeMock.mock.calls[0]?.[0]).toBe('list_sessions');
    expect(invokeMock.mock.calls[0]?.[1]).toEqual({ forceRefresh: false });
    expect(session).toMatchObject({
      id: '2026-05-01/007',
      status: 'completed',
      decision: 'REJECT',
      publicDecision: 'ACCEPT',
      severityCounts: { CRITICAL: 1, WARNING: 1 },
      topIssues: [
        expect.objectContaining({ severity: 'CRITICAL', filePath: 'src/a.ts', title: 'Bug' }),
        expect.objectContaining({ severity: 'WARNING', filePath: 'src/b.ts', title: 'Smell' }),
      ],
    });
  });

  it('falls back to full issue arrays when native verdict evidence docs are empty', async () => {
    installTauriWindow();
    invokeMock.mockResolvedValueOnce({
      sessions: [
        {
          date: '2026-05-01',
          sessionId: '011',
          status: 'completed',
          verdict: {
            decision: 'REJECT',
            evidenceDocs: [],
            summary: {
              topIssues: [
                { severity: 'SUGGESTION', filePath: 'src/summary.ts', line: 1, title: 'Summary fallback only' },
              ],
            },
            issues: [
              { severity: 'CRITICAL', filePath: 'src/a.ts', line: 12, title: 'Full blocker' },
              { severity: 'WARNING', filePath: 'src/b.ts', lineRange: [3, 5], title: 'Full warning' },
            ],
          },
        },
      ],
    });

    const bridge = await importBridge();
    const [session] = await bridge.listSessions();

    expect(session).toMatchObject({
      id: '2026-05-01/011',
      severityCounts: { CRITICAL: 1, WARNING: 1 },
      topIssues: [
        expect.objectContaining({ severity: 'CRITICAL', filePath: 'src/a.ts', title: 'Full blocker' }),
        expect.objectContaining({ severity: 'WARNING', filePath: 'src/b.ts', title: 'Full warning' }),
      ],
    });
    expect(session?.topIssues.map((issue) => issue.title)).not.toContain('Summary fallback only');
  });

  it('uses decisionBrief as the public decision without mutating the raw verdict', async () => {
    installTauriWindow();
    invokeMock.mockResolvedValueOnce({
      entry: {
        id: '2026-05-01/009',
        date: '2026-05-01',
        sessionId: '009',
        status: 'completed',
      },
      verdict: {
        summary: {
          decision: 'REJECT',
          reasoning: 'Raw head verdict rejected before evidence promotion.',
        },
        decisionBrief: {
          decision: 'ACCEPT',
          reviewedScope: {
            files: ['src/auth.ts'],
            areas: ['auth'],
            contracts: ['provider secret handling'],
            checks: ['evidence promotion'],
            uncertainty: 'Only audit-only findings remain.',
          },
          completedChecks: ['evidence promotion'],
          evidenceCards: [],
          requiredActions: [],
          followUpCount: 2,
          auditCount: 1,
          demotedCount: 1,
        },
      },
      metadata: { completedAt: 1710000000000 },
    });

    const bridge = await importBridge();
    const detail = await bridge.getSessionDetail('2026-05-01/009');

    expect(detail.decision).toBe('REJECT');
    expect(detail.publicDecision).toBe('ACCEPT');
    expect(detail.decisionBrief?.decision).toBe('ACCEPT');
    expect(detail.decisionBrief?.reviewedScope.files).toEqual(['src/auth.ts']);
  });

  it('only exposes complete allowlisted decision brief cards and redacts secrets', async () => {
    installTauriWindow();
    invokeMock.mockResolvedValueOnce({
      entry: {
        id: '2026-05-01/010',
        date: '2026-05-01',
        sessionId: '010',
        status: 'completed',
      },
      verdict: {
        decision: 'REJECT',
        decisionBrief: {
          decision: 'REJECT',
          reviewedScope: {
            files: ['src/auth.ts'],
            areas: ['auth'],
            contracts: ['token handling'],
            checks: ['evidence promotion'],
            uncertainty: 'Blocking evidence is complete.',
          },
          completedChecks: ['evidence promotion'],
          evidenceCards: [
            {
              kind: 'must-fix',
              source: 'evidence',
              title: 'Provider token is exposed',
              severity: 'CRITICAL',
              filePath: 'src/auth.ts',
              lineRange: [7, 7],
              confidence: 92,
              diffFact: 'OPENAI_API_KEY=sk-secret123456 and bearer abc.def.ghi are present.',
              affectedContract: 'Provider keys must not be stored in config or source.',
              check: 'Remove the token and do not ship {"apiKey":"plain-secret-value"} in config.',
              expectedActual: 'Expected env-backed credential; actual source literal.',
              decisionRule: 'Merge is blocked until the secret is removed.',
              complete: true,
              missing: [],
              rawDiff: '+OPENAI_API_KEY=sk-secret123456',
            },
            {
              kind: 'must-fix',
              source: 'evidence',
              title: 'Incomplete card',
              severity: 'CRITICAL',
              filePath: 'src/auth.ts',
              lineRange: [8, 8],
              confidence: 70,
              diffFact: '',
              affectedContract: 'Missing diff fact.',
              check: 'n/a',
              decisionRule: 'n/a',
              complete: true,
              missing: ['diffFact'],
            },
            {
              kind: 'must-fix',
              source: 'evidence',
              title: 'Complete-looking but demoted card',
              severity: 'CRITICAL',
              filePath: 'src/auth.ts',
              lineRange: [9, 9],
              confidence: 70,
              diffFact: 'A concrete diff fact exists.',
              affectedContract: 'This card was demoted by the public decision gate.',
              check: 'pnpm test',
              decisionRule: 'Do not render when complete=false.',
              complete: false,
              missing: [],
            },
            {
              kind: 'must-fix',
              source: 'evidence',
              title: 'Invalid location card',
              severity: 'CRITICAL',
              filePath: 'src/auth.ts',
              lineRange: [0, 0],
              confidence: 70,
              diffFact: 'A concrete diff fact exists.',
              affectedContract: 'Line ranges must point to exact changed code.',
              check: 'pnpm test',
              decisionRule: 'Do not render invalid locations.',
              complete: true,
              missing: [],
            },
          ],
          requiredActions: ['Remove the provider token.'],
          followUpCount: 0,
          auditCount: 0,
          demotedCount: 0,
        },
      },
      metadata: { completedAt: 1710000000000 },
    });

    const bridge = await importBridge();
    const detail = await bridge.getSessionDetail('2026-05-01/010');

    expect(detail.publicDecision).toBe('REJECT');
    expect(detail.decisionBrief?.evidenceCards).toHaveLength(1);
    expect(detail.decisionBrief?.evidenceCards[0]).not.toHaveProperty('rawDiff');
    expect(JSON.stringify(detail.decisionBrief)).not.toContain('sk-secret123456');
    expect(JSON.stringify(detail.decisionBrief)).not.toContain('abc.def.ghi');
    expect(JSON.stringify(detail.decisionBrief)).not.toContain('plain-secret-value');
    expect(JSON.stringify(detail.decisionBrief)).toContain('[REDACTED]');
  });

  it('normalizes session detail verdict and metadata into SessionDetail shape', async () => {
    installTauriWindow();
    invokeMock.mockResolvedValueOnce({
      entry: {
        id: '2026-05-01/008',
        date: '2026-05-01',
        sessionId: '008',
        status: 'completed',
      },
      verdict: {
        decision: 'ACCEPT',
        reasoning: 'Looks good.',
        discussions: [{ id: 'd1' }],
        findings: [{ severity: 'SUGGESTION', filePath: 'src/c.ts', title: 'Note' }],
      },
      metadata: { completedAt: 1710000000000 },
    });

    const bridge = await importBridge();
    const detail = await bridge.getSessionDetail('2026-05-01/008');

    expect(invokeMock.mock.calls[0]?.[0]).toBe('get_session_detail');
    expect(invokeMock.mock.calls[0]?.[1]).toEqual({ id: '2026-05-01/008', forceRefresh: false });
    expect(detail).toMatchObject({
      id: '2026-05-01/008',
      decision: 'ACCEPT',
      reasoning: 'Looks good.',
      markdown: expect.any(String),
      evidenceCount: 1,
      discussionsCount: 1,
      findings: [expect.objectContaining({ severity: 'SUGGESTION', filePath: 'src/c.ts', title: 'Note' })],
    });
  });

  it('returns native repo info without fallback mutation', async () => {
    installTauriWindow();
    const nativeRepoInfo = {
      path: '/repo',
      gitRoot: '/repo',
      isGitRepo: true,
      branch: 'main',
      headSha: 'abc123',
      dirtyFileCount: 2,
      hasConfig: true,
      configPath: '/repo/.ca/config.json',
      reviewIgnorePath: '/repo/.reviewignore',
      reviewRulesPath: '/repo/.reviewrules',
      sessionsRoot: '/repo/.ca/sessions',
      sessionCount: 9,
      trusted: true,
      trustReason: 'native',
    };
    invokeMock.mockResolvedValueOnce(nativeRepoInfo);

    const bridge = await importBridge();
    const repoInfo = await bridge.getRepoInfo();

    expect(repoInfo).toEqual(nativeRepoInfo);
    expect(invokeMock.mock.calls[0]?.[0]).toBe('get_repo_info');
    expect(invokeMock.mock.calls[0]?.[1]).toEqual({});
  });
});
