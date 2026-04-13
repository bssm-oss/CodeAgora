/**
 * Session Manager
 * Handles .ca/ session lifecycle including process signal cleanup
 * and stale session recovery.
 */

import fs from 'fs/promises';
import path from 'path';
import { SessionMetadata } from '../types/core.js';
import {
  CA_ROOT,
  initSessionDirs,
  getNextSessionId,
  writeSessionMetadata,
  updateSessionStatus,
  getSessionDir,
  readSessionMetadata,
} from '@codeagora/shared/utils/fs.js';

// ============================================================================
// Session Manager
// ============================================================================

export class SessionManager {
  private date: string;
  private sessionId: string;
  private metadata: SessionMetadata;
  private cleanupRegistered = false;
  private signalHandlers: Map<string, () => void> = new Map();

  private constructor(date: string, sessionId: string, metadata: SessionMetadata) {
    this.date = date;
    this.sessionId = sessionId;
    this.metadata = metadata;
  }

  /**
   * Create a new session
   */
  static async create(diffPath: string): Promise<SessionManager> {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const sessionId = await getNextSessionId(date);

    const metadata: SessionMetadata = {
      sessionId,
      date,
      timestamp: Date.now(),
      diffPath,
      status: 'in_progress',
      startedAt: Date.now(),
    };

    // Initialize directory structure
    await initSessionDirs(date, sessionId);

    // Write metadata
    await writeSessionMetadata(date, sessionId, metadata);

    return new SessionManager(date, sessionId, metadata);
  }

  /**
   * Get session directory path
   */
  getDir(): string {
    return getSessionDir(this.date, this.sessionId);
  }

  /**
   * Get session metadata
   */
  getMetadata(): SessionMetadata {
    return { ...this.metadata };
  }

  /**
   * Update session status
   */
  async setStatus(status: SessionMetadata['status']): Promise<void> {
    await updateSessionStatus(this.date, this.sessionId, status);
    this.metadata.status = status;
    if (status === 'completed' || status === 'failed' || status === 'interrupted') {
      this.metadata.completedAt = Date.now();
      // Terminal state reached normally — remove signal handlers
      this.unregisterCleanup();
    }
  }

  /**
   * Get date
   */
  getDate(): string {
    return this.date;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  // ==========================================================================
  // Process Signal Cleanup
  // ==========================================================================

  /**
   * Register process signal handlers (SIGINT, SIGTERM) that mark this session
   * as 'interrupted' before exit. Also handles uncaught exceptions.
   *
   * Call `unregisterCleanup()` after the session completes or fails normally
   * to remove the handlers.
   */
  registerCleanup(): void {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;

    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

    for (const signal of signals) {
      const handler = () => {
        // Use synchronous write to maximize chance of persisting before exit.
        // updateSessionStatus is async and may not finish if process is dying,
        // so we write the metadata file directly via writeFileSync.
        try {
          const metadataPath = path.join(
            getSessionDir(this.date, this.sessionId),
            'metadata.json'
          );
          const metadata: SessionMetadata = {
            ...this.metadata,
            status: 'interrupted',
            completedAt: Date.now(),
          };
          const fsSync = require('fs') as typeof import('fs');
          fsSync.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
          process.stderr.write(`\nSession interrupted. Partial results saved:\n  agora sessions show ${this.date}/${this.sessionId}\n`);
        } catch {
          // Best effort — process is dying, nothing more we can do
        }

        // Remove our handlers so the default signal behavior can proceed
        this.unregisterCleanup();

        // Re-raise the signal so the process exits with the correct code
        process.kill(process.pid, signal);
      };

      this.signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }
  }

  /**
   * Remove previously registered signal handlers.
   * Should be called when the session reaches a terminal state normally.
   */
  unregisterCleanup(): void {
    if (!this.cleanupRegistered) return;

    for (const [signal, handler] of this.signalHandlers) {
      process.removeListener(signal, handler);
    }
    this.signalHandlers.clear();
    this.cleanupRegistered = false;
  }
}

// ============================================================================
// Stale Session Recovery
// ============================================================================

/** Max age (ms) for an in_progress session before it is considered stale */
const STALE_SESSION_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Scan all sessions and mark any stale 'in_progress' sessions as 'interrupted'.
 *
 * A session is considered stale if:
 * - Its status is 'in_progress'
 * - Its startedAt timestamp is older than STALE_SESSION_THRESHOLD_MS (4 hours)
 *
 * This should be called at pipeline startup to recover from previous crashes.
 * Errors are swallowed — stale session recovery is best-effort.
 */
export async function recoverStaleSessions(): Promise<number> {
  const sessionsDir = path.join(CA_ROOT, 'sessions');
  let recovered = 0;

  let dateDirs: string[];
  try {
    dateDirs = await fs.readdir(sessionsDir);
  } catch {
    return 0; // No sessions dir yet — nothing to recover
  }

  const now = Date.now();

  for (const dateDir of dateDirs) {
    // Skip non-date entries (e.g. hidden files)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDir)) continue;

    const datePath = path.join(sessionsDir, dateDir);
    let sessionIds: string[];
    try {
      const stat = await fs.stat(datePath);
      if (!stat.isDirectory()) continue;
      sessionIds = await fs.readdir(datePath);
    } catch {
      continue;
    }

    for (const sessionId of sessionIds) {
      if (!/^\d{3}$/.test(sessionId)) continue;

      try {
        const metadata = await readSessionMetadata(dateDir, sessionId);

        if (
          metadata.status === 'in_progress' &&
          now - metadata.startedAt > STALE_SESSION_THRESHOLD_MS
        ) {
          await updateSessionStatus(dateDir, sessionId, 'interrupted');
          recovered++;
        }
      } catch {
        // Skip unreadable sessions
        continue;
      }
    }
  }

  return recovered;
}
