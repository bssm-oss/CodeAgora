/**
 * Map EvidenceDocuments to specific diff lines.
 */
import type { EvidenceDocument } from '../types/evidence.js';
export interface MappedIssue {
    line: number;
    severity: string;
    title: string;
    filePath: string;
    evidence?: string[];
    suggestion?: string;
}
export declare function mapIssuesToLines(evidenceDocs: EvidenceDocument[], filePath: string): MappedIssue[];
//# sourceMappingURL=issue-mapper.d.ts.map