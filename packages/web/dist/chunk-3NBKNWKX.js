// ../shared/src/utils/fs.ts
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
var CA_ROOT = ".ca";
function getSessionDir(date, sessionId) {
  return path.join(CA_ROOT, "sessions", date, sessionId);
}
function getReviewsDir(date, sessionId) {
  return path.join(getSessionDir(date, sessionId), "reviews");
}
function getDiscussionsDir(date, sessionId) {
  return path.join(getSessionDir(date, sessionId), "discussions");
}
function getUnconfirmedDir(date, sessionId) {
  return path.join(getSessionDir(date, sessionId), "unconfirmed");
}
function getLogsDir(date, sessionId) {
  return path.join(CA_ROOT, "logs", date, sessionId);
}
function getConfigPath() {
  return path.join(CA_ROOT, "config.json");
}
function getSuggestionsPath(date, sessionId) {
  return path.join(getSessionDir(date, sessionId), "suggestions.md");
}
function getReportPath(date, sessionId) {
  return path.join(getSessionDir(date, sessionId), "report.md");
}
function getResultPath(date, sessionId) {
  return path.join(getSessionDir(date, sessionId), "result.md");
}
function getMetadataPath(date, sessionId) {
  return path.join(getSessionDir(date, sessionId), "metadata.json");
}
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code !== "EEXIST") {
      throw error;
    }
  }
}
async function ensureCaRoot(baseDir = ".") {
  const caDir = path.join(baseDir, CA_ROOT);
  await ensureDir(caDir);
  if (process.platform !== "win32") {
    try {
      const stat = await fs.stat(caDir);
      const mode = stat.mode & 511;
      if (mode !== 448) {
        await fs.chmod(caDir, 448);
      }
    } catch {
    }
  }
}
async function initSessionDirs(date, sessionId) {
  await ensureCaRoot();
  const dirs = [
    getSessionDir(date, sessionId),
    getReviewsDir(date, sessionId),
    getDiscussionsDir(date, sessionId),
    getUnconfirmedDir(date, sessionId),
    getLogsDir(date, sessionId)
  ];
  await Promise.all(dirs.map((dir) => ensureDir(dir)));
}
async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
async function readJson(filePath, schema) {
  const content = await fs.readFile(filePath, "utf-8");
  let raw;
  try {
    raw = JSON.parse(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`JSON parse error in ${filePath}: ${msg}`);
  }
  if (schema) return schema.parse(raw);
  return raw;
}
async function writeMarkdown(filePath, content) {
  await fs.writeFile(filePath, content, "utf-8");
}
async function readMarkdown(filePath) {
  return fs.readFile(filePath, "utf-8");
}
async function appendMarkdown(filePath, content) {
  await fs.appendFile(filePath, content, "utf-8");
}
async function getNextSessionId(date) {
  const sessionsDir = path.join(CA_ROOT, "sessions", date);
  await ensureDir(sessionsDir);
  const lockPath = path.join(sessionsDir, ".lock");
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await fs.mkdir(lockPath);
    } catch {
      try {
        const lockStat = await fs.stat(lockPath);
        if (Date.now() - lockStat.mtimeMs > 6e4) {
          await fs.rmdir(lockPath);
          continue;
        }
      } catch {
      }
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
      continue;
    }
    try {
      const entries2 = await fs.readdir(sessionsDir);
      const sessionNumbers = entries2.filter((e) => /^\d{3}$/.test(e)).map((e) => parseInt(e, 10));
      const maxId = sessionNumbers.length > 0 ? Math.max(...sessionNumbers) : 0;
      const nextId = String(maxId + 1).padStart(3, "0");
      await ensureDir(path.join(sessionsDir, nextId));
      return nextId;
    } finally {
      try {
        await fs.rmdir(lockPath);
      } catch {
      }
    }
  }
  const fallback = 900 + Math.floor(Math.random() * 99);
  const fallbackId = String(fallback).padStart(3, "0");
  const entries = await fs.readdir(sessionsDir).catch(() => []);
  if (entries.includes(fallbackId)) {
    const lastResortId = String(900 + crypto.randomInt(99)).padStart(3, "0");
    await ensureDir(path.join(sessionsDir, lastResortId));
    return lastResortId;
  }
  await ensureDir(path.join(sessionsDir, fallbackId));
  return fallbackId;
}
async function writeSessionMetadata(date, sessionId, metadata) {
  const metadataPath = getMetadataPath(date, sessionId);
  await writeJson(metadataPath, metadata);
}
async function readSessionMetadata(date, sessionId) {
  const metadataPath = getMetadataPath(date, sessionId);
  return readJson(metadataPath);
}
async function updateSessionStatus(date, sessionId, status) {
  const metadata = await readSessionMetadata(date, sessionId);
  metadata.status = status;
  if (status === "completed" || status === "failed" || status === "interrupted") {
    metadata.completedAt = Date.now();
  }
  await writeSessionMetadata(date, sessionId, metadata);
}

export {
  CA_ROOT,
  getSessionDir,
  getReviewsDir,
  getDiscussionsDir,
  getUnconfirmedDir,
  getLogsDir,
  getConfigPath,
  getSuggestionsPath,
  getReportPath,
  getResultPath,
  getMetadataPath,
  ensureDir,
  ensureCaRoot,
  initSessionDirs,
  writeJson,
  readJson,
  writeMarkdown,
  readMarkdown,
  appendMarkdown,
  getNextSessionId,
  writeSessionMetadata,
  readSessionMetadata,
  updateSessionStatus
};
