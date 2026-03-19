/**
 * Pipeline Telemetry Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineTelemetry } from '@codeagora/core/pipeline/telemetry.js';
import type { BackendCallRecord } from '@codeagora/core/pipeline/telemetry.js';

describe('PipelineTelemetry', () => {
  let telemetry: PipelineTelemetry;

  beforeEach(() => {
    telemetry = new PipelineTelemetry();
  });

  it('record() 후 getSummary()에 반영', () => {
    const call: BackendCallRecord = {
      reviewerId: 'reviewer-a',
      provider: 'anthropic',
      model: 'claude-3-haiku',
      latencyMs: 500,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      success: true,
    };
    telemetry.record(call);
    const summary = telemetry.getSummary();
    expect(summary.totalCalls).toBe(1);
    expect(summary.totalLatencyMs).toBe(500);
    expect(summary.totalTokens).toBe(150);
    expect(summary.perReviewer).toHaveLength(1);
    expect(summary.perReviewer[0].reviewerId).toBe('reviewer-a');
  });

  it('여러 record() 후 전체 합계 정확', () => {
    telemetry.record({
      reviewerId: 'reviewer-a',
      provider: 'anthropic',
      model: 'claude-3-haiku',
      latencyMs: 300,
      usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
      success: true,
    });
    telemetry.record({
      reviewerId: 'reviewer-b',
      provider: 'openai',
      model: 'gpt-4o',
      latencyMs: 700,
      usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      success: true,
    });
    const summary = telemetry.getSummary();
    expect(summary.totalCalls).toBe(2);
    expect(summary.totalLatencyMs).toBe(1000);
    expect(summary.totalTokens).toBe(420);
  });

  it('perReviewer 그룹핑 정확', () => {
    telemetry.record({
      reviewerId: 'reviewer-a',
      provider: 'anthropic',
      model: 'claude-3-haiku',
      latencyMs: 200,
      usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      success: true,
    });
    telemetry.record({
      reviewerId: 'reviewer-a',
      provider: 'anthropic',
      model: 'claude-3-haiku',
      latencyMs: 300,
      usage: { promptTokens: 60, completionTokens: 30, totalTokens: 90 },
      success: true,
    });
    telemetry.record({
      reviewerId: 'reviewer-b',
      provider: 'openai',
      model: 'gpt-4o',
      latencyMs: 400,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      success: true,
    });
    const summary = telemetry.getSummary();
    expect(summary.perReviewer).toHaveLength(2);
    const a = summary.perReviewer.find((r) => r.reviewerId === 'reviewer-a')!;
    expect(a.calls).toBe(2);
    expect(a.latencyMs).toBe(500);
    expect(a.tokens).toBe(165);
    const b = summary.perReviewer.find((r) => r.reviewerId === 'reviewer-b')!;
    expect(b.calls).toBe(1);
    expect(b.latencyMs).toBe(400);
    expect(b.tokens).toBe(150);
  });

  it('usage 없는 record (CLI backend) → tokens 0으로 처리', () => {
    telemetry.record({
      reviewerId: 'reviewer-cli',
      provider: 'cli',
      model: 'opencode',
      latencyMs: 1200,
      success: true,
      // no usage field
    });
    const summary = telemetry.getSummary();
    expect(summary.totalTokens).toBe(0);
    expect(summary.perReviewer[0].tokens).toBe(0);
  });

  it('toJSON() 결과가 JSON.stringify 가능', () => {
    telemetry.record({
      reviewerId: 'reviewer-a',
      provider: 'anthropic',
      model: 'claude-3-haiku',
      latencyMs: 500,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      success: true,
    });
    const json = telemetry.toJSON();
    expect(() => JSON.stringify(json)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(json));
    expect(parsed).toHaveProperty('records');
    expect(parsed).toHaveProperty('summary');
  });

  it('reset() 후 빈 summary', () => {
    telemetry.record({
      reviewerId: 'reviewer-a',
      provider: 'anthropic',
      model: 'claude-3-haiku',
      latencyMs: 500,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      success: true,
    });
    telemetry.reset();
    const summary = telemetry.getSummary();
    expect(summary.totalCalls).toBe(0);
    expect(summary.totalLatencyMs).toBe(0);
    expect(summary.totalTokens).toBe(0);
    expect(summary.perReviewer).toHaveLength(0);
  });

  it('실패한 call도 latency에 포함', () => {
    telemetry.record({
      reviewerId: 'reviewer-a',
      provider: 'anthropic',
      model: 'claude-3-haiku',
      latencyMs: 800,
      success: false,
      error: 'timeout',
    });
    const summary = telemetry.getSummary();
    expect(summary.totalCalls).toBe(1);
    expect(summary.totalLatencyMs).toBe(800);
  });

  it('빈 상태에서 getSummary() → 기본값 반환', () => {
    const summary = telemetry.getSummary();
    expect(summary.totalCalls).toBe(0);
    expect(summary.totalLatencyMs).toBe(0);
    expect(summary.totalTokens).toBe(0);
    expect(summary.perReviewer).toEqual([]);
  });
});
