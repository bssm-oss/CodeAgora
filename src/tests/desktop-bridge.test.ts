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
    expect(sessions).toHaveLength(3);
    expect(sessions[0]).toMatchObject({
      id: expect.any(String),
      status: expect.any(String),
      decision: expect.any(String),
      severityCounts: expect.any(Object),
      topIssues: expect.any(Array),
    });

    const detail = await bridge.getSessionDetail(sessions[0].id);
    expect(detail).toMatchObject({
      id: sessions[0].id,
      markdown: expect.any(String),
      evidenceCount: expect.any(Number),
      discussionsCount: expect.any(Number),
    });

    const raw = '{"reviewers":[]}';
    expect(await bridge.validateConfig(raw)).toMatchObject({ valid: true, errors: [], warnings: [] });

    expect(await bridge.validateConfig('not json')).toMatchObject({ valid: false, errors: expect.any(Array), warnings: [] });

    expect(await bridge.readConfig()).toMatchObject({ path: '.ca/config.json', raw: '{"language":"en"}' });

    expect(await bridge.writeConfig(raw)).toMatchObject({ path: '.ca/config.json', raw });
    expect(window.localStorage.getItem('codeagora.desktop.config')).toBe(raw);

    expect(await bridge.getRepoInfo()).toMatchObject({
      isGitRepo: false,
      trusted: false,
      trustReason: expect.any(String),
      sessionsRoot: '.ca/sessions',
    });
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
      severityCounts: { CRITICAL: 1, WARNING: 1 },
      topIssues: [
        expect.objectContaining({ severity: 'CRITICAL', filePath: 'src/a.ts', title: 'Bug' }),
        expect.objectContaining({ severity: 'WARNING', filePath: 'src/b.ts', title: 'Smell' }),
      ],
    });
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
