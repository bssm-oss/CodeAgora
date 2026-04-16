/**
 * API Integration Test — WebSocket Security
 * Tests WebSocket endpoint authentication and origin validation
 * through the full createApp() + setupWebSocket() middleware stack.
 *
 * Note: Hono's app.request() cannot perform real WebSocket upgrades,
 * so we test the HTTP-level security guards (auth, origin, connection limit)
 * that run before the upgrade happens.
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
    upgradeWebSocket: vi.fn(() => {
      // Return a no-op middleware (the actual WS upgrade can't happen in test)
      return async (_c: unknown, next: () => Promise<void>) => { await next(); };
    }),
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

// ============================================================================
// Constants
// ============================================================================

const VALID_TOKEN = 'ws-integration-test-token-padded-to-make-64-hex-chars-here0000';

// ============================================================================
// Test Suite
// ============================================================================

describe('API Integration — WebSocket Security', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('CODEAGORA_DASHBOARD_TOKEN', VALID_TOKEN);
  });

  /**
   * Build app with WS routes registered (mirrors startServer flow).
   * createApp() alone does NOT register /ws — setupWebSocket() does.
   */
  async function getAppWithWs() {
    const { createApp } = await import('../index.js');
    const { setupWebSocket } = await import('../ws.js');
    const app = createApp();
    setupWebSocket(app);
    return app;
  }

  // --------------------------------------------------------------------------
  // WS endpoint auth — requires token
  // --------------------------------------------------------------------------

  describe('/ws authentication', () => {
    it('returns 401 when no auth credentials provided', async () => {
      const app = await getAppWithWs();

      const res = await app.request('/ws');
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toBe('Authentication required');
    });

    it('returns 401 for wrong Bearer token', async () => {
      const app = await getAppWithWs();

      const res = await app.request('/ws', {
        headers: { Authorization: 'Bearer wrong-token-here' },
      });

      // The ws.ts guard checks auth and returns 401 for bad token
      expect([401, 403]).toContain(res.status);
    });

    it('accepts valid Bearer token on /ws', async () => {
      const app = await getAppWithWs();

      const res = await app.request('/ws', {
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      });

      // With valid auth, the request reaches the upgradeWebSocket handler.
      // Since we're not doing a real WS upgrade, Hono will either proceed
      // through the mock handler or return a non-auth-error status.
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('accepts auth via sec-websocket-protocol token header', async () => {
      const app = await getAppWithWs();

      const res = await app.request('/ws', {
        headers: {
          'sec-websocket-protocol': `token.${VALID_TOKEN}`,
        },
      });

      // Valid protocol token should pass auth
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  // --------------------------------------------------------------------------
  // WS endpoint origin validation
  // --------------------------------------------------------------------------

  describe('/ws origin validation', () => {
    it('rejects requests from external origins', async () => {
      const app = await getAppWithWs();

      // Without setCorsOrigins being called, allowedOrigins is null,
      // so isAllowedOrigin returns false for any non-empty origin.
      const res = await app.request('/ws', {
        headers: {
          Origin: 'https://evil-site.com',
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      // Should be rejected by origin check
      expect(res.status).toBe(403);
    });

    it('allows requests without Origin header (same-origin / non-browser)', async () => {
      const app = await getAppWithWs();

      // No Origin header = same-origin, should pass origin check
      const res = await app.request('/ws', {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      // Should not be blocked by origin validation
      expect(res.status).not.toBe(403);
    });

    it('allows requests from configured localhost origin after setCorsOrigins', async () => {
      const { setCorsOrigins } = await import('../middleware.js');
      setCorsOrigins(6274);

      const app = await getAppWithWs();

      const res = await app.request('/ws', {
        headers: {
          Origin: 'http://localhost:6274',
          Authorization: `Bearer ${VALID_TOKEN}`,
        },
      });

      expect(res.status).not.toBe(403);
    });
  });

  // --------------------------------------------------------------------------
  // WS module exports
  // --------------------------------------------------------------------------

  describe('WebSocket module exports', () => {
    it('setupWebSocket returns injectWebSocket function', async () => {
      const { setupWebSocket } = await import('../ws.js');
      const { Hono } = await import('hono');
      const app = new Hono();

      const result = setupWebSocket(app);
      expect(result).toHaveProperty('injectWebSocket');
      expect(typeof result.injectWebSocket).toBe('function');
    });

    it('setEmitters accepts null without error', async () => {
      const { setEmitters } = await import('../ws.js');
      expect(() => setEmitters(null, null)).not.toThrow();
    });

    it('setEmitters accepts mock emitters without error', async () => {
      const { setEmitters } = await import('../ws.js');

      const mockProgress = { onProgress: vi.fn(), removeListener: vi.fn() };
      const mockDiscussion = { on: vi.fn(), removeListener: vi.fn() };

      expect(() => setEmitters(mockProgress as never, mockDiscussion as never)).not.toThrow();
    });
  });
});
