/**
 * Generic Webhook with HMAC-SHA256 signature (1.5.2)
 * Sends raw JSON to arbitrary HTTPS URLs with signature verification.
 */

import { createHmac } from 'crypto';
import { fetchWithRetry } from './utils.js';

export interface GenericWebhookConfig {
  url: string;
  secret: string;
  events?: string[]; // Filter: ['pipeline-complete'] or ['all']
}

/**
 * Send a signed webhook payload to a generic HTTPS endpoint.
 */
export async function sendGenericWebhook(
  config: GenericWebhookConfig,
  event: string,
  payload: unknown,
): Promise<void> {
  // Event filtering
  if (config.events && !config.events.includes('all') && !config.events.includes(event)) {
    return;
  }

  // Secret length validation
  if (!config.secret || config.secret.length < 16) {
    process.stderr.write('[codeagora] Generic webhook: secret too short (min 16 chars)\n');
    return;
  }

  // Validate HTTPS
  let parsed: URL;
  try {
    parsed = new URL(config.url);
  } catch {
    process.stderr.write(`[codeagora] Generic webhook: invalid URL\n`);
    return;
  }
  if (parsed.protocol !== 'https:') {
    process.stderr.write(`[codeagora] Generic webhook: HTTPS required\n`);
    return;
  }

  // Block private/loopback/link-local hostnames to prevent SSRF (IPv4 + IPv6)
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  const isPrivateHost =
    // IPv4 loopback / private / link-local / unspecified
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    // IPv6 loopback (::1), unspecified (::), link-local (fe80::), private (fc00::/7)
    hostname === '::1' ||
    hostname === '::' ||
    /^fe[89ab][0-9a-f]:/i.test(hostname) || // fe80::/10 link-local
    /^fc[0-9a-f]{2}:/i.test(hostname) ||    // fc00::/7 unique-local
    /^fd[0-9a-f]{2}:/i.test(hostname) ||    // fd00::/8 unique-local
    // DNS names that resolve locally
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost');
  if (isPrivateHost) {
    process.stderr.write(`[codeagora] Generic webhook: private/internal hosts not allowed\n`);
    return;
  }

  let body: string;
  try {
    body = JSON.stringify({ event, timestamp: Date.now(), data: payload });
  } catch {
    process.stderr.write(`[codeagora] Generic webhook: failed to serialize payload\n`);
    return;
  }

  // HMAC-SHA256 signature
  const signature = createHmac('sha256', config.secret)
    .update(body)
    .digest('hex');

  await fetchWithRetry(
    config.url,
    body,
    {
      'Content-Type': 'application/json',
      'X-CodeAgora-Event': event,
      'X-CodeAgora-Signature': `sha256=${signature}`,
    },
    { timeoutMs: 10000, logLabel: 'Generic webhook' },
  );
}
