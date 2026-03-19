/**
 * DebateTimeline — Round-by-round threaded timeline view for a single discussion.
 * Shows moderator prompts, supporter responses with stance badges, and verdict.
 */

import React from 'react';
import type {
  DiscussionVerdict,
  DiscussionRound,
} from '../utils/discussion-helpers.js';
import {
  getConsensusPercentage,
  isDevilsAdvocate,
  discussionSeverityClassMap,
  discussionSeverityLabelMap,
} from '../utils/discussion-helpers.js';

interface DebateTimelineProps {
  verdict: DiscussionVerdict;
  rounds: readonly DiscussionRound[];
}

function stanceClass(stance: string): string {
  switch (stance) {
    case 'agree':
      return 'stance--agree';
    case 'disagree':
      return 'stance--disagree';
    default:
      return 'stance--neutral';
  }
}

export function DebateTimeline({
  verdict,
  rounds,
}: DebateTimelineProps): React.JSX.Element {
  const sorted = [...rounds].sort((a, b) => a.round - b.round);

  return (
    <div className="debate-timeline">
      <div className="debate-timeline__header">
        <h3 className="debate-timeline__title">
          Debate: {verdict.filePath} (L{verdict.lineRange[0]}-{verdict.lineRange[1]})
        </h3>
        <span
          className={`disc-severity ${discussionSeverityClassMap[verdict.finalSeverity]}`}
        >
          {discussionSeverityLabelMap[verdict.finalSeverity]}
        </span>
      </div>

      <div className="debate-timeline__rounds">
        {sorted.map((round) => {
          const consensusPct = getConsensusPercentage(round);

          return (
            <div key={round.round} className="debate-round">
              <div className="debate-round__header">
                <span className="debate-round__label">Round {round.round}</span>
                <span className="debate-round__consensus">
                  {consensusPct}% agree
                </span>
              </div>

              <div className="debate-round__moderator">
                <span className="debate-round__moderator-label">Moderator</span>
                <p className="debate-round__moderator-prompt">
                  {round.moderatorPrompt}
                </p>
              </div>

              <div className="debate-round__responses">
                {round.supporterResponses.map((resp) => {
                  const isDA = isDevilsAdvocate(resp.supporterId);
                  const respClass = [
                    'debate-response',
                    isDA ? 'debate-response--devil' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <div key={resp.supporterId} className={respClass}>
                      <div className="debate-response__header">
                        <span className="debate-response__supporter">
                          {resp.supporterId}
                          {isDA && (
                            <span className="debate-response__da-tag">DA</span>
                          )}
                        </span>
                        <span
                          className={`stance-badge ${stanceClass(resp.stance)}`}
                        >
                          {resp.stance}
                        </span>
                      </div>
                      <p className="debate-response__text">{resp.response}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="debate-timeline__verdict">
        <div className="debate-timeline__verdict-header">
          <span className="debate-timeline__verdict-label">Final Verdict</span>
          <span
            className={`disc-severity ${discussionSeverityClassMap[verdict.finalSeverity]}`}
          >
            {discussionSeverityLabelMap[verdict.finalSeverity]}
          </span>
          <span
            className={`consensus-badge ${
              verdict.consensusReached
                ? 'consensus--reached'
                : 'consensus--not-reached'
            }`}
          >
            {verdict.consensusReached ? 'Consensus Reached' : 'No Consensus'}
          </span>
        </div>
        <p className="debate-timeline__verdict-reasoning">{verdict.reasoning}</p>
      </div>
    </div>
  );
}
