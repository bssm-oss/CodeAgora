/**
 * Discord Live Discussion Integration (2.2, 2.3)
 * Attaches to DiscussionEmitter and posts real-time events to Discord.
 * Uses Discord threads for per-discussion grouping.
 */

import type { DiscussionEvent } from '@codeagora/core/l2/event-emitter.js';
import type { NotificationPayload } from './webhook.js';
import { validateWebhookUrl } from './webhook.js';

// ============================================================================
// Types
// ============================================================================

export interface DiscordLiveConfig {
  webhookUrl: string;
  useThreads?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}

const STANCE_EMOJI: Record<string, string> = {
  agree: '\u2705',
  disagree: '\u274C',
  neutral: '\u2796',
};

const SEVERITY_COLOR: Record<string, number> = {
  HARSHLY_CRITICAL: 0xff0000,
  CRITICAL: 0xff4500,
  WARNING: 0xffaa00,
  SUGGESTION: 0x3498db,
  DISMISSED: 0x888888,
};

async function postDiscord(url: string, body: unknown): Promise<string | null> {
  try {
    validateWebhookUrl(url);
    const res = await fetch(url + '?wait=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json() as { id?: string };
      return data.id ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Live Discussion Handler (2.2)
// ============================================================================

/**
 * Create a handler that posts discussion events to Discord.
 * Returns an event listener function to attach to DiscussionEmitter.
 */
export function createDiscordLiveHandler(config: DiscordLiveConfig) {
  const threadIds = new Map<string, string>(); // discussionId → messageId (thread)

  return async (event: DiscussionEvent): Promise<void> => {
    const url = config.webhookUrl;

    switch (event.type) {
      case 'discussion-start': {
        const embed = {
          embeds: [{
            title: `\uD83D\uDCCC Discussion ${event.discussionId}`,
            description: `**${event.issueTitle}**\n\`${event.filePath}\` \u2014 ${event.severity}`,
            color: SEVERITY_COLOR[event.severity] ?? 0x888888,
          }],
        };
        const msgId = await postDiscord(url, embed);
        if (msgId && config.useThreads !== false) {
          threadIds.set(event.discussionId, msgId);
        }
        break;
      }

      case 'supporter-response': {
        const emoji = STANCE_EMOJI[event.stance] ?? '\u2753';
        const summary = truncate(event.response.replace(/\n/g, ' '), 200);
        const embed = {
          embeds: [{
            description: `${emoji} **${event.supporterId}**: ${event.stance.toUpperCase()} \u2014 "${summary}"`,
            color: event.stance === 'agree' ? 0x00ff00 : event.stance === 'disagree' ? 0xff0000 : 0xffff00,
          }],
          ...(threadIds.has(event.discussionId) && { thread_id: threadIds.get(event.discussionId) }),
        };
        await postDiscord(url, embed);
        break;
      }

      case 'consensus-check': {
        if (!event.reached) break;
        const embed = {
          embeds: [{
            description: `\u2705 **Consensus reached**: ${event.severity} (round ${event.roundNum})`,
            color: 0x00ff00,
          }],
          ...(threadIds.has(event.discussionId) && { thread_id: threadIds.get(event.discussionId) }),
        };
        await postDiscord(url, embed);
        break;
      }

      case 'forced-decision': {
        const embed = {
          embeds: [{
            description: `\u26A0\uFE0F **Forced decision**: ${event.severity} \u2014 ${truncate(event.reasoning, 200)}`,
            color: 0xffaa00,
          }],
          ...(threadIds.has(event.discussionId) && { thread_id: threadIds.get(event.discussionId) }),
        };
        await postDiscord(url, embed);
        break;
      }

      case 'objection': {
        const embed = {
          embeds: [{
            description: `\u{1F6A8} **Objection** by ${event.supporterId}: ${truncate(event.reasoning, 200)}`,
            color: 0xff4500,
          }],
          ...(threadIds.has(event.discussionId) && { thread_id: threadIds.get(event.discussionId) }),
        };
        await postDiscord(url, embed);
        break;
      }

      default:
        break;
    }
  };
}

// ============================================================================
// Pipeline Summary (2.3)
// ============================================================================

const DECISION_COLORS: Record<string, number> = {
  ACCEPT: 0x00ff00,
  REJECT: 0xff0000,
  NEEDS_HUMAN: 0xffff00,
};

const SEVERITY_ORDER = ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION'];

/**
 * Post a final pipeline summary to Discord (2.3).
 * Posted to the main channel, not a thread.
 */
export async function sendDiscordPipelineSummary(
  webhookUrl: string,
  payload: NotificationPayload,
): Promise<void> {
  const color = DECISION_COLORS[payload.decision] ?? 0x888888;

  const severityLines = SEVERITY_ORDER
    .filter((s) => (payload.severityCounts[s] ?? 0) > 0)
    .map((s) => `**${s}**: ${payload.severityCounts[s]}`);

  const issueLines = payload.topIssues.slice(0, 5).map(
    (i) => `\u2022 [${i.severity}] \`${i.filePath}\` \u2014 ${i.title}`
  );

  const fields = [
    { name: 'Severity', value: severityLines.join('\n') || 'None', inline: true },
    { name: 'Discussions', value: `${payload.totalDiscussions} total\n${payload.resolved} resolved\n${payload.escalated} escalated`, inline: true },
  ];

  if (payload.performance) {
    fields.push({
      name: 'Performance',
      value: `Cost: ${payload.performance.totalCost}\nAvg latency: ${payload.performance.avgLatencyMs}ms\nReviewers: ${payload.performance.reviewerCount}`,
      inline: true,
    });
  }

  if (issueLines.length > 0) {
    fields.push({
      name: 'Top Issues',
      value: truncate(issueLines.join('\n'), 1024),
      inline: false,
    });
  }

  const embed = {
    embeds: [{
      title: `CodeAgora Review \u2014 ${payload.decision}`,
      description: truncate(payload.reasoning, 4096),
      color,
      fields,
      footer: { text: `Session ${payload.date}/${payload.sessionId}` },
    }],
  };

  try {
    await fetch(webhookUrl + '?wait=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    process.stderr.write(
      `[codeagora] Discord summary failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}
