/**
 * Pipeline Performance Report Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineTelemetry } from '@codeagora/core/pipeline/telemetry.js';
import { generateReport, formatReportText, formatReportJson } from '@codeagora/core/pipeline/report.js';

describe('generateReport', () => {
  let telemetry: PipelineTelemetry;

  beforeEach(() => {
    telemetry = new PipelineTelemetry();
  });

  it('빈 telemetry → 빈 리포트', async () => {
    const report = await generateReport(telemetry);
    expect(report.summary.totalCalls).toBe(0);
    expect(report.summary.totalLatencyMs).toBe(0);
    expect(report.summary.totalTokens).toBe(0);
    expect(report.summary.totalCost).toBe('$0.0000');
    expect(report.summary.averageLatencyMs).toBe(0);
    expect(report.perReviewer).toHaveLength(0);
    expect(report.slowest).toBeNull();
    expect(report.mostExpensive).toBeNull();
  });

  it('단일 reviewer → 올바른 집계', async () => {
    telemetry.record({
      reviewerId: 'reviewer-a',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      latencyMs: 500,
      usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      success: true,
    });

    const report = await generateReport(telemetry);
    expect(report.summary.totalCalls).toBe(1);
    expect(report.summary.totalLatencyMs).toBe(500);
    expect(report.summary.totalTokens).toBe(1500);
    expect(report.summary.averageLatencyMs).toBe(500);
    expect(report.perReviewer).toHaveLength(1);

    const r = report.perReviewer[0];
    expect(r.reviewerId).toBe('reviewer-a');
    expect(r.provider).toBe('groq');
    expect(r.model).toBe('llama-3.3-70b-versatile');
    expect(r.calls).toBe(1);
    expect(r.latencyMs).toBe(500);
    expect(r.tokens).toBe(1500);
    expect(r.cost).toMatch(/^\$\d+\.\d{4}$/);
    expect(r.success).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it('다중 reviewer → perReviewer 배열, slowest, mostExpensive 정확', async () => {
    telemetry.record({
      reviewerId: 'fast-cheap',
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      latencyMs: 200,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      success: true,
    });
    telemetry.record({
      reviewerId: 'slow-expensive',
      provider: 'mistral',
      model: 'mistral-large-latest',
      latencyMs: 2000,
      usage: { promptTokens: 5000, completionTokens: 2000, totalTokens: 7000 },
      success: true,
    });
    telemetry.record({
      reviewerId: 'medium',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      latencyMs: 800,
      usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
      success: true,
    });

    const report = await generateReport(telemetry);
    expect(report.summary.totalCalls).toBe(3);
    expect(report.perReviewer).toHaveLength(3);

    expect(report.slowest).not.toBeNull();
    expect(report.slowest!.reviewerId).toBe('slow-expensive');
    expect(report.slowest!.latencyMs).toBe(2000);

    expect(report.mostExpensive).not.toBeNull();
    expect(report.mostExpensive!.reviewerId).toBe('slow-expensive');
  });

  it('실패한 reviewer 포함 → success: false, error 표시', async () => {
    telemetry.record({
      reviewerId: 'failing-reviewer',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      latencyMs: 800,
      success: false,
      error: 'timeout after 30s',
    });

    const report = await generateReport(telemetry);
    expect(report.perReviewer).toHaveLength(1);
    const r = report.perReviewer[0];
    expect(r.success).toBe(false);
    expect(r.error).toBe('timeout after 30s');
  });

  it('알 수 없는 모델 (pricing 없음) → cost "N/A"', async () => {
    telemetry.record({
      reviewerId: 'unknown-reviewer',
      provider: 'unknown-provider',
      model: 'unknown-model',
      latencyMs: 400,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      success: true,
    });

    const report = await generateReport(telemetry);
    expect(report.perReviewer[0].cost).toBe('N/A');
    expect(report.summary.totalCost).toBe('N/A');
    // No real cost → mostExpensive is null
    expect(report.mostExpensive).toBeNull();
  });

  it('averageLatencyMs 계산 정확', async () => {
    telemetry.record({
      reviewerId: 'r1',
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      latencyMs: 300,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      success: true,
    });
    telemetry.record({
      reviewerId: 'r2',
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      latencyMs: 700,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      success: true,
    });

    const report = await generateReport(telemetry);
    expect(report.summary.averageLatencyMs).toBe(500); // (300+700)/2
  });

  it('usage 없는 record → cost N/A', async () => {
    telemetry.record({
      reviewerId: 'cli-reviewer',
      provider: 'cli',
      model: 'opencode',
      latencyMs: 1200,
      success: true,
      // no usage
    });

    const report = await generateReport(telemetry);
    expect(report.perReviewer[0].cost).toBe('N/A');
  });
});

describe('formatReportText', () => {
  it('마크다운 테이블 포맷 검증', async () => {
    const telemetry = new PipelineTelemetry();
    telemetry.record({
      reviewerId: 'reviewer-a',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      latencyMs: 500,
      usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      success: true,
    });

    const report = await generateReport(telemetry);
    const text = formatReportText(report);

    expect(text).toContain('## Performance Report');
    expect(text).toContain('| Reviewer | Provider | Model | Latency | Tokens | Cost | Status |');
    expect(text).toContain('|----------|----------|-------|---------|--------|------|--------|');
    expect(text).toContain('reviewer-a');
    expect(text).toContain('groq');
    expect(text).toContain('llama-3.3-70b-versatile');
    expect(text).toContain('500ms');
    expect(text).toContain('1500');
    expect(text).toContain('OK');
    expect(text).toContain('### Summary');
    expect(text).toContain('Total calls: 1');
  });

  it('실패한 reviewer → FAIL: <error> 표시', async () => {
    const telemetry = new PipelineTelemetry();
    telemetry.record({
      reviewerId: 'broken',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      latencyMs: 100,
      success: false,
      error: 'connection refused',
    });

    const report = await generateReport(telemetry);
    const text = formatReportText(report);
    expect(text).toContain('FAIL: connection refused');
  });

  it('빈 리포트 → 테이블 헤더만 있고 Summary는 0 값', async () => {
    const telemetry = new PipelineTelemetry();
    const report = await generateReport(telemetry);
    const text = formatReportText(report);

    expect(text).toContain('| Reviewer | Provider | Model | Latency | Tokens | Cost | Status |');
    expect(text).toContain('Total calls: 0');
    expect(text).toContain('Total cost: $0.0000');
  });
});

describe('formatReportJson', () => {
  it('valid JSON 반환', async () => {
    const telemetry = new PipelineTelemetry();
    telemetry.record({
      reviewerId: 'reviewer-a',
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      latencyMs: 300,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      success: true,
    });

    const report = await generateReport(telemetry);
    const json = formatReportJson(report);

    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('perReviewer');
    expect(parsed).toHaveProperty('slowest');
    expect(parsed).toHaveProperty('mostExpensive');
    expect(parsed.perReviewer).toHaveLength(1);
  });

  it('빈 리포트도 valid JSON', async () => {
    const telemetry = new PipelineTelemetry();
    const report = await generateReport(telemetry);
    const json = formatReportJson(report);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.summary.totalCalls).toBe(0);
    expect(parsed.perReviewer).toEqual([]);
    expect(parsed.slowest).toBeNull();
    expect(parsed.mostExpensive).toBeNull();
  });
});
