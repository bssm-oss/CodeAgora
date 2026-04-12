/**
 * Auth Route
 * POST /api/auth — Validate Bearer token and set httpOnly session cookie.
 * DELETE /api/auth — Clear the session cookie.
 */

import crypto from 'crypto';
import { Hono } from 'hono';
import { getAuthToken, compareTokens, AUTH_COOKIE_NAME } from '../middleware.js';

export const authRoutes = new Hono();

/**
 * POST /api/auth — Exchange a Bearer token for an httpOnly cookie.
 * The client sends { token } in the body or Authorization header.
 */
authRoutes.post('/', (c) => {
  const authHeader = c.req.header('Authorization');
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!headerToken || !compareTokens(headerToken, getAuthToken())) {
    return c.json({ error: 'Invalid token' }, 403);
  }

  // Set httpOnly cookie with HMAC-derived session token (not the raw secret)
  const isSecure = c.req.url.startsWith('https://');
  const nonce = crypto.randomBytes(16).toString('hex');
  const cookieValue = `${nonce}.${crypto.createHmac('sha256', getAuthToken()).update(nonce).digest('hex')}`;
  const cookieParts = [
    `${AUTH_COOKIE_NAME}=${cookieValue}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=86400', // 24h
  ];
  if (isSecure) cookieParts.push('Secure');

  c.header('Set-Cookie', cookieParts.join('; '));
  return c.json({ status: 'authenticated' });
});

/**
 * DELETE /api/auth — Clear the session cookie (logout).
 */
authRoutes.delete('/', (c) => {
  c.header('Set-Cookie', `${AUTH_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  return c.json({ status: 'logged_out' });
});
