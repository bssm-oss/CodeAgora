/**
 * L3 Head - Result Writer
 * Writes final verdict to result.md
 */

import type { HeadVerdict } from '../types/core.js';
import { writeMarkdown, getResultPath } from '@codeagora/shared/utils/fs.js';

/**
 * Write head verdict to result.md
 */
export async function writeHeadVerdict(
  date: string,
  sessionId: string,
  verdict: HeadVerdict
): Promise<void> {
  const resultPath = getResultPath(date, sessionId);

  const content = formatHeadVerdict(verdict);
  await writeMarkdown(resultPath, content);
}

function formatHeadVerdict(verdict: HeadVerdict): string {
  const lines: string[] = [];

  lines.push('# Head Final Verdict');
  lines.push('');
  lines.push(`**Decision:** ${verdict.decision}`);
  lines.push('');

  lines.push('## Reasoning');
  lines.push('');
  lines.push(verdict.reasoning);
  lines.push('');

  if (verdict.questionsForHuman && verdict.questionsForHuman.length > 0) {
    lines.push('## Questions for Human');
    lines.push('');
    for (const question of verdict.questionsForHuman) {
      lines.push(`- ${question}`);
    }
    lines.push('');
  }

  if (verdict.codeChanges && verdict.codeChanges.length > 0) {
    lines.push('## Code Changes Applied');
    lines.push('');
    for (const change of verdict.codeChanges) {
      lines.push(`### ${change.filePath}`);
      lines.push('');
      lines.push('```');
      lines.push(change.changes);
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}
