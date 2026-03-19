/**
 * ModelLeaderboard — Ranked table of model performance.
 * Displays win rate, review count, alpha/beta, confidence interval, and last used.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  computeWinRate,
  computeConfidenceInterval,
  formatFullDate,
} from '../utils/model-helpers.js';
import type { ArmWithStats } from '../utils/model-helpers.js';

type SortField = 'winRate' | 'reviewCount' | 'alpha' | 'beta' | 'lastUsed' | 'modelId';
type SortDir = 'asc' | 'desc';

interface ModelLeaderboardProps {
  readonly arms: readonly ArmWithStats[];
}

export function ModelLeaderboard({ arms }: ModelLeaderboardProps): React.JSX.Element {
  const [sortField, setSortField] = useState<SortField>('winRate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('desc');
      return field;
    });
  }, []);

  const sorted = useMemo(() => {
    const copy = [...arms];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'winRate':
          cmp = a.winRate - b.winRate;
          break;
        case 'reviewCount':
          cmp = a.reviewCount - b.reviewCount;
          break;
        case 'alpha':
          cmp = a.alpha - b.alpha;
          break;
        case 'beta':
          cmp = a.beta - b.beta;
          break;
        case 'lastUsed':
          cmp = a.lastUsed - b.lastUsed;
          break;
        case 'modelId':
          cmp = a.modelId.localeCompare(b.modelId);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [arms, sortField, sortDir]);

  const topModelId = useMemo(() => {
    if (arms.length === 0) return null;
    let best = arms[0];
    for (const arm of arms) {
      if (arm.winRate > best.winRate) best = arm;
    }
    return best.modelId;
  }, [arms]);

  if (arms.length === 0) {
    return (
      <div className="model-leaderboard">
        <h3 className="model-leaderboard__title">Model Leaderboard</h3>
        <p className="model-leaderboard__empty">No model data available</p>
      </div>
    );
  }

  const sortIndicator = (field: SortField): string => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  return (
    <div className="model-leaderboard">
      <h3 className="model-leaderboard__title">Model Leaderboard</h3>
      <table className="model-table">
        <thead>
          <tr>
            <th className="model-th">#</th>
            <th
              className="model-th model-th--sortable"
              onClick={() => handleSort('modelId')}
            >
              Model{sortIndicator('modelId')}
            </th>
            <th className="model-th">Provider</th>
            <th
              className="model-th model-th--sortable"
              onClick={() => handleSort('winRate')}
            >
              Win Rate{sortIndicator('winRate')}
            </th>
            <th
              className="model-th model-th--sortable"
              onClick={() => handleSort('reviewCount')}
            >
              Reviews{sortIndicator('reviewCount')}
            </th>
            <th
              className="model-th model-th--sortable"
              onClick={() => handleSort('alpha')}
            >
              Alpha{sortIndicator('alpha')}
            </th>
            <th
              className="model-th model-th--sortable"
              onClick={() => handleSort('beta')}
            >
              Beta{sortIndicator('beta')}
            </th>
            <th className="model-th">CI (95%)</th>
            <th
              className="model-th model-th--sortable"
              onClick={() => handleSort('lastUsed')}
            >
              Last Used{sortIndicator('lastUsed')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((arm, index) => {
            const winRate = computeWinRate(arm);
            const ci = computeConfidenceInterval(arm);
            const provider = arm.modelId.includes('/')
              ? arm.modelId.split('/')[0]
              : arm.modelId;
            const isTop = arm.modelId === topModelId;

            let winRateClass = 'model-winrate--low';
            if (winRate > 0.7) winRateClass = 'model-winrate--high';
            else if (winRate >= 0.4) winRateClass = 'model-winrate--medium';

            return (
              <tr
                key={arm.modelId}
                className={`model-row${isTop ? ' model-row--top' : ''}`}
              >
                <td className="model-td model-td--rank">{index + 1}</td>
                <td className="model-td model-td--id">
                  <code>{arm.modelId}</code>
                </td>
                <td className="model-td">{provider}</td>
                <td className={`model-td ${winRateClass}`}>
                  {(winRate * 100).toFixed(1)}%
                </td>
                <td className="model-td">{arm.reviewCount}</td>
                <td className="model-td model-td--mono">{arm.alpha.toFixed(1)}</td>
                <td className="model-td model-td--mono">{arm.beta.toFixed(1)}</td>
                <td className="model-td model-td--mono">
                  {ci > 0 ? `\u00B1${(ci * 100).toFixed(1)}%` : '--'}
                </td>
                <td className="model-td model-td--date">
                  {arm.lastUsed > 0 ? formatFullDate(arm.lastUsed) : '--'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
