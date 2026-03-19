/**
 * Costs — Cost analytics dashboard page.
 * Shows total spend summary, cost-per-session trend, reviewer breakdown,
 * and provider distribution.
 */

import React, { useMemo } from 'react';
import { useApi } from '../hooks/useApi.js';
import { CostSummary } from '../components/CostSummary.js';
import { CostTrend } from '../components/CostTrend.js';
import { ReviewerCosts } from '../components/ReviewerCosts.js';
import { CostBreakdown } from '../components/CostBreakdown.js';
import type { CostsApiResponse } from '../utils/cost-helpers.js';
import {
  aggregateByReviewer,
  aggregateByProvider,
  computeRunningAverage,
  computeTotalCost,
} from '../utils/cost-helpers.js';

export function Costs(): React.JSX.Element {
  const { data, loading, error, refetch } = useApi<CostsApiResponse>('/api/costs');

  const sessions = data?.sessions ?? [];

  const trendData = useMemo(
    () => computeRunningAverage(sessions),
    [sessions],
  );

  const reviewerAggregates = useMemo(
    () => aggregateByReviewer(sessions),
    [sessions],
  );

  const providerAggregates = useMemo(
    () => aggregateByProvider(sessions),
    [sessions],
  );

  const totalCost = useMemo(
    () => computeTotalCost(sessions),
    [sessions],
  );

  if (loading) {
    return (
      <div className="page">
        <h2>Cost Analytics</h2>
        <p>Loading cost data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h2>Cost Analytics</h2>
        <p className="error-text">Error: {error}</p>
        <button onClick={refetch} type="button" className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Cost Analytics</h2>
        <span className="page-header__count">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </span>
      </div>

      <CostSummary sessions={sessions} />
      <CostTrend data={trendData} />
      <ReviewerCosts reviewers={reviewerAggregates} />
      <CostBreakdown providers={providerAggregates} totalCost={totalCost} />
    </div>
  );
}
