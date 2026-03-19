/**
 * ReviewerCosts — Bar chart and table showing cost per reviewer/model.
 * Aggregated across all sessions, sorted by total cost descending.
 */

import React from 'react';
import type { ReviewerAggregate } from '../utils/cost-helpers.js';
import { formatCost } from '../utils/cost-helpers.js';

interface ReviewerCostsProps {
  reviewers: readonly ReviewerAggregate[];
}

export function ReviewerCosts({ reviewers }: ReviewerCostsProps): React.JSX.Element {
  if (reviewers.length === 0) {
    return (
      <div className="reviewer-costs">
        <div className="reviewer-costs__title">Cost by Reviewer</div>
        <div className="reviewer-costs__empty">No reviewer cost data</div>
      </div>
    );
  }

  const maxCost = Math.max(...reviewers.map((r) => r.totalCost), 0.0001);

  return (
    <div className="reviewer-costs">
      <div className="reviewer-costs__title">Cost by Reviewer</div>
      <div className="reviewer-costs__list">
        {reviewers.map((entry) => {
          const widthPercent = (entry.totalCost / maxCost) * 100;
          // Extract provider/model from the reviewer key
          const parts = entry.reviewer.split('/');
          const provider = parts.length > 1 ? parts[0] : '';
          const model = parts.length > 1 ? parts.slice(1).join('/') : entry.reviewer;

          return (
            <div key={entry.reviewer} className="reviewer-costs__row">
              <div className="reviewer-costs__info">
                <span className="reviewer-costs__name">{model}</span>
                {provider && (
                  <span className="reviewer-costs__provider">{provider}</span>
                )}
              </div>
              <div className="reviewer-costs__bar-wrapper">
                <div
                  className="reviewer-costs__bar"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
              <div className="reviewer-costs__amount">{formatCost(entry.totalCost)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
