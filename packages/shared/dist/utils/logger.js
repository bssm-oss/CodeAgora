/**
 * Logging System for V3
 */
import { appendMarkdown, getLogsDir } from './fs.js';
import path from 'path';
/**
 * Logger for session-based logging
 */
export class SessionLogger {
    date;
    sessionId;
    component;
    logs = [];
    constructor(date, sessionId, component) {
        this.date = date;
        this.sessionId = sessionId;
        this.component = component;
    }
    debug(message, data) {
        this.log('DEBUG', message, data);
    }
    info(message, data) {
        this.log('INFO', message, data);
    }
    warn(message, data) {
        this.log('WARN', message, data);
    }
    error(message, data) {
        this.log('ERROR', message, data);
    }
    log(level, message, data) {
        const entry = {
            timestamp: Date.now(),
            level,
            component: this.component,
            message,
            data,
        };
        this.logs.push(entry);
        // Also log to console in development
        if (process.env.NODE_ENV !== 'production') {
            const timestamp = new Date(entry.timestamp).toISOString();
            console.log(`[${timestamp}] ${level} [${this.component}] ${message}`);
            if (data) {
                console.log(data);
            }
        }
    }
    /**
     * Flush logs to file
     */
    async flush() {
        if (this.logs.length === 0) {
            return;
        }
        const logsDir = getLogsDir(this.date, this.sessionId);
        const logFile = path.join(logsDir, `${this.component}.log`);
        const content = this.logs
            .map((entry) => {
            const timestamp = new Date(entry.timestamp).toISOString();
            const dataStr = entry.data ? `\n${JSON.stringify(entry.data, null, 2)}` : '';
            return `[${timestamp}] ${entry.level} ${entry.message}${dataStr}`;
        })
            .join('\n\n');
        await appendMarkdown(logFile, content + '\n\n');
    }
    /**
     * Get logs
     */
    getLogs() {
        return [...this.logs];
    }
    /**
     * Clear logs
     */
    clear() {
        this.logs = [];
    }
}
/**
 * Create a logger for a component
 */
export function createLogger(date, sessionId, component) {
    return new SessionLogger(date, sessionId, component);
}
