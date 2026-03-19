/**
 * L2 Discussion Event Emitter (2.1)
 * Real-time events from moderator discussion flow.
 * Zero impact when no listener attached.
 */

import { EventEmitter } from 'events';

// ============================================================================
// Event Types
// ============================================================================

export interface DiscussionStartEvent {
  type: 'discussion-start';
  discussionId: string;
  issueTitle: string;
  filePath: string;
  severity: string;
}

export interface RoundStartEvent {
  type: 'round-start';
  discussionId: string;
  roundNum: number;
}

export interface SupporterResponseEvent {
  type: 'supporter-response';
  discussionId: string;
  roundNum: number;
  supporterId: string;
  stance: 'agree' | 'disagree' | 'neutral';
  response: string;
}

export interface ConsensusCheckEvent {
  type: 'consensus-check';
  discussionId: string;
  roundNum: number;
  reached: boolean;
  severity?: string;
}

export interface ObjectionEvent {
  type: 'objection';
  discussionId: string;
  supporterId: string;
  reasoning: string;
}

export interface ForcedDecisionEvent {
  type: 'forced-decision';
  discussionId: string;
  severity: string;
  reasoning: string;
}

export interface DiscussionEndEvent {
  type: 'discussion-end';
  discussionId: string;
  finalSeverity: string;
  consensusReached: boolean;
  rounds: number;
}

export type DiscussionEvent =
  | DiscussionStartEvent
  | RoundStartEvent
  | SupporterResponseEvent
  | ConsensusCheckEvent
  | ObjectionEvent
  | ForcedDecisionEvent
  | DiscussionEndEvent;

// ============================================================================
// Emitter Class
// ============================================================================

export class DiscussionEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  emitEvent(event: DiscussionEvent): void {
    this.emit(event.type, event);
    this.emit('*', event); // Wildcard for catch-all listeners
  }

  dispose(): void {
    this.removeAllListeners();
  }
}
