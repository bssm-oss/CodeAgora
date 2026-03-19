/**
 * Pipeline Progress Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ProgressEmitter,
  formatProgressLine,
  formatProgressJson,
} from '@codeagora/core/pipeline/progress.js';
import type { ProgressEvent, PipelineStage } from '@codeagora/core/pipeline/progress.js';

describe('ProgressEmitter', () => {
  let emitter: ProgressEmitter;

  beforeEach(() => {
    emitter = new ProgressEmitter();
  });

  it('stageStart → event type stage-start, progress 0', () => {
    const events: ProgressEvent[] = [];
    emitter.onProgress((e) => events.push(e));

    emitter.stageStart('review', 'starting review');

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('stage-start');
    expect(events[0].stage).toBe('review');
    expect(events[0].progress).toBe(0);
    expect(events[0].message).toBe('starting review');
  });

  it('stageUpdate → progress 값 올바르게 전달', () => {
    const events: ProgressEvent[] = [];
    emitter.onProgress((e) => events.push(e));

    emitter.stageUpdate('review', 40, '2/5 reviewers complete', { completed: 2, total: 5 });

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('stage-update');
    expect(events[0].progress).toBe(40);
    expect(events[0].message).toBe('2/5 reviewers complete');
    expect(events[0].details?.completed).toBe(2);
    expect(events[0].details?.total).toBe(5);
  });

  it('stageComplete → progress 100', () => {
    const events: ProgressEvent[] = [];
    emitter.onProgress((e) => events.push(e));

    emitter.stageComplete('review', 'all reviewers done');

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('stage-complete');
    expect(events[0].progress).toBe(100);
    expect(events[0].message).toBe('all reviewers done');
  });

  it('stageError → error 메시지 포함', () => {
    const events: ProgressEvent[] = [];
    emitter.onProgress((e) => events.push(e));

    emitter.stageError('review', 'reviewer r3 failed: timeout');

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('stage-error');
    expect(events[0].details?.error).toBe('reviewer r3 failed: timeout');
    expect(events[0].message).toBe('reviewer r3 failed: timeout');
  });

  it('pipelineComplete → stage complete', () => {
    const events: ProgressEvent[] = [];
    emitter.onProgress((e) => events.push(e));

    emitter.pipelineComplete('pipeline finished');

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('pipeline-complete');
    expect(events[0].stage).toBe('complete');
    expect(events[0].progress).toBe(100);
  });

  it('getCurrentStage / getProgress 상태 추적', () => {
    expect(emitter.getCurrentStage()).toBe('init');
    expect(emitter.getProgress()).toBe(0);

    emitter.stageStart('review', 'starting');
    expect(emitter.getCurrentStage()).toBe('review');
    expect(emitter.getProgress()).toBe(0);

    emitter.stageUpdate('review', 60, 'in progress');
    expect(emitter.getCurrentStage()).toBe('review');
    expect(emitter.getProgress()).toBe(60);

    emitter.stageComplete('discuss', 'done');
    expect(emitter.getCurrentStage()).toBe('discuss');
    expect(emitter.getProgress()).toBe(100);
  });

  it('onProgress 리스너 등록/해제', () => {
    const received: ProgressEvent[] = [];
    const listener = (e: ProgressEvent) => received.push(e);

    emitter.onProgress(listener);
    emitter.stageStart('review', 'start');
    expect(received).toHaveLength(1);

    emitter.removeListener('progress', listener);
    emitter.stageComplete('review', 'done');
    expect(received).toHaveLength(1); // no new event after removal
  });

  it('다수 리스너 등록 시 모두 호출', () => {
    const counts = [0, 0, 0];
    emitter.onProgress(() => counts[0]++);
    emitter.onProgress(() => counts[1]++);
    emitter.onProgress(() => counts[2]++);

    emitter.stageStart('verdict', 'starting verdict');

    expect(counts).toEqual([1, 1, 1]);
  });

  it('emitProgress → timestamp 자동 설정', () => {
    const before = Date.now();
    const events: ProgressEvent[] = [];
    emitter.onProgress((e) => events.push(e));

    emitter.stageStart('review', 'test');
    const after = Date.now();

    expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(events[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('stageError → details.error에 에러 메시지 보존', () => {
    const events: ProgressEvent[] = [];
    emitter.onProgress((e) => events.push(e));

    emitter.stageUpdate('review', 20, 'progress so far');
    emitter.stageError('review', 'network timeout');

    // progress preserved from last stageUpdate
    expect(events[1].progress).toBe(20);
    expect(events[1].details?.error).toBe('network timeout');
  });
});

describe('formatProgressLine', () => {
  const baseEvent: ProgressEvent = {
    stage: 'review',
    event: 'stage-update',
    progress: 40,
    message: '2/5 reviewers complete',
    timestamp: 0,
  };

  it('프로그레스 바 포맷 (■/□ 문자)', () => {
    const line = formatProgressLine(baseEvent);
    expect(line).toContain('■');
    expect(line).toContain('□');
    expect(line).toMatch(/^\[/);
  });

  it('progress 0 → 전체 □', () => {
    const line = formatProgressLine({ ...baseEvent, progress: 0 });
    expect(line).toMatch(/^\[□{10}\]/);
  });

  it('progress 100 → 전체 ■', () => {
    const line = formatProgressLine({ ...baseEvent, progress: 100 });
    expect(line).toMatch(/^\[■{10}\]/);
  });

  it('progress 40 → 4개 ■, 6개 □', () => {
    const line = formatProgressLine({ ...baseEvent, progress: 40 });
    expect(line).toMatch(/^\[■{4}□{6}\]/);
  });

  it('퍼센트 표시 포함', () => {
    const line = formatProgressLine({ ...baseEvent, progress: 40 });
    expect(line).toContain('40%');
  });

  it('stage 레이블 포함 (L1 Review)', () => {
    const line = formatProgressLine(baseEvent);
    expect(line).toContain('L1 Review');
  });

  it('discuss stage → L2 Discussion 레이블', () => {
    const line = formatProgressLine({ ...baseEvent, stage: 'discuss', progress: 50, message: 'round 1' });
    expect(line).toContain('L2 Discussion');
  });

  it('error 이벤트 → [ERROR] 접두사', () => {
    const errorEvent: ProgressEvent = {
      stage: 'review',
      event: 'stage-error',
      progress: 20,
      message: 'reviewer r3 failed: timeout',
      details: { error: 'reviewer r3 failed: timeout', reviewerId: 'r3' },
      timestamp: 0,
    };
    const line = formatProgressLine(errorEvent);
    expect(line).toMatch(/^\[ERROR\]/);
    expect(line).toContain('L1 Review');
    expect(line).toContain('timeout');
  });

  it('error 이벤트에 reviewerId 있으면 reviewer 정보 포함', () => {
    const errorEvent: ProgressEvent = {
      stage: 'review',
      event: 'stage-error',
      progress: 20,
      message: 'timeout',
      details: { error: 'timeout', reviewerId: 'r3' },
      timestamp: 0,
    };
    const line = formatProgressLine(errorEvent);
    expect(line).toContain('r3');
  });

  it('message 내용 포함', () => {
    const line = formatProgressLine(baseEvent);
    expect(line).toContain('2/5 reviewers complete');
  });

  it('stage-complete → progress 100, 전체 ■', () => {
    const completeEvent: ProgressEvent = {
      stage: 'review',
      event: 'stage-complete',
      progress: 100,
      message: 'all done',
      timestamp: 0,
    };
    const line = formatProgressLine(completeEvent);
    expect(line).toMatch(/^\[■{10}\]/);
    expect(line).toContain('100%');
  });
});

describe('formatProgressJson', () => {
  it('valid JSON 출력', () => {
    const event: ProgressEvent = {
      stage: 'review',
      event: 'stage-update',
      progress: 50,
      message: 'halfway',
      timestamp: 1234567890,
    };
    const output = formatProgressJson(event);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('원본 필드 모두 포함', () => {
    const event: ProgressEvent = {
      stage: 'discuss',
      event: 'stage-start',
      progress: 0,
      message: 'starting discussion',
      details: { round: 1, totalRounds: 3 },
      timestamp: 9999,
    };
    const parsed = JSON.parse(formatProgressJson(event));
    expect(parsed.stage).toBe('discuss');
    expect(parsed.event).toBe('stage-start');
    expect(parsed.progress).toBe(0);
    expect(parsed.message).toBe('starting discussion');
    expect(parsed.details?.round).toBe(1);
    expect(parsed.timestamp).toBe(9999);
  });

  it('newline 없이 단일 줄 출력', () => {
    const event: ProgressEvent = {
      stage: 'verdict',
      event: 'stage-complete',
      progress: 100,
      message: 'verdict done',
      timestamp: 0,
    };
    const output = formatProgressJson(event);
    expect(output).not.toContain('\n');
  });
});
