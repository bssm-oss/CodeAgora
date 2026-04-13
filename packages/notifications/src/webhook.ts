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

/** Base delay in ms for exponential backoff between retry attempts. */
const BACKOFF_BASE_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postWebhook(url: string, body: unknown): Promise<void> {
  validateWebhookUrl(url);
  const maxAttempts = 3;
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) {
      await delay(BACKOFF_BASE_MS * Math.pow(2, i - 1)); // 1s, 2s
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return;
      // Don't retry client errors (4xx) — they will never succeed
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const redacted = (() => { try { return new URL(url).hostname; } catch { return '[invalid-url]'; } })();
        process.stderr.write(`[codeagora] webhook returned ${res.status} (${redacted}), not retrying\n`);
        return;
      }
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
  const emoji = payload.decision === 'ACCEPT' ? '\u2705' : payload.decision === 'REJECT' ? '\uD83D\uDD34' : '\uD83D\uDFE1';

  // Triage-based issue summary
  let mustFix = 0;
  let verify = 0;
  let ignore = 0;
  for (const issue of payload.topIssues) {
    const isCritical = issue.severity === 'CRITICAL' || issue.severity === 'HARSHLY_CRITICAL';
    if (isCritical) mustFix++;
    else if (issue.severity === 'WARNING') verify++;
    else ignore++;
  }
  const triageParts: string[] = [];
  if (mustFix > 0) triageParts.push(`${mustFix} must-fix`);
  if (verify > 0) triageParts.push(`${verify} verify`);
  if (ignore > 0) triageParts.push(`${ignore} ignore`);
  const triageStr = triageParts.join(' \u00B7 ') || 'no issues';

  // Top issues with triage labels
  const issueLines = payload.topIssues.slice(0, 5).map(
    (i) => `${i.severity === 'CRITICAL' || i.severity === 'HARSHLY_CRITICAL' ? '\uD83D\uDD34' : '\uD83D\uDFE1'} ${i.filePath} \u2014 ${i.title}`
  );
  const issuesValue = issueLines.length > 0
    ? truncate(issueLines.join('\n'), 1024)
    : 'Clean code! \uD83D\uDE80';

  const fields = [
    { name: 'Triage', value: triageStr, inline: true },
    { name: 'Debates', value: `${payload.totalDiscussions} total \u00B7 ${payload.resolved} resolved`, inline: true },
    { name: 'Issues', value: issuesValue, inline: false },
  ];

  return {
    embeds: [
      {
        title: `${emoji} ${payload.decision}`,
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
