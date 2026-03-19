/**
 * Notification webhooks for Discord and Slack
 * Fire-and-forget: errors are logged, not thrown.
 */

// ============================================================================
// Types
// ============================================================================

export interface NotificationConfig {
  discord?: { webhookUrl: string };
  slack?: { webhookUrl: string };
  autoNotify?: boolean;
}

export interface NotificationPayload {
  decision: string;
  reasoning: string;
  severityCounts: Record<string, number>;
  topIssues: Array<{ severity: string; filePath: string; title: string }>;
  sessionId: string;
  date: string;
  totalDiscussions: number;
  resolved: number;
  escalated: number;
  /** Per-discussion verdict details (1.5.1) */
  discussionDetails?: Array<{
    id: string;
    rounds: number;
    consensusReached: boolean;
    finalSeverity: string;
  }>;
  /** Performance summary (1.5.1) */
  performance?: {
    totalCost: string;
    avgLatencyMs: number;
    reviewerCount: number;
  };
  /** Learned pattern suppression count (1.5.1) */
  suppressedCount?: number;
  /** Reviewer diversity metrics (4.7) */
  reviewerDiversity?: {
    familyCount: number;
    reasoningModelCount: number;
    totalReviewers: number;
  };
}

// ============================================================================
// Helpers
// ============================================================================

const DECISION_COLORS: Record<string, number> = {
  ACCEPT: 0x00ff00,
  REJECT: 0xff0000,
  NEEDS_HUMAN: 0xffff00,
};

const SEVERITY_EMOJI: Record<string, string> = {
  HARSHLY_CRITICAL: ':red_circle:',
  CRITICAL: ':orange_circle:',
  WARNING: ':yellow_circle:',
  SUGGESTION: ':blue_circle:',
};

const SEVERITY_ORDER = ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION'];

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}

const ALLOWED_WEBHOOK_HOSTS = new Set([
  'discord.com',
  'discordapp.com',
  'hooks.slack.com',
  'slack.com',
]);

export function validateWebhookUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid webhook URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS');
  }
  const host = parsed.hostname.toLowerCase();
  const isAllowed = [...ALLOWED_WEBHOOK_HOSTS].some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
  if (!isAllowed) {
    throw new Error(`Webhook host not allowed: ${host}. Supported: Discord, Slack`);
  }
}

async function postWebhook(url: string, body: unknown): Promise<void> {
  validateWebhookUrl(url);
  const maxAttempts = 2;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return;
      if (i === maxAttempts - 1) {
        const redacted = (() => { try { return new URL(url).hostname; } catch { return '[invalid-url]'; } })();
        process.stderr.write(`[codeagora] webhook returned ${res.status} (${redacted})\n`);
      }
    } catch (err) {
      if (i === maxAttempts - 1) {
        const redacted = (() => { try { return new URL(url).hostname; } catch { return '[invalid-url]'; } })();
        process.stderr.write(`[codeagora] webhook failed (${redacted}): ${err instanceof Error ? err.message : String(err)}\n`);
      }
    }
  }
}

// ============================================================================
// Discord
// ============================================================================

function buildDiscordEmbed(payload: NotificationPayload): object {
  const color = DECISION_COLORS[payload.decision] ?? 0x888888;

  // Severity summary field
  const severityLines = SEVERITY_ORDER
    .filter((s) => (payload.severityCounts[s] ?? 0) > 0)
    .map((s) => `${s}: ${payload.severityCounts[s]}`);
  const severityValue = severityLines.length > 0 ? severityLines.join('\n') : 'None';

  // Top issues field (max 5)
  const issueLines = payload.topIssues.slice(0, 5).map(
    (i) => `[${i.severity}] ${i.filePath} — ${i.title}`
  );
  const issuesValue = issueLines.length > 0
    ? truncate(issueLines.join('\n'), 1024)
    : 'None';

  const fields = [
    { name: 'Decision', value: payload.decision, inline: true },
    { name: 'Session', value: `${payload.date}/${payload.sessionId}`, inline: true },
    { name: 'Discussions', value: `${payload.totalDiscussions} total, ${payload.resolved} resolved, ${payload.escalated} escalated`, inline: false },
    { name: 'Severity Counts', value: severityValue, inline: true },
    { name: 'Top Issues', value: issuesValue, inline: false },
  ];

  return {
    embeds: [
      {
        title: 'CodeAgora Review Result',
        description: truncate(payload.reasoning, 4096),
        color,
        fields,
        footer: { text: `Session ${payload.date}/${payload.sessionId}` },
      },
    ],
  };
}

export async function sendDiscordNotification(
  webhookUrl: string,
  payload: NotificationPayload
): Promise<void> {
  const body = buildDiscordEmbed(payload);
  await postWebhook(webhookUrl, body);
}

// ============================================================================
// Slack
// ============================================================================

function buildSlackBlocks(payload: NotificationPayload): object {
  const decisionEmoji =
    payload.decision === 'ACCEPT' ? ':white_check_mark:' :
    payload.decision === 'REJECT' ? ':x:' : ':eyes:';

  const severityLines = SEVERITY_ORDER
    .filter((s) => (payload.severityCounts[s] ?? 0) > 0)
    .map((s) => `${SEVERITY_EMOJI[s] ?? ':white_circle:'} *${s}*: ${payload.severityCounts[s]}`);

  const issueLines = payload.topIssues.slice(0, 5).map(
    (i) => `• ${SEVERITY_EMOJI[i.severity] ?? ':white_circle:'} \`${i.filePath}\` — ${i.title}`
  );

  const blocks: object[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${decisionEmoji} CodeAgora Review: ${payload.decision}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: truncate(payload.reasoning, 3000),
      },
    },
  ];

  if (severityLines.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Severity Counts*\n${severityLines.join('\n')}`,
      },
    });
  }

  if (issueLines.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: truncate(`*Top Issues*\n${issueLines.join('\n')}`, 3000),
      },
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Session: \`${payload.date}/${payload.sessionId}\` | Discussions: ${payload.totalDiscussions} total, ${payload.resolved} resolved, ${payload.escalated} escalated`,
      },
    ],
  });

  return { blocks };
}

export async function sendSlackNotification(
  webhookUrl: string,
  payload: NotificationPayload
): Promise<void> {
  const body = buildSlackBlocks(payload);
  await postWebhook(webhookUrl, body);
}

// ============================================================================
// Combined sender
// ============================================================================

export async function sendNotifications(
  config: NotificationConfig,
  payload: NotificationPayload
): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (config.discord?.webhookUrl) {
    tasks.push(sendDiscordNotification(config.discord.webhookUrl, payload));
  }
  if (config.slack?.webhookUrl) {
    tasks.push(sendSlackNotification(config.slack.webhookUrl, payload));
  }

  await Promise.allSettled(tasks);
}
