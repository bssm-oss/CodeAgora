/**
 * Evidence Document type (L1 Reviewer Output)
 */
import { z } from 'zod';
import { SeveritySchema } from './severity.js';
export const EvidenceDocumentSchema = z.object({
    issueTitle: z.string(),
    problem: z.string(),
    evidence: z.array(z.string()),
    severity: SeveritySchema,
    suggestion: z.string(),
    filePath: z.string(),
    lineRange: z.tuple([z.number(), z.number()]),
    source: z.enum(['llm', 'rule']).optional(),
    confidence: z.number().min(0).max(100).optional(),
});
