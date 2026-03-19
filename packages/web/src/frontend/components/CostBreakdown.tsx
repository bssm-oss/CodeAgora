/**
 * CostBreakdown — Horizontal stacked bar showing cost distribution by provider.
 */

import React from 'react';
import type { ProviderAggregate } from '../utils/cost-helpers.js';
import { formatCost } from '../utils/cost-helpers.js';

interface CostBreakdownProps {
  providers: readonly ProviderAggregate[];
  totalCost: number;
}

/**
 * Provider color palette — consistent colors for common providers.
 */
const PROVIDER_COLORS: readonly string[] = [
  'var(--color-accent)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-error)',
  '#bc6bff',
  '#79c0ff',
  '#d2a8ff',
  '#a5d6ff',
];

function getProviderColor(index: number): string {
  return PROVIDER_COLORS[index % PROVIDER_COLORS.length];
}

export function CostBreakdown({ providers, totalCost }: CostBreakdownProps): React.JSX.Element {
  if (providers.length === 0 || totalCost <= 0) {
    return (
      <div className="cost-breakdown">
        <div className="cost-breakdown__title">Cost by Provider</div>
        <div className="cost-breakdown__empty">No provider cost data</div>
      </div>
    );
  }

  return (
    <div className="cost-breakdown">
      <div className="cost-breakdown__title">Cost by Provider</div>

      {/* Stacked bar */}
      <div className="cost-breakdown__bar">
        {providers.map((entry, i) => {
          const percent = (entry.totalCost / totalCost) * 100;
          if (percent < 0.5) return null;
          return (
            <div
              key={entry.provider}
              className="cost-breakdown__segment"
              style={{
                width: `${percent}%`,
                backgroundColor: getProviderColor(i),
              }}
              title={`${entry.provider}: ${formatCost(entry.totalCost)} (${percent.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="cost-breakdown__legend">
        {providers.map((entry, i) => {
          const percent = totalCost > 0 ? (entry.totalCost / totalCost) * 100 : 0;
          return (
            <div key={entry.provider} className="cost-breakdown__legend-item">
              <span
                className="cost-breakdown__legend-dot"
                style={{ backgroundColor: getProviderColor(i) }}
              />
              <span className="cost-breakdown__legend-label">
                {entry.provider}
              </span>
              <span className="cost-breakdown__legend-value">
                {formatCost(entry.totalCost)} ({percent.toFixed(1)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
