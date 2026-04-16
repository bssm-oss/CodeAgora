import { trackDevilsAdvocate } from "../l2/devils-advocate-tracker.js";
import { generateReport, formatReportText } from "./report.js";
function buildReviewerMap(results) {
  const map = {};
  for (const r of results) {
    for (const doc of r.evidenceDocs) {
      const key = `${doc.filePath}:${doc.lineRange[0]}`;
      if (!map[key]) map[key] = [];
      if (!map[key].includes(r.reviewerId)) {
        map[key].push(r.reviewerId);
      }
    }
  }
  return map;
}
function buildReviewerOpinions(results) {
  const map = {};
  for (const r of results) {
    if (r.status !== "success") continue;
    for (const doc of r.evidenceDocs) {
      const key = `${doc.filePath}:${doc.lineRange[0]}`;
      if (!map[key]) map[key] = [];
      map[key].push({
        reviewerId: r.reviewerId,
        model: r.model,
        severity: doc.severity,
        problem: doc.problem,
        evidence: doc.evidence,
        suggestion: doc.suggestion
      });
    }
  }
  return map;
}
function buildSupporterModelMap(supporters) {
  const map = {};
  for (const s of supporters.pool) {
    map[s.id] = s.model;
  }
  if (supporters.devilsAdvocate?.enabled) {
    map[supporters.devilsAdvocate.id] = supporters.devilsAdvocate.model;
  }
  return map;
}
function mergeReviewOutputsByReviewer(results) {
  const map = /* @__PURE__ */ new Map();
  for (const r of results) {
    const existing = map.get(r.reviewerId);
    if (!existing) {
      map.set(r.reviewerId, { ...r, evidenceDocs: [...r.evidenceDocs] });
    } else {
      existing.evidenceDocs.push(...r.evidenceDocs);
      if (r.status === "success") existing.status = "success";
    }
  }
  return [...map.values()];
}
function trackDA(config, report) {
  const da = config.supporters?.devilsAdvocate;
  if (!da?.enabled) return void 0;
  return trackDevilsAdvocate(da.id, report.roundsPerDiscussion, report.discussions);
}
async function generatePerformanceText(telemetry) {
  try {
    const report = await generateReport(telemetry);
    if (report.summary.totalCalls === 0) return "";
    return formatReportText(report);
  } catch {
    return "";
  }
}
export {
  buildReviewerMap,
  buildReviewerOpinions,
  buildSupporterModelMap,
  generatePerformanceText,
  mergeReviewOutputsByReviewer,
  trackDA
};
