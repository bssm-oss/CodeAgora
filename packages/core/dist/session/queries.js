import fs from "fs/promises";
import path from "path";
import { validateDiffPath } from "@codeagora/shared/utils/path-validation.js";
async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function extractIssueObjects(verdict) {
  for (const key of ["issues", "findings", "items"]) {
    const val = verdict[key];
    if (Array.isArray(val)) {
      return val.map((item) => {
        if (typeof item === "object" && item !== null) {
          const obj = item;
          return {
            title: String(obj["title"] ?? obj["description"] ?? obj["message"] ?? JSON.stringify(item)),
            severity: typeof obj["severity"] === "string" ? obj["severity"] : void 0
          };
        }
        return { title: String(item) };
      });
    }
  }
  return [];
}
function extractIssues(verdict) {
  return extractIssueObjects(verdict).map((o) => o.title);
}
async function listSessions(baseDir, options) {
  const limit = options?.limit ?? 10;
  const sessionsDir = path.join(baseDir, ".ca", "sessions");
  let dateDirs;
  try {
    const entries = await fs.readdir(sessionsDir);
    dateDirs = entries.filter((d) => !d.includes("..")).sort().reverse();
  } catch {
    return [];
  }
  const results = [];
  for (const dateDir of dateDirs) {
    const datePath = path.join(sessionsDir, dateDir);
    let stat;
    try {
      stat = await fs.stat(datePath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    let sessionIds;
    try {
      const entries = await fs.readdir(datePath);
      sessionIds = entries.sort().reverse();
    } catch {
      continue;
    }
    for (const sessionId of sessionIds) {
      const sessionPath = path.join(datePath, sessionId);
      let sStat;
      try {
        sStat = await fs.stat(sessionPath);
      } catch {
        continue;
      }
      if (!sStat.isDirectory()) continue;
      const metadataPath = path.join(sessionPath, "metadata.json");
      const metadata = await readJsonFile(metadataPath);
      const status = metadata && typeof metadata["status"] === "string" ? metadata["status"] : "unknown";
      results.push({
        id: `${dateDir}/${sessionId}`,
        date: dateDir,
        sessionId,
        status,
        dirPath: sessionPath
      });
    }
  }
  let filtered = results;
  if (options?.status) {
    filtered = filtered.filter((e) => e.status === options.status);
  }
  if (options?.after) {
    filtered = filtered.filter((e) => e.date >= options.after);
  }
  if (options?.before) {
    filtered = filtered.filter((e) => e.date <= options.before);
  }
  if (options?.keyword) {
    const kw = options.keyword.toLowerCase();
    const matched = [];
    for (const entry of filtered) {
      const metadata = await readJsonFile(path.join(entry.dirPath, "metadata.json"));
      const verdict = await readJsonFile(path.join(entry.dirPath, "head-verdict.json"));
      const haystack = ((metadata ? JSON.stringify(metadata) : "") + (verdict ? JSON.stringify(verdict) : "")).toLowerCase();
      if (haystack.includes(kw)) {
        matched.push(entry);
      }
    }
    filtered = matched;
  }
  const sort = options?.sort ?? "date";
  if (sort === "status") {
    filtered = filtered.slice().sort((a, b) => a.status.localeCompare(b.status));
  } else if (sort === "issues") {
    const withCounts = await Promise.all(
      filtered.map(async (entry) => {
        const verdict = await readJsonFile(path.join(entry.dirPath, "head-verdict.json"));
        const count = verdict ? extractIssueObjects(verdict).length : 0;
        return { entry, count };
      })
    );
    withCounts.sort((a, b) => b.count - a.count);
    filtered = withCounts.map((x) => x.entry);
  }
  return filtered.slice(0, limit);
}
async function getSessionStats(baseDir) {
  const sessionsDir = path.join(baseDir, ".ca", "sessions");
  let dateDirs;
  try {
    const entries = await fs.readdir(sessionsDir);
    dateDirs = entries.filter((d) => !d.includes("..")).sort();
  } catch {
    return {
      totalSessions: 0,
      completed: 0,
      failed: 0,
      inProgress: 0,
      successRate: 0,
      severityDistribution: {}
    };
  }
  let totalSessions = 0;
  let completed = 0;
  let failed = 0;
  let inProgress = 0;
  const severityDistribution = {};
  for (const dateDir of dateDirs) {
    const datePath = path.join(sessionsDir, dateDir);
    let stat;
    try {
      stat = await fs.stat(datePath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    let sessionIds;
    try {
      sessionIds = await fs.readdir(datePath);
    } catch {
      continue;
    }
    for (const sessionId of sessionIds) {
      const sessionPath = path.join(datePath, sessionId);
      let sStat;
      try {
        sStat = await fs.stat(sessionPath);
      } catch {
        continue;
      }
      if (!sStat.isDirectory()) continue;
      totalSessions++;
      const metadata = await readJsonFile(path.join(sessionPath, "metadata.json"));
      const status = metadata && typeof metadata["status"] === "string" ? metadata["status"] : "unknown";
      if (status === "completed") completed++;
      else if (status === "failed") failed++;
      else if (status === "in_progress") inProgress++;
      const verdict = await readJsonFile(path.join(sessionPath, "head-verdict.json"));
      if (verdict) {
        for (const issue of extractIssueObjects(verdict)) {
          const severity = issue.severity ?? "unknown";
          severityDistribution[severity] = (severityDistribution[severity] ?? 0) + 1;
        }
      }
    }
  }
  const successRate = totalSessions > 0 ? Math.round(completed / totalSessions * 1e3) / 10 : 0;
  return { totalSessions, completed, failed, inProgress, successRate, severityDistribution };
}
async function showSession(baseDir, sessionPath) {
  const parts = sessionPath.split("/");
  if (parts.length !== 2) {
    throw new Error(`Invalid session path format: "${sessionPath}". Expected "YYYY-MM-DD/NNN".`);
  }
  const date = parts[0];
  const sessionId = parts[1];
  const allowedRoot = path.join(baseDir, ".ca", "sessions");
  const dirPath = path.join(allowedRoot, date, sessionId);
  const validation = validateDiffPath(dirPath, { allowedRoots: [allowedRoot] });
  if (!validation.success) {
    throw new Error(`Invalid session path: "${sessionPath}".`);
  }
  try {
    await fs.access(dirPath);
  } catch {
    throw new Error(`Session not found: ${sessionPath}`);
  }
  const metadata = await readJsonFile(path.join(dirPath, "metadata.json")) ?? void 0;
  const verdict = await readJsonFile(path.join(dirPath, "head-verdict.json")) ?? void 0;
  const status = metadata && typeof metadata["status"] === "string" ? metadata["status"] : "unknown";
  const entry = {
    id: sessionPath,
    date,
    sessionId,
    status,
    dirPath
  };
  return { entry, metadata, verdict };
}
function formatSessionStats(stats) {
  const lines = [];
  const divider1 = "\u2500".repeat(17);
  const divider2 = "\u2500".repeat(21);
  lines.push("Review Statistics");
  lines.push(divider1);
  const pct = (n) => stats.totalSessions > 0 ? ` (${(n / stats.totalSessions * 100).toFixed(1)}%)` : "";
  lines.push(`Total sessions:  ${stats.totalSessions}`);
  lines.push(`Completed:       ${stats.completed} (${stats.successRate.toFixed(1)}%)`);
  lines.push(`Failed:          ${stats.failed}${pct(stats.failed)}`);
  lines.push(`In Progress:     ${stats.inProgress}${pct(stats.inProgress)}`);
  lines.push("");
  lines.push("Severity Distribution");
  lines.push(divider2);
  const severityKeys = Object.keys(stats.severityDistribution);
  if (severityKeys.length === 0) {
    lines.push("No issues recorded.");
  } else {
    for (const sev of severityKeys) {
      const count = stats.severityDistribution[sev];
      lines.push(`${sev}:`.padEnd(20) + `  ${count}`);
    }
  }
  return lines.join("\n");
}
async function diffSessions(baseDir, session1, session2) {
  const [detail1, detail2] = await Promise.all([
    showSession(baseDir, session1),
    showSession(baseDir, session2)
  ]);
  const issues1 = detail1.verdict ? extractIssues(detail1.verdict) : [];
  const issues2 = detail2.verdict ? extractIssues(detail2.verdict) : [];
  const set1 = new Set(issues1);
  const set2 = new Set(issues2);
  const removed = issues1.filter((t) => !set2.has(t));
  const added = issues2.filter((t) => !set1.has(t));
  const unchanged = issues1.filter((t) => set2.has(t)).length;
  return { session1, session2, added, removed, unchanged };
}
export {
  diffSessions,
  formatSessionStats,
  getSessionStats,
  listSessions,
  showSession
};
