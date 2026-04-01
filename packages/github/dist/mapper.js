import { SEVERITY_ORDER } from "@codeagora/core/types/core.js";
import { resolveLineRange } from "./diff-parser.js";
import { getConfidenceBadge } from "@codeagora/core/pipeline/confidence.js";
const MARKER = "<!-- codeagora-v3 -->";
function truncateResponse(text, maxLen) {
  const clean = text.replace(/\n/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const lastDot = cut.lastIndexOf(".");
  return (lastDot > maxLen * 0.5 ? cut.slice(0, lastDot + 1) : cut) + "...";
}
const SEVERITY_BADGE = {
  HARSHLY_CRITICAL: { emoji: "\u{1F534}", label: "HARSHLY CRITICAL" },
  CRITICAL: { emoji: "\u{1F534}", label: "CRITICAL" },
  WARNING: { emoji: "\u{1F7E1}", label: "WARNING" },
  SUGGESTION: { emoji: "\u{1F535}", label: "SUGGESTION" }
};
const VERDICT_BADGE = {
  ACCEPT: { emoji: "\u2705", label: "ACCEPT" },
  REJECT: { emoji: "\u{1F534}", label: "REJECT" },
  NEEDS_HUMAN: { emoji: "\u{1F7E0}", label: "NEEDS HUMAN REVIEW" }
};
function mapToInlineCommentBody(doc, discussion, reviewerIds, options, rounds, opinions, devilsAdvocateId, supporterModelMap) {
  const badge = SEVERITY_BADGE[doc.severity] ?? { emoji: "\u26AA", label: doc.severity };
  const lines = [];
  lines.push(`${badge.emoji} **${badge.label}** \u2014 ${doc.issueTitle}`);
  lines.push("");
  const confidenceBadge = getConfidenceBadge(doc.confidence);
  if (confidenceBadge) {
    lines.push(`**Confidence:** ${confidenceBadge}`);
    lines.push("");
  }
  lines.push(`**Problem:** ${doc.problem}`);
  if (doc.evidence.length > 0) {
    lines.push("");
    lines.push("**Evidence:**");
    for (let i = 0; i < doc.evidence.length; i++) {
      lines.push(`${i + 1}. ${doc.evidence[i]}`);
    }
  }
  if (doc.suggestion && options?.postSuggestions !== false) {
    lines.push("");
    const codeBlockMatch = /```[\w]*\n([\s\S]*?)```/.exec(doc.suggestion);
    if (codeBlockMatch) {
      const extractedCode = codeBlockMatch[1];
      lines.push("```suggestion");
      lines.push(extractedCode.replace(/\n$/, ""));
      lines.push("```");
    } else {
      lines.push(`**Suggestion:** ${doc.suggestion}`);
    }
  }
  if (opinions && opinions.length > 1) {
    const severityBadge = (sev) => SEVERITY_BADGE[sev]?.emoji ?? "\u26AA";
    lines.push("");
    lines.push("<details>");
    lines.push(`<summary>\u{1F50D} Individual Reviews (${opinions.length} reviewers)</summary>`);
    lines.push("");
    for (const op of opinions) {
      lines.push(`**${op.reviewerId}** \u{1F4AC} \`${op.model}\` (${severityBadge(op.severity)} ${op.severity})`);
      lines.push("");
      lines.push(`> **Problem:** ${truncateResponse(op.problem, 200)}`);
      if (op.evidence.length > 0) {
        lines.push(">");
        lines.push(`> **Evidence:**`);
        for (const e of op.evidence) {
          lines.push(`> - ${truncateResponse(e, 150)}`);
        }
      }
      if (op.suggestion) {
        lines.push(">");
        lines.push(`> **Suggestion:** ${truncateResponse(op.suggestion, 200)}`);
      }
      lines.push("");
    }
    lines.push("</details>");
  }
  if (discussion) {
    const consensusIcon = discussion.consensusReached ? "\u2705" : "\u26A0\uFE0F";
    const consensusText = discussion.consensusReached ? "consensus" : "forced decision";
    lines.push("");
    if (options?.collapseDiscussions !== false) {
      lines.push("<details>");
      lines.push(
        `<summary>${consensusIcon} Discussion ${discussion.discussionId} \u2014 ${discussion.rounds} round(s), ${consensusText}</summary>`
      );
      lines.push("");
      if (rounds && rounds.length > 0) {
        for (const round of rounds) {
          if (round.round > 100) continue;
          lines.push(`**Round ${round.round}**`);
          lines.push("| Supporter | Stance | Summary |");
          lines.push("|-----------|--------|---------|");
          for (const resp of round.supporterResponses) {
            const stanceIcon = resp.stance === "agree" ? "\u2705" : resp.stance === "disagree" ? "\u274C" : "\u2796";
            const summary = truncateResponse(resp.response, 100);
            const isDA = devilsAdvocateId && resp.supporterId === devilsAdvocateId;
            const displayName = supporterModelMap?.get(resp.supporterId) ?? resp.supporterId;
            const nameLabel = isDA ? `\u{1F608} ${displayName}` : displayName;
            lines.push(`| ${nameLabel} | ${stanceIcon} ${resp.stance.toUpperCase()} | ${summary} |`);
          }
          lines.push("");
        }
      }
      lines.push(`**Verdict:** ${discussion.finalSeverity} \u2014 ${discussion.reasoning}`);
      lines.push("");
      lines.push("</details>");
    } else {
      lines.push(
        `${consensusIcon} Discussion ${discussion.discussionId} \u2014 ${discussion.rounds} round(s), ${consensusText}`
      );
      lines.push("");
      lines.push(`> ${discussion.reasoning}`);
    }
  }
  if (reviewerIds && reviewerIds.length > 0) {
    lines.push("");
    lines.push(`<sub>Flagged by: ${reviewerIds.join(", ")} \xA0|\xA0 CodeAgora</sub>`);
  }
  return lines.join("\n");
}
function buildReviewComments(evidenceDocs, discussions, positionIndex, reviewerMap, options, roundsPerDiscussion, minConfidence, reviewerOpinions, devilsAdvocateId, supporterModelMap) {
  const discussionByLocation = /* @__PURE__ */ new Map();
  for (const d of discussions) {
    const key = `${d.filePath}:${d.lineRange[0]}`;
    discussionByLocation.set(key, d);
  }
  const comments = [];
  for (const doc of evidenceDocs) {
    const locationKey = `${doc.filePath}:${doc.lineRange[0]}`;
    const matchingDiscussion = discussionByLocation.get(locationKey);
    if (matchingDiscussion?.finalSeverity === "DISMISSED") continue;
    if (minConfidence !== void 0 && minConfidence > 0) {
      if ((doc.confidence ?? 0) < minConfidence) continue;
    }
    const position = resolveLineRange(positionIndex, doc.filePath, doc.lineRange);
    const reviewerIds = reviewerMap?.get(`${doc.filePath}:${doc.lineRange[0]}`);
    const discussionRounds = matchingDiscussion ? roundsPerDiscussion?.[matchingDiscussion.discussionId] : void 0;
    const opinions = reviewerOpinions?.get(locationKey);
    let body = mapToInlineCommentBody(doc, matchingDiscussion, reviewerIds, options, discussionRounds, opinions, devilsAdvocateId, supporterModelMap);
    if (position !== null) {
      comments.push({
        path: doc.filePath,
        position,
        side: "RIGHT",
        body
      });
    } else {
      body = `> \`${doc.filePath}:${doc.lineRange[0]}-${doc.lineRange[1]}\`

${body}`;
      comments.push({
        path: doc.filePath,
        side: "RIGHT",
        body
      });
    }
  }
  return comments;
}
function buildSummaryBody(params) {
  const { summary, sessionId, sessionDate, evidenceDocs, discussions, questionsForHuman } = params;
  const lines = [];
  lines.push(MARKER);
  lines.push("");
  lines.push("## CodeAgora Review");
  lines.push("");
  const vb = VERDICT_BADGE[summary.decision] ?? { emoji: "\u2753", label: summary.decision };
  const severityParts = SEVERITY_ORDER.filter((s) => (summary.severityCounts[s] ?? 0) > 0).map((s) => `${summary.severityCounts[s]} ${s.toLowerCase()}`);
  lines.push(
    `**Verdict: ${vb.emoji} ${vb.label}** \xB7 ${severityParts.join(" \xB7 ")}`
  );
  lines.push("");
  lines.push(`> ${summary.reasoning}`);
  lines.push("");
  const blocking = evidenceDocs.filter(
    (d) => d.severity === "HARSHLY_CRITICAL" || d.severity === "CRITICAL"
  );
  if (blocking.length > 0) {
    lines.push("### Blocking Issues");
    lines.push("");
    lines.push("| Severity | File | Line | Issue | Confidence |");
    lines.push("|----------|------|------|-------|------------|");
    for (const doc of blocking) {
      const badge = SEVERITY_BADGE[doc.severity];
      const confCell = getConfidenceBadge(doc.confidence) || "\u2014";
      lines.push(
        `| ${badge.emoji} ${badge.label} | \`${doc.filePath}\` | ${doc.lineRange[0]}\u2013${doc.lineRange[1]} | ${doc.issueTitle} | ${confCell} |`
      );
    }
    lines.push("");
  }
  const warnings = evidenceDocs.filter((d) => d.severity === "WARNING");
  if (warnings.length > 0) {
    lines.push("<details>");
    lines.push(`<summary>${warnings.length} warning(s)</summary>`);
    lines.push("");
    lines.push("| Severity | File | Line | Issue | Confidence |");
    lines.push("|----------|------|------|-------|------------|");
    for (const doc of warnings) {
      const confCell = getConfidenceBadge(doc.confidence) || "\u2014";
      lines.push(
        `| \u{1F7E1} WARNING | \`${doc.filePath}\` | ${doc.lineRange[0]} | ${doc.issueTitle} | ${confCell} |`
      );
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }
  const suggestions = evidenceDocs.filter((d) => d.severity === "SUGGESTION");
  if (suggestions.length > 0) {
    lines.push("<details>");
    lines.push(`<summary>${suggestions.length} suggestion(s)</summary>`);
    lines.push("");
    for (const doc of suggestions) {
      lines.push(
        `- \`${doc.filePath}:${doc.lineRange[0]}\` \u2014 ${doc.issueTitle}`
      );
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }
  if (evidenceDocs.length > 0) {
    const fileCounts = /* @__PURE__ */ new Map();
    for (const doc of evidenceDocs) {
      fileCounts.set(doc.filePath, (fileCounts.get(doc.filePath) ?? 0) + 1);
    }
    const sorted = [...fileCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const maxCount = sorted[0]?.[1] ?? 1;
    lines.push("<details>");
    lines.push(`<summary>Issue distribution (${fileCounts.size} file(s))</summary>`);
    lines.push("");
    lines.push("| File | Issues |");
    lines.push("|------|--------|");
    for (const [file, count] of sorted) {
      const bar = "\u2588".repeat(Math.max(1, Math.round(count / maxCount * 12)));
      lines.push(`| \`${file}\` | ${bar} ${count} |`);
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }
  if (params.performanceText) {
    lines.push("<details>");
    lines.push(`<summary>Performance (${summary.totalReviewers} reviewer(s))</summary>`);
    lines.push("");
    lines.push(params.performanceText);
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }
  if (discussions.length > 0) {
    lines.push("<details>");
    lines.push(`<summary>Agent consensus log (${discussions.length} discussion(s))</summary>`);
    lines.push("");
    for (const d of discussions) {
      const consensusIcon = d.consensusReached ? "\u2705" : "\u26A0\uFE0F";
      const consensusText = d.consensusReached ? "consensus" : "forced";
      lines.push(`<details>`);
      lines.push(`<summary>${consensusIcon} ${d.discussionId} \u2014 ${d.rounds} round(s), ${consensusText} \u2192 ${d.finalSeverity}</summary>`);
      lines.push("");
      const rounds = params.roundsPerDiscussion?.[d.discussionId];
      if (rounds && rounds.length > 0) {
        for (const round of rounds) {
          if (round.round > 100) continue;
          lines.push(`**Round ${round.round}**`);
          lines.push("| Supporter | Stance | Summary |");
          lines.push("|-----------|--------|---------|");
          for (const resp of round.supporterResponses) {
            const stanceIcon = resp.stance === "agree" ? "\u2705" : resp.stance === "disagree" ? "\u274C" : "\u2796";
            const summary2 = truncateResponse(resp.response, 80);
            const isDA = params.devilsAdvocateId && resp.supporterId === params.devilsAdvocateId;
            const displayName = params.supporterModelMap?.get(resp.supporterId) ?? resp.supporterId;
            const nameLabel = isDA ? `\u{1F608} ${displayName}` : displayName;
            lines.push(`| ${nameLabel} | ${stanceIcon} ${resp.stance.toUpperCase()} | ${summary2} |`);
          }
          lines.push("");
        }
      }
      lines.push(`**Verdict:** ${d.finalSeverity} \u2014 ${d.reasoning}`);
      lines.push("");
      lines.push("</details>");
      lines.push("");
    }
    lines.push("</details>");
    lines.push("");
  }
  if (params.suppressedIssues && params.suppressedIssues.length > 0) {
    lines.push("<details>");
    lines.push(`<summary>${params.suppressedIssues.length} issue(s) suppressed by learned patterns</summary>`);
    lines.push("");
    for (const s of params.suppressedIssues) {
      const countInfo = s.dismissCount ? ` (dismissed ${s.dismissCount} times previously)` : "";
      lines.push(`- \`${s.filePath}:${s.lineRange[0]}\` \u2014 "${s.issueTitle}"${countInfo}`);
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }
  if (questionsForHuman && questionsForHuman.length > 0) {
    lines.push("### Open Questions");
    lines.push("");
    lines.push("CodeAgora could not reach a conclusion on the following. A human reviewer has been requested.");
    lines.push("");
    for (let i = 0; i < questionsForHuman.length; i++) {
      lines.push(`${i + 1}. ${questionsForHuman[i]}`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push(
    `<sub>CodeAgora \xB7 Session: \`${sessionDate}/${sessionId}\`</sub>`
  );
  return lines.join("\n");
}
function buildReviewBadgeUrl(decision, severityCounts) {
  const colorMap = {
    ACCEPT: "brightgreen",
    REJECT: "red",
    NEEDS_HUMAN: "yellow"
  };
  const color = colorMap[decision] ?? "lightgrey";
  const criticalCount = (severityCounts["HARSHLY_CRITICAL"] ?? 0) + (severityCounts["CRITICAL"] ?? 0);
  const detail = criticalCount > 0 ? `${decision} (${criticalCount} critical)` : decision;
  return `https://img.shields.io/badge/CodeAgora-${encodeURIComponent(detail)}-${color}`;
}
function mapToGitHubReview(params) {
  const { summary, evidenceDocs, discussions, positionIndex, headSha, sessionId, sessionDate, reviewerMap, questionsForHuman, options, performanceText, roundsPerDiscussion, suppressedIssues, minConfidence, reviewerOpinions, devilsAdvocateId, supporterModelMap } = params;
  const dismissedLocations = new Set(
    discussions.filter((d) => d.finalSeverity === "DISMISSED").map((d) => `${d.filePath}:${d.lineRange[0]}`)
  );
  const activeDocs = evidenceDocs.filter(
    (doc) => !dismissedLocations.has(`${doc.filePath}:${doc.lineRange[0]}`)
  );
  const comments = buildReviewComments(activeDocs, discussions, positionIndex, reviewerMap, options, roundsPerDiscussion, minConfidence, reviewerOpinions, devilsAdvocateId, supporterModelMap);
  const body = buildSummaryBody({ summary, sessionId, sessionDate, evidenceDocs: activeDocs, discussions, questionsForHuman, performanceText, roundsPerDiscussion, suppressedIssues, devilsAdvocateId, supporterModelMap });
  const hasBlocking = activeDocs.some(
    (d) => d.severity === "HARSHLY_CRITICAL" || d.severity === "CRITICAL"
  );
  const event = hasBlocking ? "REQUEST_CHANGES" : "COMMENT";
  return {
    commit_id: headSha,
    event,
    body,
    comments
  };
}
export {
  buildReviewBadgeUrl,
  buildReviewComments,
  buildSummaryBody,
  mapToGitHubReview,
  mapToInlineCommentBody
};
