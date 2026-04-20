/**
 * WebSocket Handler
 * Real-time event forwarding from ProgressEmitter and DiscussionEmitter.
 */

import type { Hono } from 'hono';
import type { ProgressEmitter, ProgressEvent } from '@codeagora/core/pipeline/progress.js';
import type { DiscussionEmitter, DiscussionEvent } from '@codeagora/core/l2/event-emitter.js';
import { createNodeWebSocket } from '@hono/node-ws';
import { getAuthToken, compareTokens, AUTH_COOKIE_NAME, isAllowedOrigin, verifySessionCookie } from './middleware.js';
import { getActiveEmitter } from './routes/review.js';
import { logger } from './logger.js';

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
    // Origin validation — uses same pinned origins as CORS middleware
    const origin = c.req.header('Origin') ?? '';
    if (!isAllowedOrigin(origin)) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    // Auth: try cookie (HMAC-derived), then protocol header, then Bearer header
    const cookieHeader = c.req.header('Cookie');
    const cookieRe = new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]*)`);
    const cookieValue = cookieHeader ? cookieHeader.match(cookieRe)?.[1] ?? null : null;

    const protocolHeader = c.req.header('sec-websocket-protocol');
    const protocolToken = protocolHeader?.split(',')
      .map(p => p.trim())
      .find(p => p.startsWith('token.'))
      ?.slice(6);

    const authHeader = c.req.header('Authorization');
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // Try each auth method independently so a stale/invalid cookie
    // does not block fallback to Bearer or protocol token.
    let wsAuthenticated = false;
    if (cookieValue) {
      wsAuthenticated = verifySessionCookie(cookieValue);
    }
    if (!wsAuthenticated && protocolToken) {
      wsAuthenticated = compareTokens(protocolToken, getAuthToken());
    }
    if (!wsAuthenticated && headerToken) {
      wsAuthenticated = compareTokens(headerToken, getAuthToken());
    }

    if (!wsAuthenticated) {
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

          // Send pipeline status snapshot on connect (for reconnection recovery)
          const isRunning = getActiveEmitter() !== null;
          try {
            ws.send(JSON.stringify({
              type: 'sync',
              data: { pipelineRunning: isRunning },
            }));
          } catch {
            // Client may have already disconnected
          }

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
          // No-op: onClose fires after onError per WebSocket spec.
          // Decrement and listener cleanup happen in onClose to avoid double-count.
        },
      };
    }),
  );

  return { injectWebSocket };
}
