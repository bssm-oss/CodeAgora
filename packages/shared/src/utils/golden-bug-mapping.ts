/**
 * Evidence → ActualFinding mapper (#472 Phase 2).
 *
 * Isolates the tiny mapping layer between pipeline output and the
 * benchmark scorer input so it can be unit-tested without spinning up a
 * real pipeline run.
 */

import type { EvidenceDocument } from '../types/evidence.js';
import type { ActualFinding } from './golden-bug-scorer.js';

/**
 * Convert a pipeline evidence document into the shape the golden-bug
 * scorer expects. Prefers `confidenceTrace.final` (the canonical
 * post-pipeline confidence) and falls back to the deprecated
 * `doc.confidence` field for legacy traces.
 */
export function evidenceToActualFinding(doc: EvidenceDocument): ActualFinding {
  const confidence = doc.confidenceTrace?.final ?? doc.confidence;
  return {
    issueTitle: doc.issueTitle,
    problem: doc.problem,
    severity: doc.severity,
    filePath: doc.filePath,
    lineRange: doc.lineRange,
    ...(typeof confidence === 'number' ? { confidence } : {}),
  };
}

export function evidenceListToActualFindings(
  docs: readonly EvidenceDocument[],
): ActualFinding[] {
  return docs.map(evidenceToActualFinding);
}
