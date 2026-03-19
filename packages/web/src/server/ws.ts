/**
 * WebSocket Handler
 * Real-time event forwarding from ProgressEmitter and DiscussionEmitter.
 */

import type { Hono } from 'hono';
import type { ProgressEmitter, ProgressEvent } from '@codeagora/core/pipeline/progress.js';
import type { DiscussionEmitter, DiscussionEvent } from '@codeagora/core/l2/event-emitter.js';
import { createNodeWebSocket } from '@hono/node-ws';

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

  app.get(
    '/ws',
    upgradeWebSocket(() => {
      let progressListener: ((event: ProgressEvent) => void) | null = null;
      let discussionListener: ((event: DiscussionEvent) => void) | null = null;

      return {
        onOpen(_event, ws) {
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
