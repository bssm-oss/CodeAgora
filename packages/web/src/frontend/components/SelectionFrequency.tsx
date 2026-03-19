/**
 * SelectionFrequency — Bar chart showing how often each model was selected.
 * Groups by provider, color intensity based on frequency.
 */

import React, { useMemo } from 'react';
import {
  countReviewsByModel,
  extractProvider,
  getModelColor,
} from '../utils/model-helpers.js';
import type { ReviewRecord } from '../utils/model-helpers.js';

interface SelectionFrequencyProps {
  readonly history: readonly ReviewRecord[];
}

interface BarData {
  modelId: string;
  provider: string;
  count: number;
}

export function SelectionFrequency({ history }: SelectionFrequencyProps): React.JSX.Element {
  const bars = useMemo((): BarData[] => {
    const counts = countReviewsByModel(history);
    const result: BarData[] = [];

    for (const [modelId, count] of counts) {
      result.push({
        modelId,
        provider: extractProvider(modelId),
        count,
      });
    }

    return result.sort((a, b) => b.count - a.count);
  }, [history]);

  if (bars.length === 0) {
    return (
      <div className="selection-frequency">
        <h3 className="selection-frequency__title">Selection Frequency</h3>
        <p className="selection-frequency__empty">No selection data available</p>
      </div>
    );
  }

  const maxCount = Math.max(...bars.map((b) => b.count));

  // Group by provider for legend
  const providers = [...new Set(bars.map((b) => b.provider))];

  return (
    <div className="selection-frequency">
      <h3 className="selection-frequency__title">Selection Frequency</h3>
      <div className="selection-frequency__legend">
        {providers.map((provider, i) => (
          <span key={provider} className="selection-frequency__legend-item">
            <span
              className="selection-frequency__legend-dot"
              style={{ backgroundColor: getModelColor(i) }}
            />
            {provider}
          </span>
        ))}
      </div>
      <div className="selection-frequency__bars">
        {bars.map((bar) => {
          const widthPercent = maxCount > 0 ? (bar.count / maxCount) * 100 : 0;
          const providerIndex = providers.indexOf(bar.provider);
          const opacity = 0.4 + (bar.count / maxCount) * 0.6;

          return (
            <div key={bar.modelId} className="selection-frequency__row">
              <div className="selection-frequency__label">
                <code>{bar.modelId}</code>
              </div>
              <div className="selection-frequency__bar-track">
                <div
                  className="selection-frequency__bar-fill"
                  style={{
                    width: `${widthPercent}%`,
                    backgroundColor: getModelColor(providerIndex),
                    opacity,
                  }}
                />
              </div>
              <div className="selection-frequency__count">{bar.count}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
