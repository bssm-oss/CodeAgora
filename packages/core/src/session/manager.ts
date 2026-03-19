/**
 * Session Manager
 * Handles .ca/ session lifecycle
 */

import { SessionMetadata } from '../types/core.js';
import {
  initSessionDirs,
  getNextSessionId,
  writeSessionMetadata,
  updateSessionStatus,
  getSessionDir,
} from '@codeagora/shared/utils/fs.js';

// ============================================================================
// Session Manager
// ============================================================================

export class SessionManager {
  private date: string;
  private sessionId: string;
  private metadata: SessionMetadata;

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
    if (status === 'completed' || status === 'failed') {
      this.metadata.completedAt = Date.now();
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
}
