/**
 * Pipeline Progress Emitter
 * Real-time progress events for pipeline execution stages.
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export type PipelineStage = 'init' | 'review' | 'discuss' | 'verdict' | 'complete';
export type ProgressEventType =
  | 'stage-start'
  | 'stage-update'
  | 'stage-complete'
  | 'stage-error'
  | 'pipeline-complete';

export interface ProgressEvent {
  stage: PipelineStage;
  event: ProgressEventType;
  progress: number; // 0-100
  message: string;
  details?: {
    reviewerId?: string;
    round?: number;
    totalRounds?: number;
    completed?: number;
    total?: number;
    error?: string;
  };
  timestamp: number; // Date.now()
}

// ============================================================================
// ProgressEmitter
// ============================================================================

export class ProgressEmitter extends EventEmitter {
  private currentStage: PipelineStage = 'init';
  private stageProgress: number = 0;

  emitProgress(event: Omit<ProgressEvent, 'timestamp'>): void {
    const full: ProgressEvent = { ...event, timestamp: Date.now() };
    this.currentStage = event.stage;
    this.stageProgress = event.progress;
    try {
      this.emit('progress', full);
    } catch {
      // progress listener errors must never abort the pipeline
    }
  }

  stageStart(stage: PipelineStage, message: string): void {
    this.emitProgress({ stage, event: 'stage-start', progress: 0, message });
  }

  stageUpdate(
    stage: PipelineStage,
    progress: number,
    message: string,
    details?: ProgressEvent['details'],
  ): void {
    this.emitProgress({ stage, event: 'stage-update', progress, message, details });
  }

  stageComplete(stage: PipelineStage, message: string): void {
    this.emitProgress({ stage, event: 'stage-complete', progress: 100, message });
  }

  stageError(stage: PipelineStage, error: string): void {
    this.emitProgress({
      stage,
      event: 'stage-error',
      progress: this.stageProgress,
      message: error,
      details: { error },
    });
  }

  pipelineComplete(message: string): void {
    this.emitProgress({ stage: 'complete', event: 'pipeline-complete', progress: 100, message });
  }

  getCurrentStage(): PipelineStage {
    return this.currentStage;
  }

  getProgress(): number {
    return this.stageProgress;
  }

  onProgress(listener: (event: ProgressEvent) => void): this {
    return this.on('progress', listener);
  }
}

// ============================================================================
// Formatters
// ============================================================================

const BAR_WIDTH = 10;

function buildBar(progress: number): string {
  const filled = Math.round((Math.min(100, Math.max(0, progress)) / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return '[' + '■'.repeat(filled) + '□'.repeat(empty) + ']';
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  init: 'Init',
  review: 'L1 Review',
  discuss: 'L2 Discussion',
  verdict: 'L3 Verdict',
  complete: 'Complete',
};

/**
 * Format a progress event as a human-readable text line.
 *
 * Examples:
 *   [■■■■□□□□□□] 40% L1 Review — 2/5 reviewers complete
 *   [■■■■■■■■■■] 100% L2 Discussion — consensus reached
 *   [ERROR] L1 Review — reviewer r3 failed: timeout
 */
export function formatProgressLine(event: ProgressEvent): string {
  const label = STAGE_LABELS[event.stage] ?? event.stage;

  if (event.event === 'stage-error') {
    const errorMsg = event.details?.error ?? event.message;
    const reviewerPart = event.details?.reviewerId ? ` reviewer ${event.details.reviewerId} failed:` : '';
    return `[ERROR] ${label} —${reviewerPart} ${errorMsg}`;
  }

  const bar = buildBar(event.progress);
  const pct = `${event.progress}%`;
  return `${bar} ${pct} ${label} — ${event.message}`;
}

/**
 * Format a progress event as newline-delimited JSON (for CI/CD consumers).
 */
export function formatProgressJson(event: ProgressEvent): string {
  return JSON.stringify(event);
}
