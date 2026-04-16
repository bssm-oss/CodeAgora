import fs from "fs/promises";
import path from "path";
import {
  CA_ROOT,
  initSessionDirs,
  getNextSessionId,
  writeSessionMetadata,
  updateSessionStatus,
  getSessionDir,
  readSessionMetadata
} from "@codeagora/shared/utils/fs.js";
class SessionManager {
  date;
  sessionId;
  metadata;
  cleanupRegistered = false;
  signalHandlers = /* @__PURE__ */ new Map();
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
    if (status === "completed" || status === "failed" || status === "interrupted") {
      this.metadata.completedAt = Date.now();
      this.unregisterCleanup();
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
  registerCleanup() {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;
    const signals = ["SIGINT", "SIGTERM"];
    for (const signal of signals) {
      const handler = () => {
        try {
          const metadataPath = path.join(
            getSessionDir(this.date, this.sessionId),
            "metadata.json"
          );
          const metadata = {
            ...this.metadata,
            status: "interrupted",
            completedAt: Date.now()
          };
          const fsSync = require("fs");
          fsSync.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
          process.stderr.write(`
Session interrupted. Partial results saved:
  agora sessions show ${this.date}/${this.sessionId}
`);
        } catch {
        }
        this.unregisterCleanup();
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
  unregisterCleanup() {
    if (!this.cleanupRegistered) return;
    for (const [signal, handler] of this.signalHandlers) {
      process.removeListener(signal, handler);
    }
    this.signalHandlers.clear();
    this.cleanupRegistered = false;
  }
}
const STALE_SESSION_THRESHOLD_MS = 4 * 60 * 60 * 1e3;
async function recoverStaleSessions() {
  const sessionsDir = path.join(CA_ROOT, "sessions");
  let recovered = 0;
  let dateDirs;
  try {
    dateDirs = await fs.readdir(sessionsDir);
  } catch {
    return 0;
  }
  const now = Date.now();
  for (const dateDir of dateDirs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDir)) continue;
    const datePath = path.join(sessionsDir, dateDir);
    let sessionIds;
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
        if (metadata.status === "in_progress" && now - metadata.startedAt > STALE_SESSION_THRESHOLD_MS) {
          await updateSessionStatus(dateDir, sessionId, "interrupted");
          recovered++;
        }
      } catch {
        continue;
      }
    }
  }
  return recovered;
}
export {
  SessionManager,
  recoverStaleSessions
};
