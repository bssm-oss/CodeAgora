/**
 * API Integration Test — Auth Endpoints
 * Tests POST /api/auth (login), DELETE /api/auth (logout), and auth middleware
 * through the full createApp() middleware stack.
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

// ============================================================================
// Constants
// ============================================================================

const VALID_TOKEN = 'test-auth-integration-token-64chars-padded-to-correct-length00';

// ============================================================================
// Test Suite
// ============================================================================

describe('API Integration — /api/auth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('CODEAGORA_DASHBOARD_TOKEN', VALID_TOKEN);
  });

  async function getApp() {
    const { createApp } = await import('../index.js');
    return createApp();
  }

  // --------------------------------------------------------------------------
  // POST /api/auth — Token exchange
  // --------------------------------------------------------------------------

  describe('POST /api/auth — token exchange', () => {
    it('returns 403 when no Authorization header is provided', async () => {
      const app = await getApp();
      const res = await app.request('/api/auth', { method: 'POST' });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Invalid token');
    });

    it('returns 403 for wrong Bearer token', async () => {
      const app = await getApp();
      const res = await app.request('/api/auth', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-token-entirely' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Invalid token');
    });

    it('returns 200 with Set-Cookie for correct Bearer token', async () => {
      const app = await getApp();
      const res = await app.request('/api/auth', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('authenticated');

      // Should set httpOnly session cookie
      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain('codeagora-session=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
      expect(setCookie).toContain('Path=/');
    });

    it('POST /api/auth is exempt from auth middleware (allows login without prior auth)', async () => {
      const app = await getApp();

      // Even though authMiddleware runs on /api/*, POST /api/auth is skipped
      const res = await app.request('/api/auth', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      });

      // Should reach the auth route handler, not get blocked by middleware
      expect(res.status).toBe(200);
    });
  });

  // --------------------------------------------------------------------------
  // DELETE /api/auth — Logout
  // --------------------------------------------------------------------------

  describe('DELETE /api/auth — logout', () => {
    it('returns 401 when no auth credentials provided', async () => {
      const app = await getApp();
      const res = await app.request('/api/auth', { method: 'DELETE' });

      // DELETE /api/auth is NOT exempt from auth middleware (only POST is)
      expect(res.status).toBe(401);
    });

    it('returns 200 and clears cookie when authenticated via Bearer', async () => {
      const app = await getApp();
      const res = await app.request('/api/auth', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('logged_out');

      // Should set cookie with Max-Age=0 to clear it
      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toContain('Max-Age=0');
    });
  });

  // --------------------------------------------------------------------------
  // Cookie-based auth flow (end-to-end login -> use cookie -> logout)
  // --------------------------------------------------------------------------

  describe('Cookie-based auth flow', () => {
    it('login -> access protected route with cookie -> logout', async () => {
      const app = await getApp();

      // Step 1: Login with Bearer token
      const loginRes = await app.request('/api/auth', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      });
      expect(loginRes.status).toBe(200);

      const setCookieHeader = loginRes.headers.get('Set-Cookie');
      expect(setCookieHeader).toBeTruthy();

      // Extract the cookie value
      const cookieMatch = setCookieHeader!.match(/codeagora-session=([^;]+)/);
      expect(cookieMatch).toBeTruthy();
      const cookieValue = cookieMatch![1];

      // Step 2: Access protected endpoint using the session cookie
      const sessionsRes = await app.request('/api/sessions', {
        headers: { Cookie: `codeagora-session=${cookieValue}` },
      });
      expect(sessionsRes.status).toBe(200);

      // Step 3: Logout using the cookie
      const logoutRes = await app.request('/api/auth', {
        method: 'DELETE',
        headers: { Cookie: `codeagora-session=${cookieValue}` },
      });
      expect(logoutRes.status).toBe(200);
      const logoutBody = await logoutRes.json();
      expect(logoutBody.status).toBe('logged_out');
    });
  });

  // --------------------------------------------------------------------------
  // Auth middleware on protected routes
  // --------------------------------------------------------------------------

  describe('Auth middleware on protected routes', () => {
    it('returns 401 for protected endpoint with no credentials', async () => {
      const app = await getApp();
      const res = await app.request('/api/sessions');

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Authentication required');
    });

    it('returns 403 for protected endpoint with invalid Bearer token', async () => {
      const app = await getApp();
      const res = await app.request('/api/sessions', {
        headers: { Authorization: 'Bearer invalid-token-here' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Invalid token');
    });

    it('returns 200 for protected endpoint with valid Bearer token', async () => {
      const app = await getApp();
      const res = await app.request('/api/sessions', {
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.status).toBe(200);
    });

    it('returns 403 for invalid session cookie', async () => {
      const app = await getApp();
      const res = await app.request('/api/sessions', {
        headers: { Cookie: 'codeagora-session=forged.fakecookievalue' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Invalid token');
    });

    it('returns 401 when Authorization header uses Basic scheme instead of Bearer', async () => {
      const app = await getApp();
      const res = await app.request('/api/sessions', {
        headers: { Authorization: `Basic ${VALID_TOKEN}` },
      });

      expect(res.status).toBe(401);
    });
  });
});
