/**
 * Pipeline Telemetry
 * Collects per-reviewer token usage and latency data during pipeline execution.
 *
 * @experimental Not yet wired into the orchestrator. Preserved for future
 * integration once per-call instrumentation is added to L1/L2/L3 execution paths.
 */

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface BackendCallRecord {
  reviewerId: string;
  provider: string;
  model: string;
  latencyMs: number;
  usage?: TokenUsage;
  success: boolean;
  error?: string;
}

export interface TelemetrySummary {
  totalCalls: number;
  totalLatencyMs: number;
  totalTokens: number;
  perReviewer: Array<{
    reviewerId: string;
    calls: number;
    latencyMs: number;
    tokens: number;
  }>;
}

export class PipelineTelemetry {
  private records: BackendCallRecord[] = [];

  record(call: BackendCallRecord): void {
    this.records.push(call);
  }

  getSummary(): TelemetrySummary {
    const perReviewerMap = new Map<
      string,
      { calls: number; latencyMs: number; tokens: number }
    >();

    let totalLatencyMs = 0;
    let totalTokens = 0;

    for (const rec of this.records) {
      totalLatencyMs += rec.latencyMs;
      const tokens = rec.usage?.totalTokens ?? 0;
      totalTokens += tokens;

      const existing = perReviewerMap.get(rec.reviewerId) ?? {
        calls: 0,
        latencyMs: 0,
        tokens: 0,
      };
      perReviewerMap.set(rec.reviewerId, {
        calls: existing.calls + 1,
        latencyMs: existing.latencyMs + rec.latencyMs,
        tokens: existing.tokens + tokens,
      });
    }

    const perReviewer = Array.from(perReviewerMap.entries()).map(
      ([reviewerId, stats]) => ({ reviewerId, ...stats })
    );

    return {
      totalCalls: this.records.length,
      totalLatencyMs,
      totalTokens,
      perReviewer,
    };
  }

  toJSON(): object {
    return {
      records: this.records,
      summary: this.getSummary(),
    };
  }

  reset(): void {
    this.records = [];
  }
}
