/**
 * Models — Model intelligence dashboard page.
 * Shows leaderboard, quality trends, selection frequency, and provider reliability.
 */

import React from 'react';
import { useApi } from '../hooks/useApi.js';
import { ModelLeaderboard } from '../components/ModelLeaderboard.js';
import { QualityTrend } from '../components/QualityTrend.js';
import { SelectionFrequency } from '../components/SelectionFrequency.js';
import { ProviderReliability } from '../components/ProviderReliability.js';
import type { ArmWithStats, ReviewRecord } from '../utils/model-helpers.js';

interface ModelsResponse {
  arms: ArmWithStats[];
  historySummary: {
    totalReviews: number;
    lastUpdated?: string;
  };
  status: string;
}

interface HistoryResponse {
  history: ReviewRecord[];
}

export function Models(): React.JSX.Element {
  const { data: modelsData, loading: modelsLoading, error: modelsError, refetch: refetchModels } =
    useApi<ModelsResponse>('/api/models');
  const { data: historyData, loading: historyLoading, error: historyError } =
    useApi<HistoryResponse>('/api/models/history');

  const loading = modelsLoading || historyLoading;
  const error = modelsError ?? historyError;

  if (loading) {
    return (
      <div className="page">
        <h2>Model Intelligence</h2>
        <p>Loading model data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h2>Model Intelligence</h2>
        <p className="error-text">Error: {error}</p>
        <button onClick={refetchModels} type="button" className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  const arms = modelsData?.arms ?? [];
  const history = historyData?.history ?? [];
  const totalReviews = modelsData?.historySummary?.totalReviews ?? 0;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Model Intelligence</h2>
        <span className="page-header__count">
          {arms.length} model{arms.length !== 1 ? 's' : ''} &middot; {totalReviews} review{totalReviews !== 1 ? 's' : ''}
        </span>
      </div>

      <ModelLeaderboard arms={arms} />

      <div className="models-grid">
        <QualityTrend history={history} />
        <SelectionFrequency history={history} />
      </div>

      <ProviderReliability arms={arms} />
    </div>
  );
}
