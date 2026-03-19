/**
 * ConsensusProgress — Bar chart showing consensus percentage per round.
 * Displays a threshold line and whether consensus was ultimately reached.
 */

import React from 'react';
import type { DiscussionRound } from '../utils/discussion-helpers.js';
import { getConsensusPercentage } from '../utils/discussion-helpers.js';

interface ConsensusProgressProps {
  rounds: readonly DiscussionRound[];
  consensusReached: boolean;
  threshold?: number;
}

const BAR_HEIGHT = 20;
const BAR_GAP = 6;
const LABEL_WIDTH = 60;
const CHART_WIDTH = 300;
const THRESHOLD_DEFAULT = 75;

export function ConsensusProgress({
  rounds,
  consensusReached,
  threshold = THRESHOLD_DEFAULT,
}: ConsensusProgressProps): React.JSX.Element {
  const sorted = [...rounds].sort((a, b) => a.round - b.round);

  if (sorted.length === 0) {
    return (
      <div className="consensus-progress">
        <p className="consensus-progress__empty">No round data available.</p>
      </div>
    );
  }

  const percentages = sorted.map((r) => getConsensusPercentage(r));
  const svgHeight = sorted.length * (BAR_HEIGHT + BAR_GAP) + 24;
  const svgWidth = LABEL_WIDTH + CHART_WIDTH + 40;
  const thresholdX = LABEL_WIDTH + (threshold / 100) * CHART_WIDTH;

  return (
    <div className="consensus-progress">
      <h4 className="consensus-progress__title">Consensus Progress</h4>

      <svg
        className="consensus-progress__svg"
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      >
        {/* Threshold line */}
        <line
          x1={thresholdX}
          y1={0}
          x2={thresholdX}
          y2={svgHeight - 20}
          stroke="rgba(210, 153, 34, 0.5)"
          strokeWidth={1}
          strokeDasharray="4,3"
        />
        <text
          x={thresholdX}
          y={svgHeight - 6}
          textAnchor="middle"
          className="consensus-progress__threshold-label"
        >
          {threshold}%
        </text>

        {/* Bars */}
        {sorted.map((round, idx) => {
          const pct = percentages[idx];
          const y = idx * (BAR_HEIGHT + BAR_GAP) + 4;
          const barWidth = (pct / 100) * CHART_WIDTH;
          const meetsThreshold = pct >= threshold;

          return (
            <g key={round.round}>
              <text
                x={LABEL_WIDTH - 8}
                y={y + BAR_HEIGHT / 2 + 4}
                textAnchor="end"
                className="consensus-progress__bar-label"
              >
                Round {round.round}
              </text>

              {/* Background track */}
              <rect
                x={LABEL_WIDTH}
                y={y}
                width={CHART_WIDTH}
                height={BAR_HEIGHT}
                rx={3}
                fill="rgba(48, 54, 61, 0.5)"
              />

              {/* Fill bar */}
              <rect
                x={LABEL_WIDTH}
                y={y}
                width={Math.max(barWidth, 0)}
                height={BAR_HEIGHT}
                rx={3}
                fill={
                  meetsThreshold
                    ? 'rgba(63, 185, 80, 0.7)'
                    : 'rgba(88, 166, 255, 0.7)'
                }
              />

              {/* Percentage label */}
              <text
                x={LABEL_WIDTH + CHART_WIDTH + 6}
                y={y + BAR_HEIGHT / 2 + 4}
                className="consensus-progress__pct-label"
              >
                {pct}%
              </text>
            </g>
          );
        })}
      </svg>

      <div className="consensus-progress__result">
        <span
          className={`consensus-badge ${
            consensusReached ? 'consensus--reached' : 'consensus--not-reached'
          }`}
        >
          {consensusReached ? 'Consensus Reached' : 'No Consensus'}
        </span>
      </div>
    </div>
  );
}
