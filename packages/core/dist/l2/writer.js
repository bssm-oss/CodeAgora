import { writeMarkdown, getDiscussionsDir, getSuggestionsPath, getReportPath } from "@codeagora/shared/utils/fs.js";
import path from "path";
import { writeFile } from "fs/promises";
async function writeDiscussionRound(date, sessionId, discussionId, round) {
  const discussionsDir = getDiscussionsDir(date, sessionId);
  const discussionDir = path.join(discussionsDir, discussionId);
  const roundFile = path.join(discussionDir, `round-${round.round}.md`);
  const { ensureDir } = await import("@codeagora/shared/utils/fs.js");
  await ensureDir(discussionDir);
  const content = formatDiscussionRound(round);
  await writeMarkdown(roundFile, content);
}
async function writeDiscussionVerdict(date, sessionId, verdict) {
  const discussionsDir = getDiscussionsDir(date, sessionId);
  const discussionDir = path.join(discussionsDir, verdict.discussionId);
  const verdictFile = path.join(discussionDir, "verdict.md");
  const { ensureDir } = await import("@codeagora/shared/utils/fs.js");
  await ensureDir(discussionDir);
  const content = formatVerdict(verdict);
  await writeMarkdown(verdictFile, content);
}
async function writeSuggestions(date, sessionId, suggestions) {
  const suggestionsPath = getSuggestionsPath(date, sessionId);
  const lines = [];
  lines.push("# Suggestions");
  lines.push("");
  lines.push("These are low-priority suggestions that did not trigger Discussion.");
  lines.push("");
  for (const suggestion of suggestions) {
    lines.push(`## ${suggestion.issueTitle}`);
    lines.push("");
    lines.push(`**File:** ${suggestion.filePath}:${suggestion.lineRange[0]}-${suggestion.lineRange[1]}`);
    lines.push("");
    lines.push(suggestion.suggestion);
    lines.push("");
  }
  await writeMarkdown(suggestionsPath, lines.join("\n"));
}
async function writeModeratorReport(date, sessionId, report) {
  const reportPath = getReportPath(date, sessionId);
  const content = formatModeratorReport(report);
  await writeMarkdown(reportPath, content);
}
async function writeSupportersLog(date, sessionId, discussionId, supporters) {
  const discussionsDir = getDiscussionsDir(date, sessionId);
  const discussionDir = path.join(discussionsDir, discussionId);
  const supportersFile = path.join(discussionDir, "supporters.json");
  const { ensureDir } = await import("@codeagora/shared/utils/fs.js");
  await ensureDir(discussionDir);
  const models = supporters.map((s) => s.model).join("+");
  const personas = supporters.map((s) => {
    if (!s.assignedPersona) return "none";
    const basename = path.basename(s.assignedPersona, ".md");
    return basename;
  }).join("+");
  const log = {
    supporters: supporters.map((s) => ({
      id: s.id,
      model: s.model,
      persona: s.assignedPersona || null
    })),
    combination: `${models} / ${personas}`
  };
  await writeFile(supportersFile, JSON.stringify(log, null, 2), "utf-8");
}
function formatDiscussionRound(round) {
  const lines = [];
  lines.push(`# Round ${round.round}`);
  lines.push("");
  lines.push("## Moderator Prompt");
  lines.push("");
  lines.push(round.moderatorPrompt);
  lines.push("");
  lines.push("## Supporter Responses");
  lines.push("");
  for (const response of round.supporterResponses) {
    lines.push(`### ${response.supporterId} (${response.stance.toUpperCase()})`);
    lines.push("");
    lines.push(response.response);
    lines.push("");
  }
  return lines.join("\n");
}
function formatVerdict(verdict) {
  const lines = [];
  lines.push(`# Verdict: ${verdict.discussionId}`);
  lines.push("");
  lines.push(`**Final Severity:** ${verdict.finalSeverity}`);
  lines.push(`**Consensus Reached:** ${verdict.consensusReached ? "Yes" : "No (Escalated)"}`);
  lines.push(`**Rounds:** ${verdict.rounds}`);
  lines.push("");
  lines.push("## Reasoning");
  lines.push("");
  lines.push(verdict.reasoning);
  lines.push("");
  return lines.join("\n");
}
function formatModeratorReport(report) {
  const lines = [];
  lines.push("# Moderator Report");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Total Discussions:** ${report.summary.totalDiscussions}`);
  lines.push(`- **Resolved:** ${report.summary.resolved}`);
  lines.push(`- **Escalated to Head:** ${report.summary.escalated}`);
  lines.push("");
  lines.push("## Resolved Discussions");
  lines.push("");
  const resolved = report.discussions.filter((d) => d.consensusReached);
  for (const verdict of resolved) {
    lines.push(`### ${verdict.discussionId} - ${verdict.finalSeverity}`);
    lines.push("");
    lines.push(verdict.reasoning);
    lines.push("");
  }
  lines.push("## Escalated to Head");
  lines.push("");
  const escalated = report.discussions.filter((d) => !d.consensusReached);
  for (const verdict of escalated) {
    lines.push(`### ${verdict.discussionId} - ${verdict.finalSeverity}`);
    lines.push("");
    lines.push(verdict.reasoning);
    lines.push("");
  }
  lines.push("## Unconfirmed Issues");
  lines.push("");
  lines.push(`${report.unconfirmedIssues.length} issue(s) flagged by single reviewer.`);
  lines.push("");
  lines.push("## Suggestions");
  lines.push("");
  lines.push(`${report.suggestions.length} low-priority suggestion(s).`);
  lines.push("");
  return lines.join("\n");
}
export {
  writeDiscussionRound,
  writeDiscussionVerdict,
  writeModeratorReport,
  writeSuggestions,
  writeSupportersLog
};
