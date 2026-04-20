/**
 * Pipeline — Real-time pipeline progress page.
 * Displays live stage progression, reviewer cards, event log, and discussion updates.
 */

import React, { useMemo } from 'react';
import { usePipelineEvents } from '../hooks/usePipelineEvents.js';
import type { ProgressEvent, DiscussionState } from '../hooks/usePipelineEvents.js';
import { PipelineStages } from '../components/PipelineStages.js';
import { EventLog } from '../components/EventLog.js';
import { LiveDiscussion } from '../components/LiveDiscussion.js';
import { ReviewTrigger } from '../components/ReviewTrigger.js';
import { ReviewerCard } from '../components/ReviewerCard.js';

// ============================================================================
// Types
// ============================================================================

interface ReviewerCardState {
  status: 'running' | 'done' | 'failed';
  issueCount: number;
  elapsed: number;
}

// ============================================================================
// Helpers
// ============================================================================

function parseIssueCount(message: string): number {
  const match = message.match(/:\s*(\d+)\s+issue/);
  return match ? parseInt(match[1], 10) : 0;
}

function formatDiscussionRounds(disc: DiscussionState): string {
  const roundParts = disc.rounds.map((round) => {
    const stances = round.stances.map(s => `${s.supporterId} ${s.stance === 'AGREE' ? '✅' : '❌'}`).join(' · ');
    const suffix = round.consensusReached ? ' → consensus' : '';
    return `Round ${round.roundNum}: ${stances}${suffix}`;
  });
  return `${disc.discussionId}: ${disc.issueTitle.slice(0, 40)}\n${roundParts.join('\n')}`;
}

// ============================================================================
// Component
// ============================================================================

export function Pipeline(): React.JSX.Element {
  const { stages, currentStage, events, discussions, connected, pipelineRunning } = usePipelineEvents();

  const hasActivity = currentStage !== null || events.length > 0;

  // Build reviewer states from progress events
  const reviewerStates = useMemo(() => {
    const map = new Map<string, ReviewerCardState>();
    for (const entry of events) {
      if (entry.source !== 'progress') continue;
      const ev = entry.event as ProgressEvent;
      if (ev.stage !== 'review') continue;
      const reviewerId = ev.details?.reviewerId;
      if (!reviewerId) continue;

      if (ev.event === 'stage-update') {
        map.set(reviewerId, {
          status: 'done',
          issueCount: parseIssueCount(ev.message),
          elapsed: 0,
        });
      } else if (ev.event === 'stage-error') {
        map.set(reviewerId, {
          status: 'failed',
          issueCount: 0,
          elapsed: 0,
        });
      }
    }
    return map;
  }, [events]);

  const reviewerEntries = Array.from(reviewerStates.entries());

  // Filter completed/active discussions with rounds for the summary display
  const activeDiscussions = discussions.filter(d => d.rounds.length > 0);

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
              No active review. Start one below to see live progress.
            </p>
          </div>
          <ReviewTrigger onStarted={() => { /* WebSocket events will drive the pipeline UI */ }} />
        </>
      )}

      {hasActivity && (
        <>
          {/* Reviewer cards — shown horizontally as reviewers complete */}
          {reviewerEntries.length > 0 && (
            <section className="pipeline-section">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0' }}>
                {reviewerEntries.map(([id, state]) => (
                  <ReviewerCard
                    key={id}
                    reviewerId={id}
                    status={state.status}
                    issueCount={state.issueCount}
                    elapsed={state.elapsed}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="pipeline-section">
            <PipelineStages stages={stages} />
          </section>

          <div className="pipeline-grid">
            <section className="pipeline-section">
              <EventLog events={events} />
            </section>

            <section className="pipeline-section">
              {/* Discussion round summary */}
              {activeDiscussions.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  {activeDiscussions.map(disc => (
                    <div
                      key={disc.discussionId}
                      style={{
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--color-text-secondary)',
                        marginBottom: '8px',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {formatDiscussionRounds(disc)}
                    </div>
                  ))}
                </div>
              )}
              <LiveDiscussion discussions={discussions} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
