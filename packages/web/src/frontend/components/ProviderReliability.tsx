/**
 * ProviderReliability — Provider-level health aggregates.
 * Shows total reviews, average win rate, active model count, and health status.
 */

import React, { useMemo } from 'react';
import { aggregateProviders } from '../utils/model-helpers.js';
import type { ArmWithStats } from '../utils/model-helpers.js';

interface ProviderReliabilityProps {
  readonly arms: readonly ArmWithStats[];
}

const STATUS_LABELS: Record<string, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  unhealthy: 'Unhealthy',
};

export function ProviderReliability({ arms }: ProviderReliabilityProps): React.JSX.Element {
  const providers = useMemo(() => aggregateProviders(arms), [arms]);

  if (providers.length === 0) {
    return (
      <div className="provider-reliability">
        <h3 className="provider-reliability__title">Provider Reliability</h3>
        <p className="provider-reliability__empty">No provider data available</p>
      </div>
    );
  }

  return (
    <div className="provider-reliability">
      <h3 className="provider-reliability__title">Provider Reliability</h3>
      <div className="provider-reliability__grid">
        {providers.map((provider) => (
          <div key={provider.provider} className="provider-card">
            <div className="provider-card__header">
              <span className="provider-card__name">{provider.provider}</span>
              <span className={`provider-card__status provider-card__status--${provider.status}`}>
                {STATUS_LABELS[provider.status] ?? provider.status}
              </span>
            </div>
            <div className="provider-card__stats">
              <div className="provider-card__stat">
                <span className="provider-card__stat-value">{provider.totalReviews}</span>
                <span className="provider-card__stat-label">Reviews</span>
              </div>
              <div className="provider-card__stat">
                <span className="provider-card__stat-value">
                  {(provider.averageWinRate * 100).toFixed(1)}%
                </span>
                <span className="provider-card__stat-label">Avg Win Rate</span>
              </div>
              <div className="provider-card__stat">
                <span className="provider-card__stat-value">{provider.activeModels}</span>
                <span className="provider-card__stat-label">Models</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
