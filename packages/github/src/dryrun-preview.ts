/**
 * Dry-Run Preview Comment (1.10)
 * Post a cost/config preview comment to a PR before running the actual review.
 */

export interface DryRunPreview {
  reviewerCount: number;
  supporterCount: number;
  maxRounds: number;
  estimatedCost: string;
  estimatedTokens: number;
  diffLineCount: number;
  chunkCount: number;
}

/**
 * Format dry-run preview as a GitHub comment body.
 */
export function formatDryRunPreviewComment(preview: DryRunPreview): string {
  const lines: string[] = [];

  lines.push('<!-- codeagora-dryrun-preview -->');
  lines.push('');
  lines.push('## \uD83D\uDD0D CodeAgora Review Preview');
  lines.push('');
  lines.push('| Setting | Value |');
  lines.push('|---------|-------|');
  lines.push(`| Reviewers | ${preview.reviewerCount} |`);
  lines.push(`| Supporters | ${preview.supporterCount} |`);
  lines.push(`| Max discussion rounds | ${preview.maxRounds} |`);
  lines.push(`| Diff lines | ${preview.diffLineCount} |`);
  lines.push(`| Chunks | ${preview.chunkCount} |`);
  lines.push(`| Estimated tokens | ${preview.estimatedTokens.toLocaleString()} |`);
  lines.push(`| Estimated cost | ${preview.estimatedCost} |`);
  lines.push('');
  lines.push('> This is a preview. The actual review will start shortly.');

  return lines.join('\n');
}
