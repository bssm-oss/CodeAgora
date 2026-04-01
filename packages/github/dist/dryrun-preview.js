function formatDryRunPreviewComment(preview) {
  const lines = [];
  lines.push("<!-- codeagora-dryrun-preview -->");
  lines.push("");
  lines.push("## \u{1F50D} CodeAgora Review Preview");
  lines.push("");
  lines.push("| Setting | Value |");
  lines.push("|---------|-------|");
  lines.push(`| Reviewers | ${preview.reviewerCount} |`);
  lines.push(`| Supporters | ${preview.supporterCount} |`);
  lines.push(`| Max discussion rounds | ${preview.maxRounds} |`);
  lines.push(`| Diff lines | ${preview.diffLineCount} |`);
  lines.push(`| Chunks | ${preview.chunkCount} |`);
  lines.push(`| Estimated tokens | ${preview.estimatedTokens.toLocaleString()} |`);
  lines.push(`| Estimated cost | ${preview.estimatedCost} |`);
  lines.push("");
  lines.push("> This is a preview. The actual review will start shortly.");
  return lines.join("\n");
}
export {
  formatDryRunPreviewComment
};
