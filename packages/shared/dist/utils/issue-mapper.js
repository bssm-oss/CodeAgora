/**
 * Map EvidenceDocuments to specific diff lines.
 */
export function mapIssuesToLines(evidenceDocs, filePath) {
    const results = [];
    for (const doc of evidenceDocs) {
        if (doc.filePath !== filePath)
            continue;
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
