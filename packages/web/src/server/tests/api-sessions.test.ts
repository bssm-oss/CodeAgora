/**
 * API Integration Test — Session Endpoints
 * Tests /api/sessions list/detail/sub-routes through the full createApp()
 * middleware stack (auth, security headers, rate limiting).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('fs/promises', () => ({
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn().mockImplementation(() => { throw new Error('ENOENT'); }),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  readFileSync: vi.fn().mockImplementation(() => { throw new Error('ENOENT'); }),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('@hono/node-server/serve-static', () => ({
  serveStatic: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => { await next(); }),
}));

vi.mock('@hono/node-ws', () => ({
  createNodeWebSocket: vi.fn(() => ({
    injectWebSocket: vi.fn(),
    upgradeWebSocket: vi.fn(() => vi.fn()),
  })),
}));

vi.mock('@codeagora/core/pipeline/progress.js', () => ({
  ProgressEmitter: vi.fn(),
}));

vi.mock('@codeagora/core/l2/event-emitter.js', () => ({
  DiscussionEmitter: vi.fn(),
}));

vi.mock('@codeagora/core/pipeline/orchestrator.js', () => ({
  runPipeline: vi.fn(),
}));

import { readdir, readFile } from 'fs/promises';

const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);

// ============================================================================
// Constants
// ============================================================================

const VALID_TOKEN = 'integration-sessions-token-padded-to-64-hex-chars-for-test0000';

const sampleMetadata = {
  sessionId: '001',
  date: '2025-01-15',
  timestamp: 1705312800000,
  diffPath: 'test.diff',
  status: 'completed',
  startedAt: 1705312800000,
  completedAt: 1705312900000,
};

const sampleReview = {
  reviewerId: 'reviewer-1',
  model: 'gpt-4',
  group: 'src/',
  evidenceDocs: [],
  rawResponse: 'No issues found',
  status: 'success',
};

// ============================================================================
// Helpers
// ============================================================================

function authHeaders() {
  return { Authorization: `Bearer ${VALID_TOKEN}` };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('API Integration — /api/sessions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubEnv('CODEAGORA_DASHBOARD_TOKEN', VALID_TOKEN);

    // Reset readdir/readFile defaults
    mockReaddir.mockResolvedValue([] as unknown as ReturnType<typeof readdir>);
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
  });

  async function getApp() {
    // Invalidate session cache before each app creation
    const { invalidateSessionCache } = await import('../routes/sessions.js');
    invalidateSessionCache();
    const { createApp } = await import('../index.js');
    return createApp();
  }

  // --------------------------------------------------------------------------
  // Auth enforcement
  // --------------------------------------------------------------------------

  describe('auth enforcement', () => {
    it('returns 401 for GET /api/sessions without auth', async () => {
      const app = await getApp();
      const res = await app.request('/api/sessions');
      expect(res.status).toBe(401);
    });

    it('returns 401 for GET /api/sessions/:date/:id without auth', async () => {
      const app = await getApp();
      const res = await app.request('/api/sessions/2025-01-15/001');
      expect(res.status).toBe(401);
    });

    it('returns 403 for invalid Bearer token on sessions', async () => {
      const app = await getApp();
      const res = await app.request('/api/sessions', {
        headers: { Authorization: 'Bearer bad-token' },
      });
      expect(res.status).toBe(403);
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/sessions — list
  // --------------------------------------------------------------------------

  describe('GET /api/sessions — list', () => {
    it('returns empty list when no sessions exist', async () => {
      mockReaddir.mockRejectedValue(new Error('ENOENT'));

      const app = await getApp();
      const res = await app.request('/api/sessions', { headers: authHeaders() });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ items: [], total: 0, page: 1, limit: 50 });
    });

    it('returns session list with default pagination', async () => {
      mockReaddir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.endsWith('sessions')) return ['2025-01-15'] as unknown as ReturnType<typeof readdir>;
        if (p.endsWith('2025-01-15')) return ['001'] as unknown as ReturnType<typeof readdir>;
        return [] as unknown as ReturnType<typeof readdir>;
      });

      mockReadFile.mockResolvedValue(JSON.stringify(sampleMetadata));

      const app = await getApp();
      const res = await app.request('/api/sessions', { headers: authHeaders() });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(50);
      expect(body.items[0].sessionId).toBe('001');
    });

    it('supports pagination via page and limit query params', async () => {
      // Create 3 sessions to test pagination
      const sessions = [
        { ...sampleMetadata, sessionId: '001', date: '2025-01-15' },
        { ...sampleMetadata, sessionId: '002', date: '2025-01-15' },
        { ...sampleMetadata, sessionId: '003', date: '2025-01-15' },
      ];

      mockReaddir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.endsWith('sessions')) return ['2025-01-15'] as unknown as ReturnType<typeof readdir>;
        if (p.endsWith('2025-01-15')) return ['001', '002', '003'] as unknown as ReturnType<typeof readdir>;
        return [] as unknown as ReturnType<typeof readdir>;
      });

      let callIndex = 0;
      mockReadFile.mockImplementation(async () => {
        const session = sessions[callIndex % sessions.length];
        callIndex++;
        return JSON.stringify(session);
      });

      const app = await getApp();
      const res = await app.request('/api/sessions?page=1&limit=2', { headers: authHeaders() });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(3);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(2);
    });

    it('supports status filter', async () => {
      const completed = { ...sampleMetadata, sessionId: '001', status: 'completed' };
      const failed = { ...sampleMetadata, sessionId: '002', status: 'failed' };

      mockReaddir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.endsWith('sessions')) return ['2025-01-15'] as unknown as ReturnType<typeof readdir>;
        if (p.endsWith('2025-01-15')) return ['001', '002'] as unknown as ReturnType<typeof readdir>;
        return [] as unknown as ReturnType<typeof readdir>;
      });

      let callIdx = 0;
      mockReadFile.mockImplementation(async () => {
        const s = [completed, failed][callIdx % 2];
        callIdx++;
        return JSON.stringify(s);
      });

      const app = await getApp();
      const res = await app.request('/api/sessions?status=failed', { headers: authHeaders() });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].status).toBe('failed');
    });

    it('supports search filter on sessionId', async () => {
      mockReaddir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.endsWith('sessions')) return ['2025-01-15'] as unknown as ReturnType<typeof readdir>;
        if (p.endsWith('2025-01-15')) return ['001'] as unknown as ReturnType<typeof readdir>;
        return [] as unknown as ReturnType<typeof readdir>;
      });

      mockReadFile.mockResolvedValue(JSON.stringify(sampleMetadata));

      const app = await getApp();

      // Search matching
      const res1 = await app.request('/api/sessions?search=001', { headers: authHeaders() });
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.items).toHaveLength(1);
    });

    it('includes security headers on list response', async () => {
      const app = await getApp();
      const res = await app.request('/api/sessions', { headers: authHeaders() });

      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/sessions/:date/:id — detail
  // --------------------------------------------------------------------------

  describe('GET /api/sessions/:date/:id — detail', () => {
    it('returns full session detail with metadata, reviews, discussions, rounds, verdict', async () => {
      mockReadFile.mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.includes('metadata.json')) return JSON.stringify(sampleMetadata);
        if (p.includes('head-verdict.json')) return JSON.stringify({ decision: 'ACCEPT' });
        if (p.includes('test.diff')) return 'diff --git a/foo.ts\n+line';
        return '{}';
      });

      mockReaddir.mockResolvedValue([] as unknown as ReturnType<typeof readdir>);

      const app = await getApp();
      const res = await app.request('/api/sessions/2025-01-15/001', { headers: authHeaders() });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metadata.sessionId).toBe('001');
      expect(body.verdict.decision).toBe('ACCEPT');
      expect(body).toHaveProperty('reviews');
      expect(body).toHaveProperty('discussions');
      expect(body).toHaveProperty('rounds');
      expect(body).toHaveProperty('diff');
    });

    it('returns 404 for non-existent session', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const app = await getApp();
      const res = await app.request('/api/sessions/2025-01-15/999', { headers: authHeaders() });

      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid date format', async () => {
      const app = await getApp();
      const res = await app.request('/api/sessions/bad-date/001', { headers: authHeaders() });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid session identifier');
    });

    it('returns 400 for invalid session id format', async () => {
      const app = await getApp();
      const res = await app.request('/api/sessions/2025-01-15/abc', { headers: authHeaders() });

      expect(res.status).toBe(400);
    });

    it('blocks path traversal attempts in date parameter', async () => {
      const app = await getApp();
      const res = await app.request('/api/sessions/..%2F..%2Fetc/001', { headers: authHeaders() });

      expect(res.status).toBe(400);
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/sessions/:date/:id/reviews
  // --------------------------------------------------------------------------

  describe('GET /api/sessions/:date/:id/reviews', () => {
    it('returns review array for valid session', async () => {
      mockReaddir.mockResolvedValue(['reviewer-1.json'] as unknown as ReturnType<typeof readdir>);
      mockReadFile.mockResolvedValue(JSON.stringify(sampleReview));

      const app = await getApp();
      const res = await app.request('/api/sessions/2025-01-15/001/reviews', {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].reviewerId).toBe('reviewer-1');
    });

    it('returns empty array when no reviews exist', async () => {
      mockReaddir.mockResolvedValue([] as unknown as ReturnType<typeof readdir>);

      const app = await getApp();
      const res = await app.request('/api/sessions/2025-01-15/001/reviews', {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('requires auth for reviews sub-endpoint', async () => {
      const app = await getApp();
      const res = await app.request('/api/sessions/2025-01-15/001/reviews');
      expect(res.status).toBe(401);
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/sessions/:date/:id/discussions
  // --------------------------------------------------------------------------

  describe('GET /api/sessions/:date/:id/discussions', () => {
    it('returns discussions array with verdict.md parsed fields', async () => {
      const verdictMd = [
        '**Final Severity:** CRITICAL',
        '**Consensus Reached:** Yes',
        '**Rounds:** 2',
        '## Reasoning',
        'The issue is severe.',
      ].join('\n');

      mockReaddir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.endsWith('/discussions')) return ['disc-001'] as unknown as ReturnType<typeof readdir>;
        if (p.endsWith('/disc-001')) return ['verdict.md'] as unknown as ReturnType<typeof readdir>;
        return [] as unknown as ReturnType<typeof readdir>;
      });

      mockReadFile.mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.includes('verdict.md')) return verdictMd;
        return '{}';
      });

      const app = await getApp();
      const res = await app.request('/api/sessions/2025-01-15/001/discussions', {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].discussionId).toBe('disc-001');
      expect(body[0].finalSeverity).toBe('CRITICAL');
      expect(body[0].consensusReached).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/sessions/:date/:id/verdict
  // --------------------------------------------------------------------------

  describe('GET /api/sessions/:date/:id/verdict', () => {
    it('returns verdict JSON from head-verdict.json', async () => {
      const verdictData = { decision: 'REJECT', reasoning: 'Critical bugs' };

      mockReadFile.mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.includes('head-verdict.json')) return JSON.stringify(verdictData);
        throw new Error('ENOENT');
      });

      const app = await getApp();
      const res = await app.request('/api/sessions/2025-01-15/001/verdict', {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.decision).toBe('REJECT');
    });

    it('returns 404 when no verdict files exist', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const app = await getApp();
      const res = await app.request('/api/sessions/2025-01-15/001/verdict', {
        headers: authHeaders(),
      });

      expect(res.status).toBe(404);
    });
  });
});
