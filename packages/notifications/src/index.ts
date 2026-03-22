/**
 * @codeagora/notifications
 * Discord and Slack webhook integrations for CodeAgora review results.
 */

export {
  sendNotifications,
  sendDiscordNotification,
  sendSlackNotification,
  validateWebhookUrl,
  type NotificationPayload,
  type NotificationConfig,
} from './webhook.js';

export {
  createDiscordLiveHandler,
  sendDiscordPipelineSummary,
  type DiscordLiveConfig,
} from './discord-live.js';

export { createEventStreamHandler } from './event-stream.js';

export {
  sendGenericWebhook,
  type GenericWebhookConfig,
} from './generic-webhook.js';
