/**
 * Generic Webhook with HMAC-SHA256 signature (1.5.2)
 * Sends raw JSON to arbitrary HTTPS URLs with signature verification.
 */

import { createHmac } from 'crypto';

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

  const body = JSON.stringify({ event, timestamp: Date.now(), data: payload });

  // HMAC-SHA256 signature
  const signature = createHmac('sha256', config.secret)
    .update(body)
    .digest('hex');

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CodeAgora-Event': event,
        'X-CodeAgora-Signature': `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      process.stderr.write(`[codeagora] Generic webhook returned ${res.status}\n`);
    }
  } catch (err) {
    process.stderr.write(
      `[codeagora] Generic webhook failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}
