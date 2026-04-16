class PipelineTelemetry {
  records = [];
  record(call) {
    this.records.push(call);
  }
  getSummary() {
    const perReviewerMap = /* @__PURE__ */ new Map();
    let totalLatencyMs = 0;
    let totalTokens = 0;
    for (const rec of this.records) {
      totalLatencyMs += rec.latencyMs;
      const tokens = rec.usage?.totalTokens ?? 0;
      totalTokens += tokens;
      const existing = perReviewerMap.get(rec.reviewerId) ?? {
        calls: 0,
        latencyMs: 0,
        tokens: 0
      };
      perReviewerMap.set(rec.reviewerId, {
        calls: existing.calls + 1,
        latencyMs: existing.latencyMs + rec.latencyMs,
        tokens: existing.tokens + tokens
      });
    }
    const perReviewer = Array.from(perReviewerMap.entries()).map(
      ([reviewerId, stats]) => ({ reviewerId, ...stats })
    );
    return {
      totalCalls: this.records.length,
      totalLatencyMs,
      totalTokens,
      perReviewer
    };
  }
  toJSON() {
    return {
      records: this.records,
      summary: this.getSummary()
    };
  }
}
export {
  PipelineTelemetry
};
