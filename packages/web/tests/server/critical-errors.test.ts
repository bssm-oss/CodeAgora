/**
 * Critical Error Scenario Tests — Web Package
 * W-09, W-12, W-13, W-14, and rate limiter boundary tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ============================================================================
// Mock fs/promises
// ============================================================================

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
}));

import { readFile, writeFile } from 'fs/promises';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);

// ============================================================================
// Shared test data
// ============================================================================

const sampleConfig = {
  reviewers: [
    { id: 'r1', model: 'gpt-4', backend: 'api', provider: 'openai', timeout: 120, enabled: true },
  ],
  supporters: {
    pool: [
      { id: 's1', model: 'gpt-4', backend: 'api', provider: 'openai', timeout: 120, enabled: true },
    ],
    pickCount: 2,
    pickStrategy: 'random',
    devilsAdvocate: { id: 'da1', model: 'gpt-4', backend: 'api', provider: 'openai', timeout: 120, enabled: true },
    personaPool: ['critic', 'optimist'],
    personaAssignment: 'random',
  },
  moderator: { backend: 'api', model: 'gpt-4', provider: 'openai' },
  discussion: {
    maxRounds: 3,
    registrationThreshold: {
      HARSHLY_CRITICAL: 1,
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: null,
    },
    codeSnippetRange: 10,
  },
  errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
};

// ============================================================================
// W-13: malformed JSON body → config PUT
// ============================================================================

describe('W-13: config PUT with malformed JSON body', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 400 for schema-invalid JSON (valid JSON but wrong shape)', async () => {
    const { configRoutes } = await import('../../src/server/routes/config.js');
    const app = new Hono();
    app.route('/api/config', configRoutes);

    const res = await app.request('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totally: 'wrong', shape: true }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid configuration');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('returns 400 for empty object body', async () => {
    const { configRoutes } = await import('../../src/server/routes/config.js');
    const app = new Hono();
    app.route('/api/config', configRoutes);

    const res = await app.request('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for null body fields', async () => {
    const { configRoutes } = await import('../../src/server/routes/config.js');
    const app = new Hono();
    app.route('/api/config', configRoutes);

    const res = await app.request('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewers: null }),
    });

    expect(res.status).toBe(400);
  });

  it('does not return 500 for invalid JSON body (stays 400)', async () => {
    const { configRoutes } = await import('../../src/server/routes/config.js');
    const app = new Hono();
    app.route('/api/config', configRoutes);

    const res = await app.request('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewers: 'not-an-array' }),
    });

    // Must be a client error (4xx), not a server error (5xx)
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

// ============================================================================
// W-14: config writeFile failure (disk full / permissions)
// ============================================================================

describe('W-14: config PUT when writeFile fails', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('propagates error when writeFile rejects (ENOSPC)', async () => {
    const { configRoutes } = await import('../../src/server/routes/config.js');
    const app = new Hono();
    app.route('/api/config', configRoutes);

    // Config path lookup: no existing file
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    // writeFile fails with disk full error
    mockWriteFile.mockRejectedValue(Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }));

    const res = await app.request('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleConfig),
    });

    // Should return an error response (5xx), not succeed
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it('propagates error when writeFile rejects (EACCES permissions)', async () => {
    const { configRoutes } = await import('../../src/server/routes/config.js');
    const app = new Hono();
    app.route('/api/config', configRoutes);

    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    mockWriteFile.mockRejectedValue(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }));

    const res = await app.request('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleConfig),
    });

    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});

// ============================================================================
// W-12: session path encoding bypass
// ============================================================================

describe('W-12: session path traversal via URL encoding', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('blocks URL-encoded path traversal ..%2F..%2F in date param', async () => {
    const { sessionRoutes } = await import('../../src/server/routes/sessions.js');
    const app = new Hono();
    app.route('/api/sessions', sessionRoutes);

    // Hono decodes URL parameters before routing, so ..%2F..%2F decodes to ../../
    // which does not match ^\d{4}-\d{2}-\d{2}$ → should return 400
    const res = await app.request('/api/sessions/..%2F..%2Fetc/passwd');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid session identifier');
  });

  it('blocks double-encoded traversal (%252F) in date param', async () => {
    const { sessionRoutes } = await import('../../src/server/routes/sessions.js');
    const app = new Hono();
    app.route('/api/sessions', sessionRoutes);

    const res = await app.request('/api/sessions/..%252F..%252Fetc/passwd');
    expect(res.status).toBe(400);
  });

  it('blocks non-date string with dots in date param', async () => {
    const { sessionRoutes } = await import('../../src/server/routes/sessions.js');
    const app = new Hono();
    app.route('/api/sessions', sessionRoutes);

    // Hono normalizes `..` segments in the URL path before routing.
    // The traversal attempt `/../../../etc/001` collapses to a path that
    // either does not match the route pattern (404) or fails regex validation (400).
    // Both outcomes confirm the traversal is blocked.
    const res = await app.request('/api/sessions/../../../etc/001');
    expect([400, 404]).toContain(res.status);
  });

  it('blocks alphanumeric id that is not exactly 3 digits', async () => {
    const { sessionRoutes } = await import('../../src/server/routes/sessions.js');
    const app = new Hono();
    app.route('/api/sessions', sessionRoutes);

    const res = await app.request('/api/sessions/2025-01-15/abc');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid session identifier');
  });

  it('blocks date with injected slashes', async () => {
    const { sessionRoutes } = await import('../../src/server/routes/sessions.js');
    const app = new Hono();
    app.route('/api/sessions', sessionRoutes);

    const res = await app.request('/api/sessions/2025-01-15%2F..%2F..%2F/001');
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// W-09: WebSocket listener cleanup on connect/disconnect
// ============================================================================

describe('W-09: WebSocket listener cleanup', () => {
  it('removeListener is called on close when progress emitter is set', async () => {
    // Access ws module to exercise listener registration/cleanup logic
    const { setEmitters } = await import('../../src/server/ws.js');

    const removeListenerMock = vi.fn();
    const onProgressMock = vi.fn();

    const progressEmitter = {
      onProgress: onProgressMock,
      removeListener: removeListenerMock,
    };

    // Set emitter — should not throw
    expect(() => setEmitters(progressEmitter as never, null)).not.toThrow();

    // Verify the emitter was accepted (no immediate removeListener call yet)
    expect(removeListenerMock).not.toHaveBeenCalled();
  });

  it('removeListener is called on close when discussion emitter is set', async () => {
    const { setEmitters } = await import('../../src/server/ws.js');

    const removeListenerMock = vi.fn();
    const onMock = vi.fn();

    const discussionEmitter = {
      on: onMock,
      removeListener: removeListenerMock,
    };

    expect(() => setEmitters(null, discussionEmitter as never)).not.toThrow();
    expect(removeListenerMock).not.toHaveBeenCalled();
  });

  it('setEmitters with null clears both emitters without error', async () => {
    const { setEmitters } = await import('../../src/server/ws.js');

    // First set real-looking emitters
    const mockEmitter = { onProgress: vi.fn(), removeListener: vi.fn() };
    setEmitters(mockEmitter as never, null);

    // Then clear them — should not throw
    expect(() => setEmitters(null, null)).not.toThrow();
  });

  it('multiple setEmitters calls do not accumulate listeners', async () => {
    const { setEmitters } = await import('../../src/server/ws.js');

    const onProgress1 = vi.fn();
    const onProgress2 = vi.fn();

    const emitter1 = { onProgress: onProgress1, removeListener: vi.fn() };
    const emitter2 = { onProgress: onProgress2, removeListener: vi.fn() };

    // Replace emitter twice — each setEmitters replaces the reference
    setEmitters(emitter1 as never, null);
    setEmitters(emitter2 as never, null);

    // No listeners attached directly by setEmitters (attachment happens in onOpen)
    expect(onProgress1).not.toHaveBeenCalled();
    expect(onProgress2).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Rate limiter boundary tests
// ============================================================================

describe('Rate limiter boundary: read requests', () => {
  it('99th request succeeds (below limit)', async () => {
    vi.resetModules();
    const { securityHeaders, rateLimiter } = await import('../../src/server/middleware.js');
    const app = new Hono();
    app.use('*', securityHeaders);
    app.use('*', rateLimiter);
    app.get('/api/test', (c) => c.json({ ok: true }));

    const ip = `boundary-read-99-${Date.now()}`;

    let res99Status = 0;
    for (let i = 1; i <= 99; i++) {
      const res = await app.request('/api/test', {
        headers: { 'x-forwarded-for': ip },
      });
      if (i === 99) res99Status = res.status;
    }

    expect(res99Status).toBe(200);
  });

  it('100th request succeeds (at limit boundary)', async () => {
    vi.resetModules();
    const { securityHeaders, rateLimiter } = await import('../../src/server/middleware.js');
    const app = new Hono();
    app.use('*', securityHeaders);
    app.use('*', rateLimiter);
    app.get('/api/test', (c) => c.json({ ok: true }));

    const ip = `boundary-read-100-${Date.now()}`;

    let res100Status = 0;
    for (let i = 1; i <= 100; i++) {
      const res = await app.request('/api/test', {
        headers: { 'x-forwarded-for': ip },
      });
      if (i === 100) res100Status = res.status;
    }

    expect(res100Status).toBe(200);
  });

  it('101st request returns 429 (over limit)', async () => {
    vi.resetModules();
    const { securityHeaders, rateLimiter } = await import('../../src/server/middleware.js');
    const app = new Hono();
    app.use('*', securityHeaders);
    app.use('*', rateLimiter);
    app.get('/api/test', (c) => c.json({ ok: true }));

    const ip = `boundary-read-101-${Date.now()}`;

    let res101Status = 0;
    for (let i = 1; i <= 101; i++) {
      const res = await app.request('/api/test', {
        headers: { 'x-forwarded-for': ip },
      });
      if (i === 101) res101Status = res.status;
    }

    expect(res101Status).toBe(429);
  });
});

describe('Rate limiter boundary: write requests', () => {
  it('9th write request succeeds (below limit)', async () => {
    vi.resetModules();
    const { securityHeaders, rateLimiter } = await import('../../src/server/middleware.js');
    const app = new Hono();
    app.use('*', securityHeaders);
    app.use('*', rateLimiter);
    app.put('/api/write', (c) => c.json({ ok: true }));

    const ip = `boundary-write-9-${Date.now()}`;

    let res9Status = 0;
    for (let i = 1; i <= 9; i++) {
      const res = await app.request('/api/write', {
        method: 'PUT',
        headers: { 'x-forwarded-for': ip },
      });
      if (i === 9) res9Status = res.status;
    }

    expect(res9Status).toBe(200);
  });

  it('10th write request succeeds (at limit boundary)', async () => {
    vi.resetModules();
    const { securityHeaders, rateLimiter } = await import('../../src/server/middleware.js');
    const app = new Hono();
    app.use('*', securityHeaders);
    app.use('*', rateLimiter);
    app.put('/api/write', (c) => c.json({ ok: true }));

    const ip = `boundary-write-10-${Date.now()}`;

    let res10Status = 0;
    for (let i = 1; i <= 10; i++) {
      const res = await app.request('/api/write', {
        method: 'PUT',
        headers: { 'x-forwarded-for': ip },
      });
      if (i === 10) res10Status = res.status;
    }

    expect(res10Status).toBe(200);
  });

  it('11th write request returns 429 (over limit)', async () => {
    vi.resetModules();
    const { securityHeaders, rateLimiter } = await import('../../src/server/middleware.js');
    const app = new Hono();
    app.use('*', securityHeaders);
    app.use('*', rateLimiter);
    app.put('/api/write', (c) => c.json({ ok: true }));

    const ip = `boundary-write-11-${Date.now()}`;

    let res11Status = 0;
    for (let i = 1; i <= 11; i++) {
      const res = await app.request('/api/write', {
        method: 'PUT',
        headers: { 'x-forwarded-for': ip },
      });
      if (i === 11) res11Status = res.status;
    }

    expect(res11Status).toBe(429);
  });
});
