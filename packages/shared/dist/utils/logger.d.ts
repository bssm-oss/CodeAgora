/**
 * Logging System for V3
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export interface LogEntry {
    timestamp: number;
    level: LogLevel;
    component: string;
    message: string;
    data?: unknown;
}
/**
 * Logger for session-based logging
 */
export declare class SessionLogger {
    private date;
    private sessionId;
    private component;
    private logs;
    constructor(date: string, sessionId: string, component: string);
    debug(message: string, data?: unknown): void;
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
    private log;
    /**
     * Flush logs to file
     */
    flush(): Promise<void>;
    /**
     * Get logs
     */
    getLogs(): LogEntry[];
    /**
     * Clear logs
     */
    clear(): void;
}
/**
 * Create a logger for a component
 */
export declare function createLogger(date: string, sessionId: string, component: string): SessionLogger;
//# sourceMappingURL=logger.d.ts.map