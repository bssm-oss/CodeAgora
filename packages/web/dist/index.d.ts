import { Hono } from 'hono';
import * as hono_types from 'hono/types';
import { EventEmitter } from 'events';
import { createNodeWebSocket } from '@hono/node-ws';

/**
 * CodeAgora Web Server
 * Hono-based REST API + WebSocket server for the web dashboard.
 */

interface ServerOptions {
    port?: number;
    hostname?: string;
}
/**
 * Create the Hono application with all route groups mounted.
 */
declare function createApp(): Hono;
/**
 * Start the HTTP server with WebSocket upgrade support.
 */
declare function startServer(options?: ServerOptions): {
    close: () => void;
};

declare const healthRoutes: Hono<hono_types.BlankEnv, hono_types.BlankSchema, "/">;

declare const sessionRoutes: Hono<hono_types.BlankEnv, hono_types.BlankSchema, "/">;

declare const modelRoutes: Hono<hono_types.BlankEnv, hono_types.BlankSchema, "/">;

declare const configRoutes: Hono<hono_types.BlankEnv, hono_types.BlankSchema, "/">;

declare const costRoutes: Hono<hono_types.BlankEnv, hono_types.BlankSchema, "/">;

/**
 * Pipeline Progress Emitter
 * Real-time progress events for pipeline execution stages.
 */

type PipelineStage = 'init' | 'review' | 'discuss' | 'verdict' | 'complete';
type ProgressEventType = 'stage-start' | 'stage-update' | 'stage-complete' | 'stage-error' | 'pipeline-complete';
interface ProgressEvent {
    stage: PipelineStage;
    event: ProgressEventType;
    progress: number;
    message: string;
    details?: {
        reviewerId?: string;
        round?: number;
        totalRounds?: number;
        completed?: number;
        total?: number;
        error?: string;
    };
    timestamp: number;
}
declare class ProgressEmitter extends EventEmitter {
    private currentStage;
    private stageProgress;
    emitProgress(event: Omit<ProgressEvent, 'timestamp'>): void;
    stageStart(stage: PipelineStage, message: string): void;
    stageUpdate(stage: PipelineStage, progress: number, message: string, details?: ProgressEvent['details']): void;
    stageComplete(stage: PipelineStage, message: string): void;
    stageError(stage: PipelineStage, error: string): void;
    pipelineComplete(message: string): void;
    getCurrentStage(): PipelineStage;
    getProgress(): number;
    onProgress(listener: (event: ProgressEvent) => void): this;
}

/**
 * L2 Discussion Event Emitter (2.1)
 * Real-time events from moderator discussion flow.
 * Zero impact when no listener attached.
 */

interface DiscussionStartEvent {
    type: 'discussion-start';
    discussionId: string;
    issueTitle: string;
    filePath: string;
    severity: string;
}
interface RoundStartEvent {
    type: 'round-start';
    discussionId: string;
    roundNum: number;
}
interface SupporterResponseEvent {
    type: 'supporter-response';
    discussionId: string;
    roundNum: number;
    supporterId: string;
    stance: 'agree' | 'disagree' | 'neutral';
    response: string;
}
interface ConsensusCheckEvent {
    type: 'consensus-check';
    discussionId: string;
    roundNum: number;
    reached: boolean;
    severity?: string;
}
interface ObjectionEvent {
    type: 'objection';
    discussionId: string;
    supporterId: string;
    reasoning: string;
}
interface ForcedDecisionEvent {
    type: 'forced-decision';
    discussionId: string;
    severity: string;
    reasoning: string;
}
interface DiscussionEndEvent {
    type: 'discussion-end';
    discussionId: string;
    finalSeverity: string;
    consensusReached: boolean;
    rounds: number;
}
type DiscussionEvent = DiscussionStartEvent | RoundStartEvent | SupporterResponseEvent | ConsensusCheckEvent | ObjectionEvent | ForcedDecisionEvent | DiscussionEndEvent;
declare class DiscussionEmitter extends EventEmitter {
    constructor();
    emitEvent(event: DiscussionEvent): void;
    dispose(): void;
}

/**
 * WebSocket Handler
 * Real-time event forwarding from ProgressEmitter and DiscussionEmitter.
 */

/**
 * Set emitters so the CLI can wire pipeline events to connected WebSocket clients.
 */
declare function setEmitters(progress: ProgressEmitter | null, discussion: DiscussionEmitter | null): void;
interface WebSocketSetup {
    injectWebSocket: ReturnType<typeof createNodeWebSocket>['injectWebSocket'];
}
/**
 * Configure WebSocket upgrade handler on the Hono app.
 */
declare function setupWebSocket(app: Hono): WebSocketSetup;

export { type ServerOptions, type WebSocketSetup, configRoutes, costRoutes, createApp, healthRoutes, modelRoutes, sessionRoutes, setEmitters, setupWebSocket, startServer };
