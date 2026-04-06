/**
 * Server Middleware
 * CORS, auth, security headers, rate limiting, and error handling middleware.
 */

import crypto from 'crypto';
import type { Context, Next } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// ============================================================================
// Auth
// ============================================================================

const DASHBOARD_TOKEN =
  process.env['CODEAGORA_DASHBOARD_TOKEN'] ?? 'demo-token-2026';

export function getAuthToken(): string {
  return DASHBOARD_TOKEN;
}

/**
 * Timing-safe token comparison — prevents byte-by-byte brute-force via response timing.
 * Returns false for null/undefined inputs without throwing.
 */
export function compareTokens(received: string | null | undefined, expected: string): boolean {
  if (!received) return false;
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  if (c.req.path === '/api/health') {
    await next();
    return;
  }
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  if (!compareTokens(token, DASHBOARD_TOKEN)) {
    return c.json({ error: 'Invalid token' }, 403);
  }
  await next();
}

// ============================================================================
// Security Headers
// ============================================================================

export async function securityHeaders(c: Context, next: Next): Promise<Response | void> {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '0');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;",
  );
  await next();
}

// ============================================================================
// Rate Limiter
// ============================================================================

const TRUST_PROXY = process.env['CODEAGORA_TRUST_PROXY'] === 'true';

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export async function rateLimiter(c: Context, next: Next): Promise<Response | void> {
  const ip = TRUST_PROXY
    ? (c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'local')
    : 'local';
  const now = Date.now();
  // Prune expired entries to prevent unbounded memory growth (#388)
  for (const [key, entry] of requestCounts) {
    if (now > entry.resetAt) requestCounts.delete(key);
  }
  const entry = requestCounts.get(ip);
  const isWrite =
    c.req.method === 'PUT' || c.req.method === 'POST' || c.req.method === 'DELETE';
  const limit = isWrite ? 10 : 100;
  const windowMs = 60_000;
  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count++;
    if (entry.count > limit) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
  }
  await next();
}

/**
 * CORS middleware — allows localhost origins in development.
 */
export async function corsMiddleware(c: Context, next: Next): Promise<Response> {
  const origin = c.req.header('Origin') ?? '';
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  if (isLocalhost) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('Access-Control-Max-Age', '86400');
  }

  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  await next();
  return c.res;
}

/**
 * JSON error handler — catches unhandled errors and returns structured JSON.
 */
export async function errorHandler(c: Context, next: Next): Promise<Response> {
  try {
    await next();
    return c.res;
  } catch (error: unknown) {
    const isDev = process.env['NODE_ENV'] === 'development';
    const message = isDev && error instanceof Error ? error.message : 'Internal server error';
    const status = ((error as { status?: number }).status ?? 500) as ContentfulStatusCode;
    return c.json({ error: message }, status);
  }
}
