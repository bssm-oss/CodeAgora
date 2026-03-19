/**
 * QualityTrend — SVG line chart showing compositeQ over time per model.
 * Self-contained SVG with hover tooltips.
 */

import React, { useState, useMemo } from 'react';
import {
  getQualityTrend,
  getUniqueModels,
  getModelColor,
  formatShortDate,
} from '../utils/model-helpers.js';
import type { ReviewRecord, QualityDataPoint } from '../utils/model-helpers.js';

interface QualityTrendProps {
  readonly history: readonly ReviewRecord[];
}

interface TooltipInfo {
  x: number;
  y: number;
  modelId: string;
  compositeQ: number;
  date: string;
}

const CHART_WIDTH = 800;
const CHART_HEIGHT = 250;
const PADDING = { top: 20, right: 20, bottom: 40, left: 50 };
const INNER_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right;
const INNER_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom;

export function QualityTrend({ history }: QualityTrendProps): React.JSX.Element {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  const dataPoints = useMemo(() => getQualityTrend(history), [history]);
  const models = useMemo(() => getUniqueModels(dataPoints), [dataPoints]);

  if (dataPoints.length === 0) {
    return (
      <div className="quality-trend">
        <h3 className="quality-trend__title">Quality Trend</h3>
        <p className="quality-trend__empty">No quality data available</p>
      </div>
    );
  }

  const minTs = dataPoints[0].timestamp;
  const maxTs = dataPoints[dataPoints.length - 1].timestamp;
  const tsRange = maxTs - minTs || 1;

  const scaleX = (ts: number): number =>
    PADDING.left + ((ts - minTs) / tsRange) * INNER_WIDTH;
  const scaleY = (q: number): number =>
    PADDING.top + INNER_HEIGHT - q * INNER_HEIGHT;

  // Group points by model
  const modelLines = useMemo(() => {
    const grouped = new Map<string, QualityDataPoint[]>();
    for (const point of dataPoints) {
      const list = grouped.get(point.modelId);
      if (list) {
        list.push(point);
      } else {
        grouped.set(point.modelId, [point]);
      }
    }
    return grouped;
  }, [dataPoints]);

  // Generate Y-axis labels
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];

  // Generate X-axis labels (up to 6 evenly spaced)
  const xTickCount = Math.min(6, dataPoints.length);
  const xTicks: number[] = [];
  for (let i = 0; i < xTickCount; i++) {
    const ts = minTs + (tsRange * i) / Math.max(xTickCount - 1, 1);
    xTicks.push(ts);
  }

  const handleMouseEnter = (point: QualityDataPoint, x: number, y: number): void => {
    setTooltip({
      x,
      y,
      modelId: point.modelId,
      compositeQ: point.compositeQ,
      date: formatShortDate(point.timestamp),
    });
  };

  const handleMouseLeave = (): void => {
    setTooltip(null);
  };

  return (
    <div className="quality-trend">
      <h3 className="quality-trend__title">Quality Trend</h3>
      <div className="quality-trend__legend">
        {models.map((modelId, i) => (
          <span key={modelId} className="quality-trend__legend-item">
            <span
              className="quality-trend__legend-dot"
              style={{ backgroundColor: getModelColor(i) }}
            />
            {modelId}
          </span>
        ))}
      </div>
      <svg
        className="quality-trend__svg"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Y-axis grid lines and labels */}
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={PADDING.left}
              y1={scaleY(tick)}
              x2={CHART_WIDTH - PADDING.right}
              y2={scaleY(tick)}
              stroke="var(--color-border)"
              strokeDasharray="4,4"
            />
            <text
              x={PADDING.left - 8}
              y={scaleY(tick) + 4}
              textAnchor="end"
              className="quality-trend__label"
            >
              {tick.toFixed(2)}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xTicks.map((ts) => (
          <text
            key={`x-${ts}`}
            x={scaleX(ts)}
            y={CHART_HEIGHT - 8}
            textAnchor="middle"
            className="quality-trend__label"
          >
            {formatShortDate(ts)}
          </text>
        ))}

        {/* Lines per model */}
        {models.map((modelId, modelIndex) => {
          const points = modelLines.get(modelId) ?? [];
          if (points.length < 2) return null;

          const pathData = points
            .map((p, i) => {
              const x = scaleX(p.timestamp);
              const y = scaleY(p.compositeQ);
              return `${i === 0 ? 'M' : 'L'}${x},${y}`;
            })
            .join(' ');

          return (
            <path
              key={modelId}
              d={pathData}
              fill="none"
              stroke={getModelColor(modelIndex)}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          );
        })}

        {/* Data points (circles) */}
        {models.map((modelId, modelIndex) => {
          const points = modelLines.get(modelId) ?? [];
          return points.map((point) => {
            const cx = scaleX(point.timestamp);
            const cy = scaleY(point.compositeQ);
            return (
              <circle
                key={`${modelId}-${point.timestamp}-${point.compositeQ}`}
                cx={cx}
                cy={cy}
                r={4}
                fill={getModelColor(modelIndex)}
                stroke="var(--color-bg)"
                strokeWidth={1.5}
                onMouseEnter={() => handleMouseEnter(point, cx, cy)}
                onMouseLeave={handleMouseLeave}
                style={{ cursor: 'pointer' }}
              />
            );
          });
        })}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect
              x={tooltip.x + 10}
              y={tooltip.y - 36}
              width={180}
              height={32}
              rx={4}
              fill="var(--color-bg-tertiary)"
              stroke="var(--color-border)"
            />
            <text
              x={tooltip.x + 18}
              y={tooltip.y - 17}
              className="quality-trend__tooltip-text"
            >
              {tooltip.modelId}: {tooltip.compositeQ.toFixed(3)} ({tooltip.date})
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
