import { z } from "zod";
function ok(data) {
  return { success: true, data };
}
function err(error) {
  return { success: false, error };
}
const SeveritySchema = z.enum([
  "HARSHLY_CRITICAL",
  "CRITICAL",
  "WARNING",
  "SUGGESTION"
]);
const SEVERITY_ORDER = ["HARSHLY_CRITICAL", "CRITICAL", "WARNING", "SUGGESTION"];
const EvidenceDocumentSchema = z.object({
  issueTitle: z.string(),
  problem: z.string(),
  evidence: z.array(z.string()),
  severity: SeveritySchema,
  suggestion: z.string(),
  filePath: z.string(),
  lineRange: z.tuple([z.number(), z.number()]),
  source: z.enum(["llm", "rule"]).optional(),
  confidence: z.number().min(0).max(100).optional(),
  suggestionVerified: z.enum(["passed", "failed", "skipped"]).optional()
});
export {
  EvidenceDocumentSchema,
  SEVERITY_ORDER,
  SeveritySchema,
  err,
  ok
};
