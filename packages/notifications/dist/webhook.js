// src/webhook.ts
var DECISION_COLORS = {
  ACCEPT: 65280,
  REJECT: 16711680,
  NEEDS_HUMAN: 16776960
};
var SEVERITY_EMOJI = {
  HARSHLY_CRITICAL: ":red_circle:",
  CRITICAL: ":orange_circle:",
  WARNING: ":yellow_circle:",
  SUGGESTION: ":blue_circle:"
};
var SEVERITY_ORDER = ["HARSHLY_CRITICAL", "CRITICAL", "WARNING", "SUGGESTION"];
function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}
var ALLOWED_WEBHOOK_HOSTS = /* @__PURE__ */ new Set([
  "discord.com",
  "discordapp.com",
  "hooks.slack.com",
  "slack.com"
]);
function validateWebhookUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid webhook URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS");
  }
  const host = parsed.hostname.toLowerCase();
  const isAllowed = [...ALLOWED_WEBHOOK_HOSTS].some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
  if (!isAllowed) {
    throw new Error(`Webhook host not allowed: ${host}. Supported: Discord, Slack`);
  }
}
async function postWebhook(url, body) {
  validateWebhookUrl(url);
  const maxAttempts = 2;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5e3)
      });
      if (res.ok) return;
      if (i === maxAttempts - 1) {
        const redacted = (() => {
          try {
            return new URL(url).hostname;
          } catch {
            return "[invalid-url]";
          }
        })();
        process.stderr.write(`[codeagora] webhook returned ${res.status} (${redacted})
`);
      }
    } catch (err) {
      if (i === maxAttempts - 1) {
        const redacted = (() => {
          try {
            return new URL(url).hostname;
          } catch {
            return "[invalid-url]";
          }
        })();
        process.stderr.write(`[codeagora] webhook failed (${redacted}): ${err instanceof Error ? err.message : String(err)}
`);
      }
    }
  }
}
function buildDiscordEmbed(payload) {
  const color = DECISION_COLORS[payload.decision] ?? 8947848;
  const severityLines = SEVERITY_ORDER.filter((s) => (payload.severityCounts[s] ?? 0) > 0).map((s) => `${s}: ${payload.severityCounts[s]}`);
  const severityValue = severityLines.length > 0 ? severityLines.join("\n") : "None";
  const issueLines = payload.topIssues.slice(0, 5).map(
    (i) => `[${i.severity}] ${i.filePath} \u2014 ${i.title}`
  );
  const issuesValue = issueLines.length > 0 ? truncate(issueLines.join("\n"), 1024) : "None";
  const fields = [
    { name: "Decision", value: payload.decision, inline: true },
    { name: "Session", value: `${payload.date}/${payload.sessionId}`, inline: true },
    { name: "Discussions", value: `${payload.totalDiscussions} total, ${payload.resolved} resolved, ${payload.escalated} escalated`, inline: false },
    { name: "Severity Counts", value: severityValue, inline: true },
    { name: "Top Issues", value: issuesValue, inline: false }
  ];
  return {
    embeds: [
      {
        title: "CodeAgora Review Result",
        description: truncate(payload.reasoning, 4096),
        color,
        fields,
        footer: { text: `Session ${payload.date}/${payload.sessionId}` }
      }
    ]
  };
}
async function sendDiscordNotification(webhookUrl, payload) {
  const body = buildDiscordEmbed(payload);
  await postWebhook(webhookUrl, body);
}
function buildSlackBlocks(payload) {
  const decisionEmoji = payload.decision === "ACCEPT" ? ":white_check_mark:" : payload.decision === "REJECT" ? ":x:" : ":eyes:";
  const severityLines = SEVERITY_ORDER.filter((s) => (payload.severityCounts[s] ?? 0) > 0).map((s) => `${SEVERITY_EMOJI[s] ?? ":white_circle:"} *${s}*: ${payload.severityCounts[s]}`);
  const issueLines = payload.topIssues.slice(0, 5).map(
    (i) => `\u2022 ${SEVERITY_EMOJI[i.severity] ?? ":white_circle:"} \`${i.filePath}\` \u2014 ${i.title}`
  );
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${decisionEmoji} CodeAgora Review: ${payload.decision}`,
        emoji: true
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncate(payload.reasoning, 3e3)
      }
    }
  ];
  if (severityLines.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Severity Counts*
${severityLines.join("\n")}`
      }
    });
  }
  if (issueLines.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncate(`*Top Issues*
${issueLines.join("\n")}`, 3e3)
      }
    });
  }
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Session: \`${payload.date}/${payload.sessionId}\` | Discussions: ${payload.totalDiscussions} total, ${payload.resolved} resolved, ${payload.escalated} escalated`
      }
    ]
  });
  return { blocks };
}
async function sendSlackNotification(webhookUrl, payload) {
  const body = buildSlackBlocks(payload);
  await postWebhook(webhookUrl, body);
}
async function sendNotifications(config, payload) {
  const tasks = [];
  if (config.discord?.webhookUrl) {
    tasks.push(sendDiscordNotification(config.discord.webhookUrl, payload));
  }
  if (config.slack?.webhookUrl) {
    tasks.push(sendSlackNotification(config.slack.webhookUrl, payload));
  }
  await Promise.allSettled(tasks);
}
export {
  sendDiscordNotification,
  sendNotifications,
  sendSlackNotification,
  validateWebhookUrl
};
