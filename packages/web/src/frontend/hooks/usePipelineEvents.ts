/**
 * usePipelineEvents — Custom hook for processing WebSocket pipeline events.
 * Wraps useWebSocket and maintains pipeline state from ProgressEvents and DiscussionEvents.
 */

import { useMemo, useRef } from 'react';
import { useWebSocket } from './useWebSocket.js';

// ============================================================================
// Types
// ============================================================================

export type PipelineStage = 'init' | 'review' | 'discuss' | 'verdict' | 'complete';
export type ProgressEventType = 'stage-start' | 'stage-update' | 'stage-complete' | 'stage-error' | 'pipeline-complete';
export type StageStatus = 'pending' | 'active' | 'complete' | 'error';

export interface ProgressEventDetails {
  reviewerId?: string;
  round?: number;
  totalRounds?: number;
  completed?: number;
  total?: number;
  error?: string;
}

export interface ProgressEvent {
  stage: PipelineStage;
  event: ProgressEventType;
  progress: number;
  message: string;
  details?: ProgressEventDetails;
  timestamp: number;
}

export type DiscussionEvent =
  | { type: 'discussion-start'; discussionId: string; issueTitle: string; filePath: string; severity: string }
  | { type: 'round-start'; discussionId: string; roundNum: number }
  | { type: 'supporter-response'; discussionId: string; roundNum: number; supporterId: string; stance: string; response: string }
  | { type: 'consensus-check'; discussionId: string; roundNum: number; reached: boolean; severity?: string }
  | { type: 'discussion-end'; discussionId: string; finalSeverity: string; consensusReached: boolean; rounds: number }
  | { type: 'forced-decision'; discussionId: string; severity: string; reasoning: string }
  | { type: 'objection'; discussionId: string; supporterId: string; reasoning: string };

export interface StageState {
  name: PipelineStage;
  status: StageStatus;
  progress: number;
  message: string;
}

export interface SupporterStance {
  supporterId: string;
  stance: string;
  response: string;
}

export interface DiscussionRound {
  roundNum: number;
  stances: SupporterStance[];
  consensusReached?: boolean;
  consensusSeverity?: string;
}

export interface DiscussionState {
  discussionId: string;
  issueTitle: string;
  filePath: string;
  severity: string;
  rounds: DiscussionRound[];
  finalSeverity?: string;
  consensusReached?: boolean;
  completed: boolean;
  forcedDecision?: { severity: string; reasoning: string };
  objections: { supporterId: string; reasoning: string }[];
}

export interface PipelineEventEntry {
  id: number;
  source: 'progress' | 'discussion';
  event: ProgressEvent | DiscussionEvent;
  timestamp: number;
}

export interface UsePipelineEventsResult {
  stages: StageState[];
  currentStage: PipelineStage | null;
  events: PipelineEventEntry[];
  discussions: DiscussionState[];
  connected: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const STAGE_ORDER: PipelineStage[] = ['init', 'review', 'discuss', 'verdict', 'complete'];
const MAX_EVENTS = 200;

// ============================================================================
// Pure processing functions (exported for testing)
// ============================================================================

function createInitialStages(): StageState[] {
  return STAGE_ORDER.map((name) => ({
    name,
    status: 'pending' as StageStatus,
    progress: 0,
    message: '',
  }));
}

interface WebSocketMessage {
  type: 'progress' | 'discussion';
  data: ProgressEvent | DiscussionEvent;
}

function isWebSocketMessage(msg: unknown): msg is WebSocketMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const obj = msg as Record<string, unknown>;
  return (obj.type === 'progress' || obj.type === 'discussion') && typeof obj.data === 'object' && obj.data !== null;
}

function isProgressEvent(data: unknown): data is ProgressEvent {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return typeof obj.stage === 'string' && typeof obj.event === 'string' && typeof obj.progress === 'number';
}

function isDiscussionEvent(data: unknown): data is DiscussionEvent {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return typeof obj.type === 'string' && obj.type.length > 0;
}

export function processProgressEvent(stages: StageState[], event: ProgressEvent): StageState[] {
  const updated = stages.map((s) => ({ ...s }));

  const stageIndex = STAGE_ORDER.indexOf(event.stage);
  if (stageIndex === -1) return updated;

  const stage = updated[stageIndex];

  switch (event.event) {
    case 'stage-start':
      stage.status = 'active';
      stage.progress = event.progress;
      stage.message = event.message;
      break;

    case 'stage-update':
      stage.status = 'active';
      stage.progress = event.progress;
      stage.message = event.message;
      break;

    case 'stage-complete':
      stage.status = 'complete';
      stage.progress = 100;
      stage.message = event.message;
      break;

    case 'stage-error':
      stage.status = 'error';
      stage.progress = event.progress;
      stage.message = event.message;
      break;

    case 'pipeline-complete':
      stage.status = 'complete';
      stage.progress = 100;
      stage.message = event.message;
      break;
  }

  return updated;
}

export function processDiscussionEvent(discussions: DiscussionState[], event: DiscussionEvent): DiscussionState[] {
  const updated = discussions.map((d) => ({
    ...d,
    rounds: d.rounds.map((r) => ({ ...r, stances: [...r.stances] })),
    objections: [...d.objections],
  }));

  switch (event.type) {
    case 'discussion-start': {
      const exists = updated.find((d) => d.discussionId === event.discussionId);
      if (!exists) {
        updated.push({
          discussionId: event.discussionId,
          issueTitle: event.issueTitle,
          filePath: event.filePath,
          severity: event.severity,
          rounds: [],
          completed: false,
          objections: [],
        });
      }
      break;
    }

    case 'round-start': {
      const disc = updated.find((d) => d.discussionId === event.discussionId);
      if (disc) {
        const existingRound = disc.rounds.find((r) => r.roundNum === event.roundNum);
        if (!existingRound) {
          disc.rounds.push({ roundNum: event.roundNum, stances: [] });
        }
      }
      break;
    }

    case 'supporter-response': {
      const disc = updated.find((d) => d.discussionId === event.discussionId);
      if (disc) {
        let round = disc.rounds.find((r) => r.roundNum === event.roundNum);
        if (!round) {
          round = { roundNum: event.roundNum, stances: [] };
          disc.rounds.push(round);
        }
        round.stances.push({
          supporterId: event.supporterId,
          stance: event.stance,
          response: event.response,
        });
      }
      break;
    }

    case 'consensus-check': {
      const disc = updated.find((d) => d.discussionId === event.discussionId);
      if (disc) {
        const round = disc.rounds.find((r) => r.roundNum === event.roundNum);
        if (round) {
          round.consensusReached = event.reached;
          if (event.severity) {
            round.consensusSeverity = event.severity;
          }
        }
      }
      break;
    }

    case 'discussion-end': {
      const disc = updated.find((d) => d.discussionId === event.discussionId);
      if (disc) {
        disc.finalSeverity = event.finalSeverity;
        disc.consensusReached = event.consensusReached;
        disc.completed = true;
      }
      break;
    }

    case 'forced-decision': {
      const disc = updated.find((d) => d.discussionId === event.discussionId);
      if (disc) {
        disc.forcedDecision = { severity: event.severity, reasoning: event.reasoning };
        disc.completed = true;
      }
      break;
    }

    case 'objection': {
      const disc = updated.find((d) => d.discussionId === event.discussionId);
      if (disc) {
        disc.objections.push({ supporterId: event.supporterId, reasoning: event.reasoning });
      }
      break;
    }
  }

  return updated;
}

export function getCurrentStage(stages: StageState[]): PipelineStage | null {
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].status === 'active') {
      return stages[i].name;
    }
  }
  // If no active stage, return the last completed one
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].status === 'complete') {
      return stages[i].name;
    }
  }
  return null;
}

// ============================================================================
// Hook
// ============================================================================

export function usePipelineEvents(): UsePipelineEventsResult {
  const { messages, connected } = useWebSocket('/ws');
  const lastProcessedRef = useRef(0);
  const stateRef = useRef<{
    stages: StageState[];
    discussions: DiscussionState[];
    events: PipelineEventEntry[];
    eventId: number;
  }>({
    stages: createInitialStages(),
    discussions: [],
    events: [],
    eventId: 0,
  });

  const result = useMemo(() => {
    const state = stateRef.current;

    // Reset if messages were trimmed (buffer wrapped)
    if (messages.length < lastProcessedRef.current) {
      state.stages = createInitialStages();
      state.discussions = [];
      state.events = [];
      state.eventId = 0;
      lastProcessedRef.current = 0;
    }

    // Only process new messages since last run
    for (let i = lastProcessedRef.current; i < messages.length; i++) {
      const msg = messages[i];
      if (!isWebSocketMessage(msg)) continue;

      if (msg.type === 'progress' && isProgressEvent(msg.data)) {
        const progressEvent = msg.data as ProgressEvent;
        state.stages = processProgressEvent(state.stages, progressEvent);
        state.events.push({
          id: state.eventId++,
          source: 'progress',
          event: progressEvent,
          timestamp: progressEvent.timestamp,
        });
      } else if (msg.type === 'discussion' && isDiscussionEvent(msg.data)) {
        const discussionEvent = msg.data as DiscussionEvent;
        state.discussions = processDiscussionEvent(state.discussions, discussionEvent);
        state.events.push({
          id: state.eventId++,
          source: 'discussion',
          event: discussionEvent,
          timestamp: Date.now(),
        });
      }
    }

    lastProcessedRef.current = messages.length;

    // Trim events to MAX_EVENTS
    if (state.events.length > MAX_EVENTS) {
      state.events = state.events.slice(state.events.length - MAX_EVENTS);
    }

    const currentStage = getCurrentStage(state.stages);

    return {
      stages: state.stages,
      currentStage,
      events: state.events,
      discussions: state.discussions,
    };
  }, [messages]);

  return { ...result, connected };
}
