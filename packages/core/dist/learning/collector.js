import { Octokit } from "@octokit/rest";
const CODEAGORA_MARKER = "<!-- codeagora-v3 -->";
const SEVERITY_PATTERN = /\*\*(HARSHLY_CRITICAL|CRITICAL|WARNING|SUGGESTION)\*\*/;
const TITLE_PATTERN = /\*\*\s*(?:HARSHLY_CRITICAL|CRITICAL|WARNING|SUGGESTION)\s*\*\*\s*[—–-]\s*(.+)/;
async function collectDismissedPatterns(owner, repo, prNumber, token) {
  const octokit = new Octokit({ auth: token });
  const { data: comments } = await octokit.pulls.listReviewComments({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100
  });
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const patternMap = /* @__PURE__ */ new Map();
  for (const comment of comments) {
    if (!comment.body?.includes(CODEAGORA_MARKER)) continue;
    if (comment.position !== null && comment.position !== void 0) {
    }
    const severityMatch = comment.body.match(SEVERITY_PATTERN);
    const titleMatch = comment.body.match(TITLE_PATTERN);
    if (!severityMatch || !titleMatch) continue;
    const severity = severityMatch[1];
    const pattern = titleMatch[1].trim();
    const existing = patternMap.get(pattern);
    if (existing) {
      existing.dismissCount += 1;
      existing.lastDismissed = today;
    } else {
      patternMap.set(pattern, {
        pattern,
        severity,
        dismissCount: 1,
        lastDismissed: today,
        action: severity === "SUGGESTION" ? "suppress" : "downgrade"
      });
    }
  }
  return Array.from(patternMap.values());
}
export {
  collectDismissedPatterns
};
