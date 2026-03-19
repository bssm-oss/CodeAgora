/**
 * Pipeline Progress Tests
 * Tests for usePipelineEvents hook logic and utility functions.
 */

import { describe, it, expect } from 'vitest';
import {
  processProgressEvent,
  processDiscussionEvent,
  getCurrentStage,
  type StageState,
  type ProgressEvent,
  type DiscussionEvent,
  type DiscussionState,
  type PipelineStage,
} from '../../src/frontend/hooks/usePipelineEvents.js';

// ============================================================================
// Helpers
// ============================================================================

function createStages(): StageState[] {
  const names: PipelineStage[] = ['init', 'review', 'discuss', 'verdict', 'complete'];
  return names.map((name) => ({
    name,
    status: 'pending',
    progress: 0,
    message: '',
  }));
}

function makeProgressEvent(overrides: Partial<ProgressEvent> = {}): ProgressEvent {
  return {
    stage: 'init',
    event: 'stage-start',
    progress: 0,
    message: 'Starting...',
    timestamp: Date.now(),
    ...overrides,
  };
}

// ============================================================================
// processProgressEvent
// ============================================================================

describe('processProgressEvent', () => {
  it('should set stage to active on stage-start', () => {
    const stages = createStages();
    const event = makeProgressEvent({ stage: 'init', event: 'stage-start', progress: 10, message: 'Initializing' });

    const result = processProgressEvent(stages, event);

    expect(result[0].status).toBe('active');
    expect(result[0].progress).toBe(10);
    expect(result[0].message).toBe('Initializing');
  });

  it('should update progress on stage-update', () => {
    const stages = createStages();
    stages[1].status = 'active';
    stages[1].progress = 20;

    const event = makeProgressEvent({ stage: 'review', event: 'stage-update', progress: 60, message: 'Reviewing 3/5' });

    const result = processProgressEvent(stages, event);

    expect(result[1].status).toBe('active');
    expect(result[1].progress).toBe(60);
    expect(result[1].message).toBe('Reviewing 3/5');
  });

  it('should mark stage complete with 100% on stage-complete', () => {
    const stages = createStages();
    stages[0].status = 'active';
    stages[0].progress = 80;

    const event = makeProgressEvent({ stage: 'init', event: 'stage-complete', progress: 100, message: 'Done' });

    const result = processProgressEvent(stages, event);

    expect(result[0].status).toBe('complete');
    expect(result[0].progress).toBe(100);
  });

  it('should mark stage as error on stage-error', () => {
    const stages = createStages();
    stages[2].status = 'active';

    const event = makeProgressEvent({
      stage: 'discuss',
      event: 'stage-error',
      progress: 30,
      message: 'Discussion failed',
      details: { error: 'Timeout' },
    });

    const result = processProgressEvent(stages, event);

    expect(result[2].status).toBe('error');
    expect(result[2].message).toBe('Discussion failed');
  });

  it('should not mutate the original stages array', () => {
    const stages = createStages();
    const original = JSON.stringify(stages);

    processProgressEvent(stages, makeProgressEvent({ stage: 'init', event: 'stage-start', progress: 50 }));

    expect(JSON.stringify(stages)).toBe(original);
  });
});

// ============================================================================
// Stage Transitions
// ============================================================================

describe('stage transitions', () => {
  it('should correctly transition init -> review -> discuss -> verdict -> complete', () => {
    let stages = createStages();

    // Init starts
    stages = processProgressEvent(stages, makeProgressEvent({ stage: 'init', event: 'stage-start', progress: 0 }));
    expect(stages[0].status).toBe('active');

    // Init completes
    stages = processProgressEvent(stages, makeProgressEvent({ stage: 'init', event: 'stage-complete', progress: 100 }));
    expect(stages[0].status).toBe('complete');

    // Review starts
    stages = processProgressEvent(stages, makeProgressEvent({ stage: 'review', event: 'stage-start', progress: 0 }));
    expect(stages[0].status).toBe('complete');
    expect(stages[1].status).toBe('active');

    // Review completes
    stages = processProgressEvent(stages, makeProgressEvent({ stage: 'review', event: 'stage-complete', progress: 100 }));
    expect(stages[1].status).toBe('complete');

    // Discuss starts
    stages = processProgressEvent(stages, makeProgressEvent({ stage: 'discuss', event: 'stage-start', progress: 0 }));
    expect(stages[2].status).toBe('active');

    // Discuss completes
    stages = processProgressEvent(stages, makeProgressEvent({ stage: 'discuss', event: 'stage-complete', progress: 100 }));
    expect(stages[2].status).toBe('complete');

    // Verdict starts and completes
    stages = processProgressEvent(stages, makeProgressEvent({ stage: 'verdict', event: 'stage-start', progress: 0 }));
    stages = processProgressEvent(stages, makeProgressEvent({ stage: 'verdict', event: 'stage-complete', progress: 100 }));
    expect(stages[3].status).toBe('complete');

    // Pipeline complete
    stages = processProgressEvent(stages, makeProgressEvent({ stage: 'complete', event: 'pipeline-complete', progress: 100, message: 'All done' }));
    expect(stages[4].status).toBe('complete');
    expect(stages[4].progress).toBe(100);
  });
});

// ============================================================================
// getCurrentStage
// ============================================================================

describe('getCurrentStage', () => {
  it('should return null when no stages are active or complete', () => {
    const stages = createStages();
    expect(getCurrentStage(stages)).toBeNull();
  });

  it('should return the active stage', () => {
    const stages = createStages();
    stages[1].status = 'active';

    expect(getCurrentStage(stages)).toBe('review');
  });

  it('should return the last completed stage when none are active', () => {
    const stages = createStages();
    stages[0].status = 'complete';
    stages[1].status = 'complete';

    expect(getCurrentStage(stages)).toBe('review');
  });

  it('should prefer active stage over completed stages', () => {
    const stages = createStages();
    stages[0].status = 'complete';
    stages[1].status = 'complete';
    stages[2].status = 'active';

    expect(getCurrentStage(stages)).toBe('discuss');
  });
});

// ============================================================================
// processDiscussionEvent
// ============================================================================

describe('processDiscussionEvent', () => {
  it('should create a new discussion on discussion-start', () => {
    const discussions: DiscussionState[] = [];
    const event: DiscussionEvent = {
      type: 'discussion-start',
      discussionId: 'd1',
      issueTitle: 'Null pointer risk',
      filePath: 'src/main.ts',
      severity: 'ERROR',
    };

    const result = processDiscussionEvent(discussions, event);

    expect(result).toHaveLength(1);
    expect(result[0].discussionId).toBe('d1');
    expect(result[0].issueTitle).toBe('Null pointer risk');
    expect(result[0].filePath).toBe('src/main.ts');
    expect(result[0].severity).toBe('ERROR');
    expect(result[0].completed).toBe(false);
  });

  it('should not duplicate discussions with the same discussionId', () => {
    const discussions: DiscussionState[] = [{
      discussionId: 'd1',
      issueTitle: 'Existing',
      filePath: 'src/a.ts',
      severity: 'WARNING',
      rounds: [],
      completed: false,
      objections: [],
    }];

    const event: DiscussionEvent = {
      type: 'discussion-start',
      discussionId: 'd1',
      issueTitle: 'Duplicate',
      filePath: 'src/b.ts',
      severity: 'ERROR',
    };

    const result = processDiscussionEvent(discussions, event);
    expect(result).toHaveLength(1);
    expect(result[0].issueTitle).toBe('Existing');
  });

  it('should add supporter stances to the correct round', () => {
    const discussions: DiscussionState[] = [{
      discussionId: 'd1',
      issueTitle: 'Test',
      filePath: 'src/a.ts',
      severity: 'WARNING',
      rounds: [{ roundNum: 1, stances: [] }],
      completed: false,
      objections: [],
    }];

    const event: DiscussionEvent = {
      type: 'supporter-response',
      discussionId: 'd1',
      roundNum: 1,
      supporterId: 'gpt-4',
      stance: 'agree',
      response: 'This is indeed a risk.',
    };

    const result = processDiscussionEvent(discussions, event);

    expect(result[0].rounds[0].stances).toHaveLength(1);
    expect(result[0].rounds[0].stances[0].supporterId).toBe('gpt-4');
    expect(result[0].rounds[0].stances[0].stance).toBe('agree');
  });

  it('should mark discussion as completed on discussion-end', () => {
    const discussions: DiscussionState[] = [{
      discussionId: 'd1',
      issueTitle: 'Test',
      filePath: 'src/a.ts',
      severity: 'WARNING',
      rounds: [],
      completed: false,
      objections: [],
    }];

    const event: DiscussionEvent = {
      type: 'discussion-end',
      discussionId: 'd1',
      finalSeverity: 'ERROR',
      consensusReached: true,
      rounds: 2,
    };

    const result = processDiscussionEvent(discussions, event);

    expect(result[0].completed).toBe(true);
    expect(result[0].finalSeverity).toBe('ERROR');
    expect(result[0].consensusReached).toBe(true);
  });

  it('should handle forced decisions', () => {
    const discussions: DiscussionState[] = [{
      discussionId: 'd1',
      issueTitle: 'Test',
      filePath: 'src/a.ts',
      severity: 'WARNING',
      rounds: [],
      completed: false,
      objections: [],
    }];

    const event: DiscussionEvent = {
      type: 'forced-decision',
      discussionId: 'd1',
      severity: 'CRITICAL',
      reasoning: 'Max rounds reached without consensus',
    };

    const result = processDiscussionEvent(discussions, event);

    expect(result[0].completed).toBe(true);
    expect(result[0].forcedDecision?.severity).toBe('CRITICAL');
    expect(result[0].forcedDecision?.reasoning).toBe('Max rounds reached without consensus');
  });

  it('should track objections', () => {
    const discussions: DiscussionState[] = [{
      discussionId: 'd1',
      issueTitle: 'Test',
      filePath: 'src/a.ts',
      severity: 'WARNING',
      rounds: [],
      completed: false,
      objections: [],
    }];

    const event: DiscussionEvent = {
      type: 'objection',
      discussionId: 'd1',
      supporterId: 'claude',
      reasoning: 'Severity too low for this type of issue',
    };

    const result = processDiscussionEvent(discussions, event);

    expect(result[0].objections).toHaveLength(1);
    expect(result[0].objections[0].supporterId).toBe('claude');
  });

  it('should handle consensus-check events', () => {
    const discussions: DiscussionState[] = [{
      discussionId: 'd1',
      issueTitle: 'Test',
      filePath: 'src/a.ts',
      severity: 'WARNING',
      rounds: [{ roundNum: 1, stances: [] }],
      completed: false,
      objections: [],
    }];

    const event: DiscussionEvent = {
      type: 'consensus-check',
      discussionId: 'd1',
      roundNum: 1,
      reached: true,
      severity: 'ERROR',
    };

    const result = processDiscussionEvent(discussions, event);

    expect(result[0].rounds[0].consensusReached).toBe(true);
    expect(result[0].rounds[0].consensusSeverity).toBe('ERROR');
  });

  it('should not mutate the original discussions array', () => {
    const discussions: DiscussionState[] = [{
      discussionId: 'd1',
      issueTitle: 'Test',
      filePath: 'src/a.ts',
      severity: 'WARNING',
      rounds: [{ roundNum: 1, stances: [{ supporterId: 'a', stance: 'agree', response: 'yes' }] }],
      completed: false,
      objections: [{ supporterId: 'b', reasoning: 'no' }],
    }];

    const original = JSON.stringify(discussions);

    processDiscussionEvent(discussions, {
      type: 'supporter-response',
      discussionId: 'd1',
      roundNum: 1,
      supporterId: 'c',
      stance: 'disagree',
      response: 'nah',
    });

    expect(JSON.stringify(discussions)).toBe(original);
  });
});
