/**
 * L1 Evidence Writer
 * Writes evidence documents to .ca/sessions/{date}/{session}/reviews/
 */

import type { ReviewOutput, EvidenceDocument } from '../types/core.js';
import { writeMarkdown, getReviewsDir } from '@codeagora/shared/utils/fs.js';
import path from 'path';

// ============================================================================
// Evidence Document Writer
// ============================================================================

/**
 * Write review output to markdown file
 */
export async function writeReviewOutput(
  date: string,
  sessionId: string,
  review: ReviewOutput
): Promise<string> {
  const reviewsDir = getReviewsDir(date, sessionId);
  const sanitizedModel = review.model.replace(/[^a-z0-9]/gi, '-');
  const chunkSuffix = review.chunkIndex != null ? `-c${review.chunkIndex}` : '';
  const filename = `${review.reviewerId}${chunkSuffix}-${sanitizedModel}.md`;
  const filePath = path.join(reviewsDir, filename);

  const content = formatReviewOutput(review);
  await writeMarkdown(filePath, content);

  return filePath;
}

/**
 * Write multiple review outputs in parallel
 */
export async function writeAllReviews(
  date: string,
  sessionId: string,
  reviews: ReviewOutput[]
): Promise<string[]> {
  const paths = await Promise.all(
    reviews.map((review) => writeReviewOutput(date, sessionId, review))
  );

  return paths;
}

// ============================================================================
// Formatters
// ============================================================================

function formatReviewOutput(review: ReviewOutput): string {
  const lines: string[] = [];

  lines.push(`# Review by ${review.reviewerId} (${review.model})`);
  lines.push('');
  lines.push(`**Group:** ${review.group}`);
  lines.push(`**Status:** ${review.status}`);
  lines.push('');

  if (review.status === 'forfeit' && review.error) {
    lines.push('## Error');
    lines.push('');
    lines.push(`\`\`\`\n${review.error}\n\`\`\``);
    lines.push('');
    return lines.join('\n');
  }

  if (review.evidenceDocs.length === 0) {
    lines.push('## No Issues Found');
    lines.push('');
    lines.push('This reviewer found no issues in the assigned code group.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`## Issues Found: ${review.evidenceDocs.length}`);
  lines.push('');

  for (const doc of review.evidenceDocs) {
    lines.push(formatEvidenceDocument(doc));
    lines.push('');
  }

  return lines.join('\n');
}

function formatEvidenceDocument(doc: EvidenceDocument): string {
  const lines: string[] = [];

  lines.push(`## Issue: ${doc.issueTitle}`);
  lines.push('');
  lines.push(`**File:** ${doc.filePath}:${doc.lineRange[0]}-${doc.lineRange[1]}`);
  lines.push(`**Severity:** ${doc.severity}`);
  lines.push('');

  lines.push('### 문제');
  lines.push(doc.problem);
  lines.push('');

  lines.push('### 근거');
  doc.evidence.forEach((e, i) => {
    lines.push(`${i + 1}. ${e}`);
  });
  lines.push('');

  lines.push('### 제안');
  lines.push(doc.suggestion);
  lines.push('');

  return lines.join('\n');
}
