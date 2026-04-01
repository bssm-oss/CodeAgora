/**
 * Session Metadata type
 */
export interface SessionMetadata {
    sessionId: string;
    date: string;
    timestamp: number;
    diffPath: string;
    status: 'in_progress' | 'completed' | 'failed';
    startedAt: number;
    completedAt?: number;
    /** SHA-256 prefix of the diff content (cache key component) */
    diffHash?: string;
    /** SHA-256 prefix of the reviewer config (cache key component) */
    configHash?: string;
}
//# sourceMappingURL=session.d.ts.map