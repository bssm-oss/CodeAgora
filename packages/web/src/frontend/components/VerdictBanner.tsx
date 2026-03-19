import React from 'react';
import { decisionClassMap, decisionLabelMap } from '../utils/review-helpers.js';
import type { Decision } from '../utils/review-helpers.js';

interface VerdictBannerProps {
  decision: Decision;
  reasoning: string;
  questionsForHuman?: string[];
}

export function VerdictBanner({ decision, reasoning, questionsForHuman }: VerdictBannerProps): React.JSX.Element {
  return (
    <div className={`verdict-banner ${decisionClassMap[decision]}`}>
      <div className="verdict-banner__header">
        <span className="verdict-banner__decision">{decisionLabelMap[decision]}</span>
      </div>
      <p className="verdict-banner__reasoning">{reasoning}</p>
      {questionsForHuman && questionsForHuman.length > 0 && (
        <div className="verdict-banner__questions">
          <h4 className="verdict-banner__questions-title">Questions for Human</h4>
          <ul className="verdict-banner__questions-list">
            {questionsForHuman.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export type { Decision };
