/**
 * StanceVisualization — SVG grid showing how each supporter's stance
 * changed across rounds. Rows = supporters, columns = rounds.
 */

import React from 'react';
import type { DiscussionRound, Stance } from '../utils/discussion-helpers.js';
import { getStanceProgression, isDevilsAdvocate } from '../utils/discussion-helpers.js';

interface StanceVisualizationProps {
  rounds: readonly DiscussionRound[];
}

const CELL_SIZE = 32;
const CELL_GAP = 4;
const LABEL_WIDTH = 140;
const HEADER_HEIGHT = 28;

const stanceColorMap: Record<Stance, string> = {
  agree: 'rgba(63, 185, 80, 0.7)',
  disagree: 'rgba(248, 81, 73, 0.7)',
  neutral: 'rgba(139, 148, 158, 0.4)',
};

export function StanceVisualization({
  rounds,
}: StanceVisualizationProps): React.JSX.Element {
  const progression = getStanceProgression(rounds);
  const sorted = [...rounds].sort((a, b) => a.round - b.round);

  if (progression.length === 0 || sorted.length === 0) {
    return (
      <div className="stance-viz">
        <p className="stance-viz__empty">No stance data available.</p>
      </div>
    );
  }

  const numRounds = sorted.length;
  const numSupporters = progression.length;
  const svgWidth = LABEL_WIDTH + numRounds * (CELL_SIZE + CELL_GAP);
  const svgHeight = HEADER_HEIGHT + numSupporters * (CELL_SIZE + CELL_GAP);

  return (
    <div className="stance-viz">
      <h4 className="stance-viz__title">Stance Progression</h4>
      <div className="stance-viz__scroll">
        <svg
          className="stance-viz__svg"
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        >
          {/* Column headers (round numbers) */}
          {sorted.map((round, colIdx) => (
            <text
              key={`header-${round.round}`}
              x={LABEL_WIDTH + colIdx * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2}
              y={HEADER_HEIGHT - 8}
              textAnchor="middle"
              className="stance-viz__header-text"
            >
              R{round.round}
            </text>
          ))}

          {/* Rows */}
          {progression.map((entry, rowIdx) => {
            const y = HEADER_HEIGHT + rowIdx * (CELL_SIZE + CELL_GAP);
            const isDA = isDevilsAdvocate(entry.supporterId);
            const labelText =
              entry.supporterId.length > 16
                ? entry.supporterId.slice(0, 14) + '...'
                : entry.supporterId;

            return (
              <g key={entry.supporterId}>
                {/* Row label */}
                <text
                  x={LABEL_WIDTH - 8}
                  y={y + CELL_SIZE / 2 + 4}
                  textAnchor="end"
                  className={`stance-viz__row-label ${isDA ? 'stance-viz__row-label--da' : ''}`}
                >
                  {labelText}
                  {isDA ? ' (DA)' : ''}
                </text>

                {/* Stance cells */}
                {entry.stances.map((stance, colIdx) => (
                  <rect
                    key={`${entry.supporterId}-${colIdx}`}
                    x={LABEL_WIDTH + colIdx * (CELL_SIZE + CELL_GAP)}
                    y={y}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    rx={4}
                    fill={stanceColorMap[stance]}
                  >
                    <title>
                      {entry.supporterId} - Round {sorted[colIdx].round}: {stance}
                    </title>
                  </rect>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="stance-viz__legend">
        <span className="stance-viz__legend-item">
          <span
            className="stance-viz__legend-dot"
            style={{ backgroundColor: stanceColorMap.agree }}
          />
          Agree
        </span>
        <span className="stance-viz__legend-item">
          <span
            className="stance-viz__legend-dot"
            style={{ backgroundColor: stanceColorMap.disagree }}
          />
          Disagree
        </span>
        <span className="stance-viz__legend-item">
          <span
            className="stance-viz__legend-dot"
            style={{ backgroundColor: stanceColorMap.neutral }}
          />
          Neutral
        </span>
      </div>
    </div>
  );
}
