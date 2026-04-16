import { writeMarkdown, getResultPath } from "@codeagora/shared/utils/fs.js";
async function writeHeadVerdict(date, sessionId, verdict) {
  const resultPath = getResultPath(date, sessionId);
  const content = formatHeadVerdict(verdict);
  await writeMarkdown(resultPath, content);
}
function formatHeadVerdict(verdict) {
  const lines = [];
  lines.push("# Head Final Verdict");
  lines.push("");
  lines.push(`**Decision:** ${verdict.decision}`);
  lines.push("");
  lines.push("## Reasoning");
  lines.push("");
  lines.push(verdict.reasoning);
  lines.push("");
  if (verdict.questionsForHuman && verdict.questionsForHuman.length > 0) {
    lines.push("## Questions for Human");
    lines.push("");
    for (const question of verdict.questionsForHuman) {
      lines.push(`- ${question}`);
    }
    lines.push("");
  }
  if (verdict.codeChanges && verdict.codeChanges.length > 0) {
    lines.push("## Code Changes Applied");
    lines.push("");
    for (const change of verdict.codeChanges) {
      lines.push(`### ${change.filePath}`);
      lines.push("");
      lines.push("```");
      lines.push(change.changes);
      lines.push("```");
      lines.push("");
    }
  }
  return lines.join("\n");
}
export {
  writeHeadVerdict
};
