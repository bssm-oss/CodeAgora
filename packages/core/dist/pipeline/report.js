import { estimateCost } from "./cost-estimator.js";
async function generateReport(telemetry) {
  const json = telemetry.toJSON();
  const records = json.records;
  const summary = json.summary;
  const reviewerMeta = /* @__PURE__ */ new Map();
  const reviewerCostRaw = /* @__PURE__ */ new Map();
  for (const rec of records) {
    reviewerMeta.set(rec.reviewerId, {
      provider: rec.provider,
      model: rec.model,
      success: rec.success,
      error: rec.error
    });
    if (rec.usage) {
      const estimate = await estimateCost(rec.usage, rec.provider, rec.model);
      const prev = reviewerCostRaw.get(rec.reviewerId) ?? 0;
      if (estimate.totalCost < 0) {
        if (prev === 0) {
          reviewerCostRaw.set(rec.reviewerId, -1);
        }
      } else {
        const base = prev < 0 ? 0 : prev;
        reviewerCostRaw.set(rec.reviewerId, base + estimate.totalCost);
      }
    } else {
      if (!reviewerCostRaw.has(rec.reviewerId)) {
        reviewerCostRaw.set(rec.reviewerId, -1);
      }
    }
  }
  const perReviewer = summary.perReviewer.map((r) => {
    const meta = reviewerMeta.get(r.reviewerId) ?? { provider: "", model: "", success: true };
    const rawCost = reviewerCostRaw.get(r.reviewerId) ?? -1;
    const costStr = rawCost < 0 ? "N/A" : `$${rawCost.toFixed(4)}`;
    const entry = {
      reviewerId: r.reviewerId,
      provider: meta.provider,
      model: meta.model,
      calls: r.calls,
      latencyMs: r.latencyMs,
      tokens: r.tokens,
      cost: costStr,
      success: meta.success
    };
    if (meta.error !== void 0) {
      entry.error = meta.error;
    }
    return entry;
  });
  let totalCostValue = 0;
  let hasUnknownCost = false;
  for (const rec of records) {
    if (rec.usage) {
      const estimate = await estimateCost(rec.usage, rec.provider, rec.model);
      if (estimate.totalCost < 0) {
        hasUnknownCost = true;
      } else {
        totalCostValue += estimate.totalCost;
      }
    } else {
      hasUnknownCost = true;
    }
  }
  const totalCostStr = records.length === 0 ? "$0.0000" : hasUnknownCost && totalCostValue === 0 ? "N/A" : `$${totalCostValue.toFixed(4)}`;
  const averageLatencyMs = summary.totalCalls > 0 ? Math.round(summary.totalLatencyMs / summary.totalCalls) : 0;
  let slowest = null;
  if (perReviewer.length > 0) {
    const s = perReviewer.reduce((a, b) => a.latencyMs >= b.latencyMs ? a : b);
    slowest = { reviewerId: s.reviewerId, latencyMs: s.latencyMs };
  }
  let mostExpensive = null;
  const withRealCost = perReviewer.filter((r) => r.cost !== "N/A");
  if (withRealCost.length > 0) {
    const m = withRealCost.reduce((a, b) => {
      const ca = parseFloat(a.cost.slice(1));
      const cb = parseFloat(b.cost.slice(1));
      return ca >= cb ? a : b;
    });
    mostExpensive = { reviewerId: m.reviewerId, cost: m.cost };
  }
  return {
    summary: {
      totalCalls: summary.totalCalls,
      totalLatencyMs: summary.totalLatencyMs,
      totalTokens: summary.totalTokens,
      totalCost: totalCostStr,
      averageLatencyMs
    },
    perReviewer,
    slowest,
    mostExpensive
  };
}
function formatReportText(report) {
  const lines = [];
  lines.push("## Performance Report");
  lines.push("");
  lines.push("| Reviewer | Provider | Model | Latency | Tokens | Cost | Status |");
  lines.push("|----------|----------|-------|---------|--------|------|--------|");
  for (const r of report.perReviewer) {
    const status = r.success ? "OK" : `FAIL: ${r.error ?? "unknown"}`;
    lines.push(
      `| ${r.reviewerId} | ${r.provider} | ${r.model} | ${r.latencyMs}ms | ${r.tokens} | ${r.cost} | ${status} |`
    );
  }
  lines.push("");
  lines.push("### Summary");
  lines.push(`- Total calls: ${report.summary.totalCalls}`);
  lines.push(`- Total latency: ${report.summary.totalLatencyMs}ms`);
  lines.push(`- Average latency: ${report.summary.averageLatencyMs}ms`);
  lines.push(`- Total tokens: ${report.summary.totalTokens}`);
  lines.push(`- Total cost: ${report.summary.totalCost}`);
  if (report.slowest) {
    lines.push(`- Slowest reviewer: ${report.slowest.reviewerId} (${report.slowest.latencyMs}ms)`);
  }
  if (report.mostExpensive) {
    lines.push(`- Most expensive reviewer: ${report.mostExpensive.reviewerId} (${report.mostExpensive.cost})`);
  }
  return lines.join("\n");
}
function formatReportJson(report) {
  return JSON.stringify(report, null, 2);
}
export {
  formatReportJson,
  formatReportText,
  generateReport
};
