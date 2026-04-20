/**
 * Evidence Document type (L1 Reviewer Output)
 */

import { z } from 'zod';
import { SeveritySchema } from './severity.js';
import { ConfidenceTraceSchema } from './confidence-trace.js';

export const EvidenceDocumentSchema = z.object({
  issueTitle: z.string(),
  problem: z.string(),
  evidence: z.array(z.string()),
  severity: SeveritySchema,
  suggestion: z.string(),
  filePath: z.string(),
  lineRange: z.tuple([z.number(), z.number()]),
  source: z.enum(['llm', 'rule']).optional(),
  /**
   * @deprecated Use `confidenceTrace.final` for all downstream reads. The
   * single-field confidence is being split into per-stage ConfidenceTrace
   * values. This field is currently maintained in parallel for backward
   * compatibility with existing tests and call sites.
   */
  confidence: z.number().min(0).max(100).optional(),
  /**
   * Per-stage confidence values. Each field is written once by the owning
   * pipeline stage and never mutated afterward. See ConfidenceTrace for
   * stage ordering and semantics.
   */
  confidenceTrace: ConfidenceTraceSchema.optional(),
});
export type EvidenceDocument = z.infer<typeof EvidenceDocumentSchema>;
