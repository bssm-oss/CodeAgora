/**
 * Server Middleware
 * CORS and error handling middleware for the Hono server.
 */

import type { Context, Next } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

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
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = ((error as { status?: number }).status ?? 500) as ContentfulStatusCode;
    return c.json({ error: message }, status);
  }
}
