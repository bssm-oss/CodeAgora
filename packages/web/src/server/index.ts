/**
 * CodeAgora Web Server
 * Hono-based REST API + WebSocket server for the web dashboard.
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { sessionRoutes } from './routes/sessions.js';
import { modelRoutes } from './routes/models.js';
import { configRoutes } from './routes/config.js';
import { costRoutes } from './routes/costs.js';
import { notificationRoutes } from './routes/notifications.js';
import { healthRoutes } from './routes/health.js';
import { reviewRoutes } from './routes/review.js';
import { authRoutes } from './routes/auth.js';
import {
  corsMiddleware,
  errorHandler,
  authMiddleware,
  getAuthToken,
  securityHeaders,
  rateLimiter,
  setCorsOrigins,
} from './middleware.js';
import { setupWebSocket } from './ws.js';
import { logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

export interface ServerOptions {
  port?: number;
  hostname?: string;
}

// ============================================================================
// App Factory
// ============================================================================

/**
 * Create the Hono application with all route groups mounted.
 */
export function createApp(): Hono {
  const app = new Hono();

  // Middleware
  app.use('*', securityHeaders);
  app.use('*', corsMiddleware);
  app.use('*', errorHandler);
  app.use('/api/*', rateLimiter);
  app.use('/api/*', authMiddleware);

  // API routes
  app.route('/api/auth', authRoutes);
  app.route('/api/health', healthRoutes);
  app.route('/api/sessions', sessionRoutes);
  app.route('/api/models', modelRoutes);
  app.route('/api/config', configRoutes);
  app.route('/api/costs', costRoutes);
  app.route('/api/notifications', notificationRoutes);
  app.route('/api/review', reviewRoutes);

  // Serve static frontend files in production
  app.use(
    '/*',
    serveStatic({ root: './dist/frontend' }),
  );

  // SPA fallback — serve index.html for all unmatched non-API routes
  app.get('*', serveStatic({ path: './dist/frontend/index.html' }));

  return app;
}

// ============================================================================
// Server Start
// ============================================================================

/**
 * Start the HTTP server with WebSocket upgrade support.
 */
export function startServer(options: ServerOptions = {}): {
  close: () => void;
} {
  const port = options.port ?? (Number(process.env['PORT']) || 6274);
  const hostname = options.hostname ?? '127.0.0.1';

  setCorsOrigins(port);

  const app = createApp();
  const { injectWebSocket } = setupWebSocket(app);

  const server = serve(
    { fetch: app.fetch, port, hostname },
    (info) => {
      const token = getAuthToken();
      logger.info({ url: `http://${hostname}:${info.port}`, token }, 'CodeAgora dashboard started');
      if (!process.env['CODEAGORA_DASHBOARD_TOKEN']) {
        logger.info('Token persisted to .ca/dashboard-token — set CODEAGORA_DASHBOARD_TOKEN to override');
      }
    },
  );

  injectWebSocket(server);

  return {
    close: () => {
      server.close();
    },
  };
}

// ============================================================================
// Auto-start when run directly
// ============================================================================

const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('/server/index.ts') ||
    process.argv[1].endsWith('/server/index.js'));

if (isDirectRun) {
  startServer();
}
