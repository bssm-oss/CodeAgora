/**
 * Severity system (V3)
 */
import { z } from 'zod';
export declare const SeveritySchema: z.ZodEnum<["HARSHLY_CRITICAL", "CRITICAL", "WARNING", "SUGGESTION"]>;
export type Severity = z.infer<typeof SeveritySchema>;
export declare const SEVERITY_ORDER: readonly ["HARSHLY_CRITICAL", "CRITICAL", "WARNING", "SUGGESTION"];
//# sourceMappingURL=severity.d.ts.map