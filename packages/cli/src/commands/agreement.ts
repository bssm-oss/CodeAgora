/**
 * Reviewer Agreement Matrix (4.2)
 * Cross-reviewer agreement analysis for a session.
 */

export interface AgreementMatrix {
  reviewerIds: string[];
  matrix: number[][]; // agreement percentage [i][j]
}

/**
 * Compute agreement matrix from reviewer map.
 * reviewerMap: "filePath:startLine" → reviewer IDs that flagged the issue.
 */
export function computeAgreementMatrix(
  reviewerMap: Record<string, string[]>,
  allReviewerIds: string[],
): AgreementMatrix {
  const n = allReviewerIds.length;
  const idxMap = new Map(allReviewerIds.map((id, i) => [id, i]));

  // Count shared flags and total flags per pair
  const shared = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
  const total = Array.from({ length: n }, () => Array(n).fill(0) as number[]);

  const issues = Object.values(reviewerMap);
  for (const flaggers of issues) {
    for (let i = 0; i < allReviewerIds.length; i++) {
      for (let j = i + 1; j < allReviewerIds.length; j++) {
        const a = idxMap.get(allReviewerIds[i])!;
        const b = idxMap.get(allReviewerIds[j])!;
        const aFlagged = flaggers.includes(allReviewerIds[i]);
        const bFlagged = flaggers.includes(allReviewerIds[j]);

        if (aFlagged || bFlagged) {
          total[a][b]++;
          total[b][a]++;
          if (aFlagged && bFlagged) {
            shared[a][b]++;
            shared[b][a]++;
          }
        }
      }
    }
  }

  // Compute agreement percentage
  const matrix = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 100;
      } else if (total[i][j] > 0) {
        matrix[i][j] = Math.round((shared[i][j] / total[i][j]) * 100);
      }
    }
  }

  return { reviewerIds: allReviewerIds, matrix };
}

/**
 * Format agreement matrix as CLI output.
 */
export function formatAgreementMatrix(result: AgreementMatrix): string {
  const { reviewerIds, matrix } = result;
  if (reviewerIds.length === 0) return 'No reviewers to compare.';

  const maxIdLen = Math.max(...reviewerIds.map(id => id.length), 10);
  const lines: string[] = [];

  lines.push('Agreement Matrix');
  lines.push('');

  // Header
  const header = ' '.repeat(maxIdLen + 2) + '\u2502 ' +
    reviewerIds.map(id => id.slice(0, 10).padStart(10)).join(' \u2502 ');
  lines.push(header);
  lines.push('\u2500'.repeat(header.length));

  // Rows
  for (let i = 0; i < reviewerIds.length; i++) {
    const label = reviewerIds[i].padEnd(maxIdLen + 2);
    const cells = matrix[i].map((pct, j) =>
      i === j ? '    -     ' : `${pct.toString().padStart(5)}%    `
    );
    lines.push(`${label}\u2502 ${cells.join(' \u2502 ')}`);
  }

  return lines.join('\n');
}
