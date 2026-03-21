/**
 * WebSocket Handler
 * Real-time event forwarding from ProgressEmitter and DiscussionEmitter.
 */

import type { Hono } from 'hono';
import type { ProgressEmitter, ProgressEvent } from '@codeagora/core/pipeline/progress.js';
import type { DiscussionEmitter, DiscussionEvent } from '@codeagora/core/l2/event-emitter.js';
import { createNodeWebSocket } from '@hono/node-ws';
import { getAuthToken } from './middleware.js';

// ============================================================================
// Connection Limits
// ============================================================================

const MAX_CONNECTIONS = 50;
let activeConnections = 0;

// ============================================================================
// Emitter Registry
// ============================================================================

let progressEmitter: ProgressEmitter | null = null;
let discussionEmitter: DiscussionEmitter | null = null;

/**
 * Set emitters so the CLI can wire pipeline events to connected WebSocket clients.
 */
export function setEmitters(
  progress: ProgressEmitter | null,
  discussion: DiscussionEmitter | null,
): void {
  progressEmitter = progress;
  discussionEmitter = discussion;
}

// ============================================================================
// WebSocket Setup
// ============================================================================

export interface WebSocketSetup {
  injectWebSocket: ReturnType<typeof createNodeWebSocket>['injectWebSocket'];
}

/**
 * Configure WebSocket upgrade handler on the Hono app.
 */
export function setupWebSocket(app: Hono): WebSocketSetup {
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  app.get('/ws', (c, next) => {
    // Origin validation — only allow localhost origins
    const origin = c.req.header('Origin') ?? '';
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (origin && !isLocalhost) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    // Token validation via query param or Authorization header
    const queryToken = c.req.query('token');
    const authHeader = c.req.header('Authorization');
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const token = queryToken ?? headerToken;
    if (!token || token !== getAuthToken()) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Connection limit
    if (activeConnections >= MAX_CONNECTIONS) {
      return c.json({ error: 'Too many connections' }, 503);
    }

    return next();
  });

  app.get(
    '/ws',
    upgradeWebSocket(() => {
      let progressListener: ((event: ProgressEvent) => void) | null = null;
      let discussionListener: ((event: DiscussionEvent) => void) | null = null;

      return {
        onOpen(_event, ws) {
          activeConnections++;

          // Attach progress listener
          if (progressEmitter) {
            progressListener = (event: ProgressEvent) => {
              try {
                ws.send(JSON.stringify({ type: 'progress', data: event }));
              } catch {
                // Client disconnected
              }
            };
            progressEmitter.onProgress(progressListener);
          }

          // Attach discussion listener
          if (discussionEmitter) {
            discussionListener = (event: DiscussionEvent) => {
              try {
                ws.send(JSON.stringify({ type: 'discussion', data: event }));
              } catch {
                // Client disconnected
              }
            };
            discussionEmitter.on('*', discussionListener);
          }
        },

        onClose() {
          activeConnections = Math.max(0, activeConnections - 1);
          // Cleanup listeners
          if (progressEmitter && progressListener) {
            progressEmitter.removeListener('progress', progressListener);
          }
          if (discussionEmitter && discussionListener) {
            discussionEmitter.removeListener('*', discussionListener);
          }
          progressListener = null;
          discussionListener = null;
        },

        onError() {
          activeConnections = Math.max(0, activeConnections - 1);
          // Cleanup on error
          if (progressEmitter && progressListener) {
            progressEmitter.removeListener('progress', progressListener);
          }
          if (discussionEmitter && discussionListener) {
            discussionEmitter.removeListener('*', discussionListener);
          }
          progressListener = null;
          discussionListener = null;
        },
      };
    }),
  );

  return { injectWebSocket };
}
