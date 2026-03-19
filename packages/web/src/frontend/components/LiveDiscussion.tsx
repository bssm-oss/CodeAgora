/**
 * LiveDiscussion — Real-time discussion progress cards.
 * Shows active discussions with supporter stances per round.
 */

import React from 'react';
import type { DiscussionState } from '../hooks/usePipelineEvents.js';

interface LiveDiscussionProps {
  discussions: DiscussionState[];
}

const STANCE_CLASSES: Record<string, string> = {
  agree: 'stance--agree',
  disagree: 'stance--disagree',
  neutral: 'stance--neutral',
};

const SEVERITY_CLASSES: Record<string, string> = {
  CRITICAL: 'severity--critical',
  ERROR: 'severity--error',
  WARNING: 'severity--warning',
  INFO: 'severity--info',
};

function getSeverityClass(severity: string): string {
  return SEVERITY_CLASSES[severity.toUpperCase()] ?? 'severity--info';
}

function getStanceClass(stance: string): string {
  return STANCE_CLASSES[stance.toLowerCase()] ?? 'stance--neutral';
}

export function LiveDiscussion({ discussions }: LiveDiscussionProps): React.JSX.Element {
  if (discussions.length === 0) {
    return (
      <div className="live-discussions">
        <h3>Discussions</h3>
        <p className="live-discussions-empty">No active discussions</p>
      </div>
    );
  }

  // Show active (not completed) first, then completed
  const sorted = [...discussions].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return 0;
  });

  return (
    <div className="live-discussions">
      <h3>Discussions</h3>
      <div className="discussion-cards">
        {sorted.map((disc) => (
          <div
            key={disc.discussionId}
            className={`discussion-card ${disc.completed ? 'discussion-card--completed' : 'discussion-card--active'}`}
          >
            <div className="discussion-card-header">
              <span className={`discussion-severity ${getSeverityClass(disc.severity)}`}>
                {disc.severity}
              </span>
              <span className="discussion-status">
                {disc.completed ? 'Completed' : 'Active'}
              </span>
            </div>
            <h4 className="discussion-title">{disc.issueTitle}</h4>
            <p className="discussion-file">
              <code>{disc.filePath}</code>
            </p>

            {disc.rounds.length > 0 && (
              <div className="discussion-rounds">
                {disc.rounds.map((round) => (
                  <div key={round.roundNum} className="discussion-round">
                    <span className="round-label">Round {round.roundNum}</span>
                    <div className="round-stances">
                      {round.stances.map((s, idx) => (
                        <span
                          key={`${s.supporterId}-${idx}`}
                          className={`stance-badge ${getStanceClass(s.stance)}`}
                          title={`${s.supporterId}: ${s.response}`}
                        >
                          {s.supporterId}: {s.stance}
                        </span>
                      ))}
                    </div>
                    {round.consensusReached !== undefined && (
                      <span className={`consensus-badge ${round.consensusReached ? 'consensus--reached' : 'consensus--not-reached'}`}>
                        {round.consensusReached
                          ? `Consensus: ${round.consensusSeverity ?? 'yes'}`
                          : 'No consensus'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {disc.forcedDecision && (
              <div className="discussion-forced">
                Forced: {disc.forcedDecision.severity} — {disc.forcedDecision.reasoning}
              </div>
            )}

            {disc.objections.length > 0 && (
              <div className="discussion-objections">
                {disc.objections.map((obj, idx) => (
                  <div key={idx} className="objection-item">
                    Objection by {obj.supporterId}: {obj.reasoning}
                  </div>
                ))}
              </div>
            )}

            {disc.finalSeverity && (
              <div className="discussion-final">
                Final: <span className={getSeverityClass(disc.finalSeverity)}>{disc.finalSeverity}</span>
                {disc.consensusReached !== undefined && (
                  <span> ({disc.consensusReached ? 'consensus' : 'no consensus'})</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
