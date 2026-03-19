/**
 * Logging System for V3
 */

import { appendMarkdown, getLogsDir } from './fs.js';
import path from 'path';

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
export class SessionLogger {
  private logs: LogEntry[] = [];

  constructor(
    private date: string,
    private sessionId: string,
    private component: string
  ) {}

  debug(message: string, data?: unknown): void {
    this.log('DEBUG', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('INFO', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('WARN', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('ERROR', message, data);
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = {
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
  async flush(): Promise<void> {
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
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Clear logs
   */
  clear(): void {
    this.logs = [];
  }
}

/**
 * Create a logger for a component
 */
export function createLogger(
  date: string,
  sessionId: string,
  component: string
): SessionLogger {
  return new SessionLogger(date, sessionId, component);
}
