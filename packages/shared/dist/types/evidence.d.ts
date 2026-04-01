/**
 * Evidence Document type (L1 Reviewer Output)
 */
import { z } from 'zod';
export declare const EvidenceDocumentSchema: z.ZodObject<{
    issueTitle: z.ZodString;
    problem: z.ZodString;
    evidence: z.ZodArray<z.ZodString, "many">;
    severity: z.ZodEnum<["HARSHLY_CRITICAL", "CRITICAL", "WARNING", "SUGGESTION"]>;
    suggestion: z.ZodString;
    filePath: z.ZodString;
    lineRange: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
    source: z.ZodOptional<z.ZodEnum<["llm", "rule"]>>;
    confidence: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    issueTitle: string;
    problem: string;
    evidence: string[];
    severity: "CRITICAL" | "WARNING" | "SUGGESTION" | "HARSHLY_CRITICAL";
    suggestion: string;
    filePath: string;
    lineRange: [number, number];
    source?: "llm" | "rule" | undefined;
    confidence?: number | undefined;
}, {
    issueTitle: string;
    problem: string;
    evidence: string[];
    severity: "CRITICAL" | "WARNING" | "SUGGESTION" | "HARSHLY_CRITICAL";
    suggestion: string;
    filePath: string;
    lineRange: [number, number];
    source?: "llm" | "rule" | undefined;
    confidence?: number | undefined;
}>;
export type EvidenceDocument = z.infer<typeof EvidenceDocumentSchema>;
//# sourceMappingURL=evidence.d.ts.map