/**
 * Filesystem utilities for .ca/ directory management
 */
import { z } from 'zod';
import type { SessionMetadata } from '../types/session.js';
export declare const CA_ROOT = ".ca";
export declare function getSessionDir(date: string, sessionId: string): string;
export declare function getReviewsDir(date: string, sessionId: string): string;
export declare function getDiscussionsDir(date: string, sessionId: string): string;
export declare function getUnconfirmedDir(date: string, sessionId: string): string;
export declare function getLogsDir(date: string, sessionId: string): string;
export declare function getConfigPath(): string;
export declare function getSuggestionsPath(date: string, sessionId: string): string;
export declare function getReportPath(date: string, sessionId: string): string;
export declare function getResultPath(date: string, sessionId: string): string;
export declare function getMetadataPath(date: string, sessionId: string): string;
export declare function ensureDir(dirPath: string): Promise<void>;
/**
 * Ensure the .ca/ root directory exists with secure permissions (0o700).
 * Fixes permissions if already exists with wrong mode.
 * Skipped on Windows.
 */
export declare function ensureCaRoot(baseDir?: string): Promise<void>;
export declare function initSessionDirs(date: string, sessionId: string): Promise<void>;
export declare function writeJson(filePath: string, data: unknown): Promise<void>;
export declare function readJson<T>(filePath: string, schema?: z.ZodType<T>): Promise<T>;
export declare function writeMarkdown(filePath: string, content: string): Promise<void>;
export declare function readMarkdown(filePath: string): Promise<string>;
export declare function appendMarkdown(filePath: string, content: string): Promise<void>;
export declare function getNextSessionId(date: string): Promise<string>;
export declare function writeSessionMetadata(date: string, sessionId: string, metadata: SessionMetadata): Promise<void>;
export declare function readSessionMetadata(date: string, sessionId: string): Promise<SessionMetadata>;
export declare function updateSessionStatus(date: string, sessionId: string, status: SessionMetadata['status']): Promise<void>;
//# sourceMappingURL=fs.d.ts.map