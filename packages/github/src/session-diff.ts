/**
 * Session-over-Session Diff (1.8)
 * Compare issues between current and previous review session.
 */

import type { EvidenceDocument } from '@codeagora/core/types/core.js';

export interface SessionDiffResult {
  newIssues: number;
  resolvedIssues: number;
  unchangedIssues: number;
  previousSession: string;
}

/**
 * Compare evidence docs between two sessions.
 * Issues are matched by filePath + lineRange + issueTitle.
 */
export function diffSessionIssues(
  currentDocs: EvidenceDocument[],
  previousDocs: EvidenceDocument[],
  previousSessionId: string,
): SessionDiffResult {
  const makeKey = (doc: EvidenceDocument) =>
    `${doc.filePath}:${doc.lineRange[0]}:${doc.issueTitle}`;

  const currentKeys = new Set(currentDocs.map(makeKey));
  const previousKeys = new Set(previousDocs.map(makeKey));

  let newIssues = 0;
  let resolvedIssues = 0;
  let unchangedIssues = 0;

  for (const key of currentKeys) {
    if (previousKeys.has(key)) {
      unchangedIssues++;
    } else {
      newIssues++;
    }
  }

  for (const key of previousKeys) {
    if (!currentKeys.has(key)) {
      resolvedIssues++;
    }
  }

  return { newIssues, resolvedIssues, unchangedIssues, previousSession: previousSessionId };
}

/**
 * Format session diff as markdown for GitHub comment.
 */
export function formatSessionDiffMarkdown(diff: SessionDiffResult): string {
  return `**Delta from previous review (${diff.previousSession}):** +${diff.newIssues} new, -${diff.resolvedIssues} resolved, ${diff.unchangedIssues} unchanged`;
}
