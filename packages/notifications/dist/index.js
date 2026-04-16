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

// src/discord-live.ts
var STANCE_EMOJI = {
  agree: "\u2705",
  disagree: "\u274C",
  neutral: "\u2796"
};
var SEVERITY_COLOR = {
  HARSHLY_CRITICAL: 16711680,
  CRITICAL: 16729344,
  WARNING: 16755200,
  SUGGESTION: 3447003,
  DISMISSED: 8947848
};
async function postDiscord(url, body) {
  try {
    validateWebhookUrl(url);
    const res = await fetch(url + "?wait=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5e3)
    });
    if (res.ok) {
      const data = await res.json();
      return data.id ?? null;
    }
    return null;
  } catch {
    return null;
  }
}
function createDiscordLiveHandler(config) {
  const threadIds = /* @__PURE__ */ new Map();
  return async (event) => {
    const url = config.webhookUrl;
    switch (event.type) {
      case "discussion-start": {
        const embed = {
          embeds: [{
            title: `\u{1F4CC} Discussion ${event.discussionId}`,
            description: `**${event.issueTitle}**
\`${event.filePath}\` \u2014 ${event.severity}`,
            color: SEVERITY_COLOR[event.severity] ?? 8947848
          }]
        };
        const msgId = await postDiscord(url, embed);
        if (msgId && config.useThreads !== false) {
          threadIds.set(event.discussionId, msgId);
        }
        break;
      }
      case "supporter-response": {
        const emoji = STANCE_EMOJI[event.stance] ?? "\u2753";
        const summary = truncate(event.response.replace(/\n/g, " "), 200);
        const embed = {
          embeds: [{
            description: `${emoji} **${event.supporterId}**: ${event.stance.toUpperCase()} \u2014 "${summary}"`,
            color: event.stance === "agree" ? 65280 : event.stance === "disagree" ? 16711680 : 16776960
          }],
          ...threadIds.has(event.discussionId) && { thread_id: threadIds.get(event.discussionId) }
        };
        await postDiscord(url, embed);
        break;
      }
      case "consensus-check": {
        if (!event.reached) break;
        const embed = {
          embeds: [{
            description: `\u2705 **Consensus reached**: ${event.severity} (round ${event.roundNum})`,
            color: 65280
          }],
          ...threadIds.has(event.discussionId) && { thread_id: threadIds.get(event.discussionId) }
        };
        await postDiscord(url, embed);
        break;
      }
      case "forced-decision": {
        const embed = {
          embeds: [{
            description: `\u26A0\uFE0F **Forced decision**: ${event.severity} \u2014 ${truncate(event.reasoning, 200)}`,
            color: 16755200
          }],
          ...threadIds.has(event.discussionId) && { thread_id: threadIds.get(event.discussionId) }
        };
        await postDiscord(url, embed);
        break;
      }
      case "objection": {
        const embed = {
          embeds: [{
            description: `\u{1F6A8} **Objection** by ${event.supporterId}: ${truncate(event.reasoning, 200)}`,
            color: 16729344
          }],
          ...threadIds.has(event.discussionId) && { thread_id: threadIds.get(event.discussionId) }
        };
        await postDiscord(url, embed);
        break;
      }
      default:
        break;
    }
  };
}
async function sendDiscordPipelineSummary(webhookUrl, payload) {
  const color = DECISION_COLORS[payload.decision] ?? 8947848;
  const severityLines = SEVERITY_ORDER.filter((s) => (payload.severityCounts[s] ?? 0) > 0).map((s) => `**${s}**: ${payload.severityCounts[s]}`);
  const issueLines = payload.topIssues.slice(0, 5).map(
    (i) => `\u2022 [${i.severity}] \`${i.filePath}\` \u2014 ${i.title}`
  );
  const fields = [
    { name: "Severity", value: severityLines.join("\n") || "None", inline: true },
    { name: "Discussions", value: `${payload.totalDiscussions} total
${payload.resolved} resolved
${payload.escalated} escalated`, inline: true }
  ];
  if (payload.performance) {
    fields.push({
      name: "Performance",
      value: `Cost: ${payload.performance.totalCost}
Avg latency: ${payload.performance.avgLatencyMs}ms
Reviewers: ${payload.performance.reviewerCount}`,
      inline: true
    });
  }
  if (issueLines.length > 0) {
    fields.push({
      name: "Top Issues",
      value: truncate(issueLines.join("\n"), 1024),
      inline: false
    });
  }
  const embed = {
    embeds: [{
      title: `CodeAgora Review \u2014 ${payload.decision}`,
      description: truncate(payload.reasoning, 4096),
      color,
      fields,
      footer: { text: `Session ${payload.date}/${payload.sessionId}` }
    }]
  };
  try {
    validateWebhookUrl(webhookUrl);
    await fetch(webhookUrl + "?wait=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(embed),
      signal: AbortSignal.timeout(5e3)
    });
  } catch (err) {
    process.stderr.write(
      `[codeagora] Discord summary failed: ${err instanceof Error ? err.message : String(err)}
`
    );
  }
}

// src/generic-webhook.ts
import { createHmac } from "crypto";
async function sendGenericWebhook(config, event, payload) {
  if (config.events && !config.events.includes("all") && !config.events.includes(event)) {
    return;
  }
  if (!config.secret || config.secret.length < 16) {
    process.stderr.write("[codeagora] Generic webhook: secret too short (min 16 chars)\n");
    return;
  }
  let parsed;
  try {
    parsed = new URL(config.url);
  } catch {
    process.stderr.write(`[codeagora] Generic webhook: invalid URL
`);
    return;
  }
  if (parsed.protocol !== "https:") {
    process.stderr.write(`[codeagora] Generic webhook: HTTPS required
`);
    return;
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isPrivateHost = (
    // IPv4 loopback / private / link-local / unspecified
    hostname === "localhost" || hostname === "0.0.0.0" || /^127\./.test(hostname) || /^10\./.test(hostname) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) || /^192\.168\./.test(hostname) || /^169\.254\./.test(hostname) || // IPv6 loopback (::1), unspecified (::), link-local (fe80::), private (fc00::/7)
    hostname === "::1" || hostname === "::" || /^fe[89ab][0-9a-f]:/i.test(hostname) || // fe80::/10 link-local
    /^fc[0-9a-f]{2}:/i.test(hostname) || // fc00::/7 unique-local
    /^fd[0-9a-f]{2}:/i.test(hostname) || // fd00::/8 unique-local
    // DNS names that resolve locally
    hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".localhost")
  );
  if (isPrivateHost) {
    process.stderr.write(`[codeagora] Generic webhook: private/internal hosts not allowed
`);
    return;
  }
  let body;
  try {
    body = JSON.stringify({ event, timestamp: Date.now(), data: payload });
  } catch {
    process.stderr.write(`[codeagora] Generic webhook: failed to serialize payload
`);
    return;
  }
  const signature = createHmac("sha256", config.secret).update(body).digest("hex");
  await fetchWithRetry(
    config.url,
    body,
    {
      "Content-Type": "application/json",
      "X-CodeAgora-Event": event,
      "X-CodeAgora-Signature": `sha256=${signature}`
    },
    { timeoutMs: 1e4, logLabel: "Generic webhook" }
  );
}

// src/event-stream.ts
function createEventStreamHandler(config) {
  return async (event) => {
    await sendGenericWebhook(config, event.type, event);
  };
}
export {
  createDiscordLiveHandler,
  createEventStreamHandler,
  sendDiscordNotification,
  sendDiscordPipelineSummary,
  sendGenericWebhook,
  sendNotifications,
  sendSlackNotification,
  validateWebhookUrl
};
