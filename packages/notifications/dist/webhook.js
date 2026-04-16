// src/constants.ts
var DECISION_COLORS = {
  ACCEPT: 65280,
  REJECT: 16711680,
  NEEDS_HUMAN: 16776960
};
var SEVERITY_ORDER = ["HARSHLY_CRITICAL", "CRITICAL", "WARNING", "SUGGESTION"];

// src/utils.ts
function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}
var BACKOFF_BASE_MS = 1e3;
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function fetchWithRetry(url, body, headers, options = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 5e3;
  const label = options.logLabel ?? (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "[invalid-url]";
    }
  })();
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) {
      await delay(BACKOFF_BASE_MS * Math.pow(2, i - 1));
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (res.ok) return;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        process.stderr.write(`[codeagora] ${label} returned ${res.status}, not retrying
`);
        return;
      }
      if (i === maxAttempts - 1) {
        process.stderr.write(`[codeagora] ${label} returned ${res.status}
`);
      }
    } catch (err) {
      if (i === maxAttempts - 1) {
        process.stderr.write(
          `[codeagora] ${label} failed: ${err instanceof Error ? err.message : String(err)}
`
        );
      }
    }
  }
}

// src/webhook.ts
var SEVERITY_EMOJI = {
  HARSHLY_CRITICAL: ":red_circle:",
  CRITICAL: ":orange_circle:",
  WARNING: ":yellow_circle:",
  SUGGESTION: ":blue_circle:"
};
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
  const redacted = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "[invalid-url]";
    }
  })();
  await fetchWithRetry(
    url,
    JSON.stringify(body),
    { "Content-Type": "application/json" },
    { logLabel: `webhook (${redacted})` }
  );
}
function buildDiscordEmbed(payload) {
  const color = DECISION_COLORS[payload.decision] ?? 8947848;
  const emoji = payload.decision === "ACCEPT" ? "\u2705" : payload.decision === "REJECT" ? "\u{1F534}" : "\u{1F7E1}";
  let mustFix = 0;
  let verify = 0;
  let ignore = 0;
  for (const issue of payload.topIssues) {
    const isCritical = issue.severity === "CRITICAL" || issue.severity === "HARSHLY_CRITICAL";
    if (isCritical) mustFix++;
    else if (issue.severity === "WARNING") verify++;
    else ignore++;
  }
  const triageParts = [];
  if (mustFix > 0) triageParts.push(`${mustFix} must-fix`);
  if (verify > 0) triageParts.push(`${verify} verify`);
  if (ignore > 0) triageParts.push(`${ignore} ignore`);
  const triageStr = triageParts.join(" \xB7 ") || "no issues";
  const issueLines = payload.topIssues.slice(0, 5).map(
    (i) => `${i.severity === "CRITICAL" || i.severity === "HARSHLY_CRITICAL" ? "\u{1F534}" : "\u{1F7E1}"} ${i.filePath} \u2014 ${i.title}`
  );
  const issuesValue = issueLines.length > 0 ? truncate(issueLines.join("\n"), 1024) : "Clean code! \u{1F680}";
  const fields = [
    { name: "Triage", value: triageStr, inline: true },
    { name: "Debates", value: `${payload.totalDiscussions} total \xB7 ${payload.resolved} resolved`, inline: true },
    { name: "Issues", value: issuesValue, inline: false }
  ];
  return {
    embeds: [
      {
        title: `${emoji} ${payload.decision}`,
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
