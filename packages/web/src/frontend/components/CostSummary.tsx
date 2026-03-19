/**
 * CostSummary — Grid of metric cards showing cost overview.
 */

import React from 'react';
import type { SessionCost } from '../utils/cost-helpers.js';
import {
  computeTotalCost,
  computeAverageCost,
  findMostExpensive,
  findMostExpensiveReviewer,
  formatCost,
} from '../utils/cost-helpers.js';

interface CostSummaryProps {
  sessions: readonly SessionCost[];
}

export function CostSummary({ sessions }: CostSummaryProps): React.JSX.Element {
  const total = computeTotalCost(sessions);
  const average = computeAverageCost(sessions);
  const mostExpensive = findMostExpensive(sessions);
  const topReviewer = findMostExpensiveReviewer(sessions);

  return (
    <div className="cost-summary-grid">
      <div className="cost-card">
        <div className="cost-card__label">Total Spend</div>
        <div className="cost-card__value">{formatCost(total)}</div>
        <div className="cost-card__detail">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</div>
      </div>

      <div className="cost-card">
        <div className="cost-card__label">Avg per Session</div>
        <div className="cost-card__value">{formatCost(average)}</div>
      </div>

      <div className="cost-card">
        <div className="cost-card__label">Most Expensive Session</div>
        <div className="cost-card__value">
          {mostExpensive ? formatCost(mostExpensive.totalCost) : '--'}
        </div>
        <div className="cost-card__detail">
          {mostExpensive ? `${mostExpensive.date} / ${mostExpensive.sessionId}` : ''}
        </div>
      </div>

      <div className="cost-card">
        <div className="cost-card__label">Top Reviewer</div>
        <div className="cost-card__value">
          {topReviewer ? formatCost(topReviewer.totalCost) : '--'}
        </div>
        <div className="cost-card__detail">
          {topReviewer ? topReviewer.reviewer : ''}
        </div>
      </div>
    </div>
  );
}
