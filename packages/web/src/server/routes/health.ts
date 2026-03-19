/**
 * Health Check Route
 * GET /api/health — returns server status, version, and uptime.
 */

import { Hono } from 'hono';

const startTime = Date.now();

export const healthRoutes = new Hono();

healthRoutes.get('/', (c) => {
  return c.json({
    status: 'ok',
    version: '2.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});
