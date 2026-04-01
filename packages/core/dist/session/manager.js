import {
  initSessionDirs,
  getNextSessionId,
  writeSessionMetadata,
  updateSessionStatus,
  getSessionDir
} from "@codeagora/shared/utils/fs.js";
class SessionManager {
  date;
  sessionId;
  metadata;
  constructor(date, sessionId, metadata) {
    this.date = date;
    this.sessionId = sessionId;
    this.metadata = metadata;
  }
  /**
   * Create a new session
   */
  static async create(diffPath) {
    const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const sessionId = await getNextSessionId(date);
    const metadata = {
      sessionId,
      date,
      timestamp: Date.now(),
      diffPath,
      status: "in_progress",
      startedAt: Date.now()
    };
    await initSessionDirs(date, sessionId);
    await writeSessionMetadata(date, sessionId, metadata);
    return new SessionManager(date, sessionId, metadata);
  }
  /**
   * Get session directory path
   */
  getDir() {
    return getSessionDir(this.date, this.sessionId);
  }
  /**
   * Get session metadata
   */
  getMetadata() {
    return { ...this.metadata };
  }
  /**
   * Update session status
   */
  async setStatus(status) {
    await updateSessionStatus(this.date, this.sessionId, status);
    this.metadata.status = status;
    if (status === "completed" || status === "failed") {
      this.metadata.completedAt = Date.now();
    }
  }
  /**
   * Get date
   */
  getDate() {
    return this.date;
  }
  /**
   * Get session ID
   */
  getSessionId() {
    return this.sessionId;
  }
}
export {
  SessionManager
};
