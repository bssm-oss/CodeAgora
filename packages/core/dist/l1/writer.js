import { writeMarkdown, getReviewsDir } from "@codeagora/shared/utils/fs.js";
import path from "path";
async function writeReviewOutput(date, sessionId, review) {
  const reviewsDir = getReviewsDir(date, sessionId);
  const sanitizedModel = review.model.replace(/[^a-z0-9]/gi, "-");
  const chunkSuffix = review.chunkIndex != null ? `-c${review.chunkIndex}` : "";
  const filename = `${review.reviewerId}${chunkSuffix}-${sanitizedModel}.md`;
  const filePath = path.join(reviewsDir, filename);
  const content = formatReviewOutput(review);
  await writeMarkdown(filePath, content);
  return filePath;
}
async function writeAllReviews(date, sessionId, reviews) {
  const paths = await Promise.all(
    reviews.map((review) => writeReviewOutput(date, sessionId, review))
  );
  return paths;
}
function formatReviewOutput(review) {
  const lines = [];
  lines.push(`# Review by ${review.reviewerId} (${review.model})`);
  lines.push("");
  lines.push(`**Group:** ${review.group}`);
  lines.push(`**Status:** ${review.status}`);
  lines.push("");
  if (review.status === "forfeit" && review.error) {
    lines.push("## Error");
    lines.push("");
    lines.push(`\`\`\`
${review.error}
\`\`\``);
    lines.push("");
    return lines.join("\n");
  }
  if (review.evidenceDocs.length === 0) {
    lines.push("## No Issues Found");
    lines.push("");
    lines.push("This reviewer found no issues in the assigned code group.");
    lines.push("");
    return lines.join("\n");
  }
  lines.push(`## Issues Found: ${review.evidenceDocs.length}`);
  lines.push("");
  for (const doc of review.evidenceDocs) {
    lines.push(formatEvidenceDocument(doc));
    lines.push("");
  }
  return lines.join("\n");
}
function formatEvidenceDocument(doc) {
  const lines = [];
  lines.push(`## Issue: ${doc.issueTitle}`);
  lines.push("");
  lines.push(`**File:** ${doc.filePath}:${doc.lineRange[0]}-${doc.lineRange[1]}`);
  lines.push(`**Severity:** ${doc.severity}`);
  lines.push("");
  lines.push("### \uBB38\uC81C");
  lines.push(doc.problem);
  lines.push("");
  lines.push("### \uADFC\uAC70");
  doc.evidence.forEach((e, i) => {
    lines.push(`${i + 1}. ${e}`);
  });
  lines.push("");
  lines.push("### \uC81C\uC548");
  lines.push(doc.suggestion);
  lines.push("");
  return lines.join("\n");
}
export {
  writeAllReviews,
  writeReviewOutput
};
