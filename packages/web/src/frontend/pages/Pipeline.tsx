/**
 * Pipeline — Real-time pipeline progress page.
 * Displays live stage progression, event log, and discussion updates.
 */

import React from 'react';
import { usePipelineEvents } from '../hooks/usePipelineEvents.js';
import { PipelineStages } from '../components/PipelineStages.js';
import { EventLog } from '../components/EventLog.js';
import { LiveDiscussion } from '../components/LiveDiscussion.js';

export function Pipeline(): React.JSX.Element {
  const { stages, currentStage, events, discussions, connected } = usePipelineEvents();

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
          WebSocket disconnected. Reconnect to receive live updates.
        </div>
      )}

      {!hasActivity && connected && (
        <div className="pipeline-notice pipeline-notice--info">
          Waiting for pipeline...
        </div>
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
