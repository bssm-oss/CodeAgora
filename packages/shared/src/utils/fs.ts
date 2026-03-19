/**
 * Filesystem utilities for .ca/ directory management
 */

import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { SessionMetadata } from '@codeagora/core/types/core.js';

// ============================================================================
// Directory Structure
// ============================================================================

export const CA_ROOT = '.ca';

export function getSessionDir(date: string, sessionId: string): string {
  return path.join(CA_ROOT, 'sessions', date, sessionId);
}

export function getReviewsDir(date: string, sessionId: string): string {
  return path.join(getSessionDir(date, sessionId), 'reviews');
}

export function getDiscussionsDir(date: string, sessionId: string): string {
  return path.join(getSessionDir(date, sessionId), 'discussions');
}

export function getUnconfirmedDir(date: string, sessionId: string): string {
  return path.join(getSessionDir(date, sessionId), 'unconfirmed');
}

export function getLogsDir(date: string, sessionId: string): string {
  return path.join(CA_ROOT, 'logs', date, sessionId);
}

// ============================================================================
// File Paths
// ============================================================================

export function getConfigPath(): string {
  return path.join(CA_ROOT, 'config.json');
}

export function getSuggestionsPath(date: string, sessionId: string): string {
  return path.join(getSessionDir(date, sessionId), 'suggestions.md');
}

export function getReportPath(date: string, sessionId: string): string {
  return path.join(getSessionDir(date, sessionId), 'report.md');
}

export function getResultPath(date: string, sessionId: string): string {
  return path.join(getSessionDir(date, sessionId), 'result.md');
}

export function getMetadataPath(date: string, sessionId: string): string {
  return path.join(getSessionDir(date, sessionId), 'metadata.json');
}

// ============================================================================
// Directory Creation
// ============================================================================

export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore if directory already exists
    if (error instanceof Error && 'code' in error && error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Ensure the .ca/ root directory exists with secure permissions (0o700).
 * Fixes permissions if already exists with wrong mode.
 * Skipped on Windows.
 */
export async function ensureCaRoot(baseDir: string = '.'): Promise<void> {
  const caDir = path.join(baseDir, CA_ROOT);

  await ensureDir(caDir);

  // Enforce 0o700 permissions on Unix
  if (process.platform !== 'win32') {
    try {
      const stat = await fs.stat(caDir);
      const mode = stat.mode & 0o777;
      if (mode !== 0o700) {
        await fs.chmod(caDir, 0o700);
      }
    } catch {
      // Best effort — directory may have just been created
    }
  }
}

export async function initSessionDirs(
  date: string,
  sessionId: string
): Promise<void> {
  // Ensure .ca/ root has secure permissions first
  await ensureCaRoot();

  const dirs = [
    getSessionDir(date, sessionId),
    getReviewsDir(date, sessionId),
    getDiscussionsDir(date, sessionId),
    getUnconfirmedDir(date, sessionId),
    getLogsDir(date, sessionId),
  ];

  await Promise.all(dirs.map((dir) => ensureDir(dir)));
}

// ============================================================================
// File Operations
// ============================================================================

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function readJson<T>(filePath: string, schema?: z.ZodType<T>): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8');
  const raw = JSON.parse(content);
  if (schema) return schema.parse(raw);
  return raw as T;
}

export async function writeMarkdown(
  filePath: string,
  content: string
): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function readMarkdown(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

export async function appendMarkdown(
  filePath: string,
  content: string
): Promise<void> {
  await fs.appendFile(filePath, content, 'utf-8');
}

// ============================================================================
// Session ID Generation
// ============================================================================

export async function getNextSessionId(date: string): Promise<string> {
  const sessionsDir = path.join(CA_ROOT, 'sessions', date);
  await ensureDir(sessionsDir);

  const lockPath = path.join(sessionsDir, '.lock');
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Acquire lock using atomic mkdir (fails if already exists)
      await fs.mkdir(lockPath);
    } catch {
      // Check for stale lock (process crashed while holding it)
      try {
        const lockStat = await fs.stat(lockPath);
        if (Date.now() - lockStat.mtimeMs > 60_000) {
          // Lock is older than 60s — likely stale, force remove and retry
          await fs.rmdir(lockPath);
          continue;
        }
      } catch {
        // Lock was just removed by another process — retry
      }
      // Lock held by another process, wait and retry
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
      continue;
    }

    try {
      const entries = await fs.readdir(sessionsDir);
      const sessionNumbers = entries
        .filter((e) => /^\d{3}$/.test(e))
        .map((e) => parseInt(e, 10));

      const maxId = sessionNumbers.length > 0 ? Math.max(...sessionNumbers) : 0;
      const nextId = String(maxId + 1).padStart(3, '0');

      // Create the session dir while holding the lock to reserve the ID
      await ensureDir(path.join(sessionsDir, nextId));

      return nextId;
    } finally {
      // Release lock
      try {
        await fs.rmdir(lockPath);
      } catch {
        // Best effort cleanup
      }
    }
  }

  // Fallback: use high-entropy ID to avoid collision with sequential IDs
  const fallback = 900 + Math.floor(Math.random() * 99);
  const fallbackId = String(fallback).padStart(3, '0');

  // Verify no collision with existing session
  const entries = await fs.readdir(sessionsDir).catch(() => [] as string[]);
  if (entries.includes(fallbackId)) {
    // Last resort: retry with different random in same safe range
    const lastResortId = String(Date.now() % 99 + 900).padStart(3, '0');
    await ensureDir(path.join(sessionsDir, lastResortId));
    return lastResortId;
  }

  await ensureDir(path.join(sessionsDir, fallbackId));
  return fallbackId;
}

// ============================================================================
// Metadata Operations
// ============================================================================

export async function writeSessionMetadata(
  date: string,
  sessionId: string,
  metadata: SessionMetadata
): Promise<void> {
  const metadataPath = getMetadataPath(date, sessionId);
  await writeJson(metadataPath, metadata);
}

export async function readSessionMetadata(
  date: string,
  sessionId: string
): Promise<SessionMetadata> {
  const metadataPath = getMetadataPath(date, sessionId);
  return readJson<SessionMetadata>(metadataPath);
}

export async function updateSessionStatus(
  date: string,
  sessionId: string,
  status: SessionMetadata['status']
): Promise<void> {
  const metadata = await readSessionMetadata(date, sessionId);
  metadata.status = status;
  if (status === 'completed' || status === 'failed') {
    metadata.completedAt = Date.now();
  }
  await writeSessionMetadata(date, sessionId, metadata);
}
