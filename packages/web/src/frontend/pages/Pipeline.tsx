/**
 * Pipeline — Real-time pipeline progress page.
 * Displays live stage progression, event log, and discussion updates.
 */

import React from 'react';
import { usePipelineEvents } from '../hooks/usePipelineEvents.js';
import { PipelineStages } from '../components/PipelineStages.js';
import { EventLog } from '../components/EventLog.js';
import { LiveDiscussion } from '../components/LiveDiscussion.js';
import { ReviewTrigger } from '../components/ReviewTrigger.js';

export function Pipeline(): React.JSX.Element {
  const { stages, currentStage, events, discussions, connected, pipelineRunning } = usePipelineEvents();

  const hasActivity = currentStage !== null || events.length > 0;

  return (
    <div className="page">
      <div className="pipeline-header">
        <h2>Pipeline</h2>
        <span className={`connection-status ${connected ? 'connection-status--connected' : 'connection-status--disconnected'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {!connected && (
        <div className="pipeline-notice pipeline-notice--warning">
          WebSocket disconnected. You can still start reviews, but live progress updates are unavailable.
        </div>
      )}

      {pipelineRunning && !hasActivity && (
        <div className="pipeline-notice pipeline-notice--info">
          <span className="pipeline-spinner" /> A review pipeline is currently running. {connected ? 'Live updates will appear shortly...' : 'Check Sessions page for results.'}
        </div>
      )}

      {!hasActivity && !pipelineRunning && (
        <>
          <div className="pipeline-idle">
            <div className="pipeline-idle__icon">&#9881;</div>
            <h3 className="pipeline-idle__title">No active pipeline</h3>
            <p className="pipeline-idle__description">
              Start a code review by submitting a diff, PR URL, or staged changes below.
              The pipeline will run through initialization, parallel review, discussion, and verdict stages.
            </p>
          </div>
          <ReviewTrigger onStarted={() => { /* WebSocket events will drive the pipeline UI */ }} />
        </>
      )}

      {hasActivity && (
        <>
          <section className="pipeline-section">
            <PipelineStages stages={stages} />
          </section>

          <div className="pipeline-grid">
            <section className="pipeline-section">
              <EventLog events={events} />
            </section>

            <section className="pipeline-section">
              <LiveDiscussion discussions={discussions} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
