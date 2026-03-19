/**
 * Event Stream Webhook (1.5.3)
 * Streams individual pipeline events to a generic webhook endpoint in real-time.
 */

import type { DiscussionEvent } from '@codeagora/core/l2/event-emitter.js';
import { sendGenericWebhook, type GenericWebhookConfig } from './generic-webhook.js';

/**
 * Create an event stream handler that forwards DiscussionEmitter events
 * to a generic webhook endpoint.
 */
export function createEventStreamHandler(config: GenericWebhookConfig) {
  return async (event: DiscussionEvent): Promise<void> => {
    await sendGenericWebhook(config, event.type, event);
  };
}
