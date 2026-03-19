/**
 * Map EvidenceDocuments to specific diff lines.
 */

import type { EvidenceDocument } from '@codeagora/core/types/core.js';

export interface MappedIssue {
  line: number;
  severity: string;
  title: string;
  filePath: string;
  evidence?: string[];
  suggestion?: string;
}

export function mapIssuesToLines(
  evidenceDocs: EvidenceDocument[],
  filePath: string,
): MappedIssue[] {
  const results: MappedIssue[] = [];

  for (const doc of evidenceDocs) {
    if (doc.filePath !== filePath) continue;

    const [start, end] = doc.lineRange;
    for (let line = start; line <= end; line++) {
      results.push({
        line,
        severity: doc.severity,
        title: doc.issueTitle,
        filePath: doc.filePath,
        evidence: doc.evidence.length > 0 ? doc.evidence : undefined,
        suggestion: doc.suggestion || undefined,
      });
    }
  }

  return results;
}
