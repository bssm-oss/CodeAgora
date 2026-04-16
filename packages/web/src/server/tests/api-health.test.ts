/**
 * API Integration Test — Health Endpoint
 * Tests /api/health through the full createApp() middleware stack
 * (security headers, CORS, rate limiter, auth bypass).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks — must be declared before importing app modules
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
// Test Suite
// ============================================================================

describe('API Integration — /api/health', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('CODEAGORA_DASHBOARD_TOKEN', 'integration-test-token-abc123');
  });

  async function getApp() {
    const { createApp } = await import('../index.js');
    return createApp();
  }

  it('returns 200 with status ok, version, and uptime — without auth', async () => {
    const app = await getApp();
    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('2.3.3');
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('includes security headers on health response', async () => {
    const app = await getApp();
    const res = await app.request('/api/health');

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-XSS-Protection')).toBe('0');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it('health endpoint is exempt from auth — no Bearer token needed', async () => {
    const app = await getApp();

    // Request without any auth headers
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);

    // Request with invalid auth should still succeed (health is exempt)
    const res2 = await app.request('/api/health', {
      headers: { Authorization: 'Bearer totally-wrong-token' },
    });
    expect(res2.status).toBe(200);
  });

  it('returns valid JSON content-type', async () => {
    const app = await getApp();
    const res = await app.request('/api/health');

    expect(res.headers.get('Content-Type')).toContain('application/json');
  });
});
