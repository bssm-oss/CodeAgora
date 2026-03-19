/**
 * CostTrend — SVG line chart showing cost per session over time.
 * Self-contained SVG rendering, no external chart library.
 */

import React, { useState, useRef, useCallback } from 'react';
import type { RunningAveragePoint } from '../utils/cost-helpers.js';
import { formatCost } from '../utils/cost-helpers.js';

interface CostTrendProps {
  data: readonly RunningAveragePoint[];
  height?: number;
}

const PADDING_LEFT = 56;
const PADDING_RIGHT = 16;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 32;
const SVG_WIDTH = 600;

interface TooltipState {
  x: number;
  y: number;
  sessionId: string;
  cost: number;
}

export function CostTrend({ data, height = 180 }: CostTrendProps): React.JSX.Element {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const chartWidth = SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const chartHeight = height - PADDING_TOP - PADDING_BOTTOM;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || data.length === 0) {
        setTooltip(null);
        return;
      }

      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * SVG_WIDTH;
      const step = data.length > 1 ? chartWidth / (data.length - 1) : 0;

      if (step === 0) {
        const point = data[0];
        setTooltip({
          x: PADDING_LEFT,
          y: PADDING_TOP,
          sessionId: point.sessionId,
          cost: point.cost,
        });
        return;
      }

      const index = Math.round((mouseX - PADDING_LEFT) / step);

      if (index >= 0 && index < data.length) {
        const point = data[index];
        const px = PADDING_LEFT + index * step;
        setTooltip({
          x: px,
          y: PADDING_TOP,
          sessionId: point.sessionId,
          cost: point.cost,
        });
      } else {
        setTooltip(null);
      }
    },
    [data, chartWidth],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  if (data.length === 0) {
    return (
      <div className="cost-trend">
        <div className="cost-trend__title">Cost per Session</div>
        <div className="cost-trend__empty">No cost data available</div>
      </div>
    );
  }

  const maxCost = Math.max(...data.map((d) => d.cost), 0.0001);

  const xScale = (index: number): number => {
    if (data.length <= 1) return PADDING_LEFT + chartWidth / 2;
    return PADDING_LEFT + (index / (data.length - 1)) * chartWidth;
  };

  const yScale = (value: number): number => {
    return PADDING_TOP + chartHeight - (value / maxCost) * chartHeight;
  };

  // Build line path for cost
  const costPath = data
    .map((point, i) => {
      const x = xScale(i);
      const y = yScale(point.cost);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  // Build dashed line path for running average
  const avgPath = data
    .map((point, i) => {
      const x = xScale(i);
      const y = yScale(point.average);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  // Y-axis ticks
  const yTicks = [0, maxCost / 2, maxCost];

  return (
    <div className="cost-trend">
      <div className="cost-trend__title">Cost per Session</div>
      <svg
        ref={svgRef}
        className="cost-trend__svg"
        width="100%"
        height={height}
        viewBox={`0 0 ${SVG_WIDTH} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Grid lines */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING_LEFT}
              y1={yScale(tick)}
              x2={SVG_WIDTH - PADDING_RIGHT}
              y2={yScale(tick)}
              stroke="var(--color-border)"
              strokeWidth={1}
              strokeDasharray={tick > 0 ? '4 4' : undefined}
            />
            <text
              x={PADDING_LEFT - 6}
              y={yScale(tick) + 4}
              textAnchor="end"
              className="cost-trend__label"
            >
              {formatCost(tick)}
            </text>
          </g>
        ))}

        {/* Running average line (dashed) */}
        <path
          d={avgPath}
          fill="none"
          stroke="var(--color-warning)"
          strokeWidth={1.5}
          strokeDasharray="6 4"
          opacity={0.7}
        />

        {/* Cost line */}
        <path
          d={costPath}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
        />

        {/* Data points */}
        {data.map((point, i) => (
          <circle
            key={`${point.date}-${point.sessionId}`}
            cx={xScale(i)}
            cy={yScale(point.cost)}
            r={3}
            fill="var(--color-accent)"
            stroke="var(--color-bg)"
            strokeWidth={1.5}
          />
        ))}

        {/* X-axis labels */}
        {data.length > 0 && (
          <>
            <text
              x={xScale(0)}
              y={height - 6}
              textAnchor="start"
              className="cost-trend__label"
            >
              {data[0].date}
            </text>
            {data.length > 1 && (
              <text
                x={xScale(data.length - 1)}
                y={height - 6}
                textAnchor="end"
                className="cost-trend__label"
              >
                {data[data.length - 1].date}
              </text>
            )}
          </>
        )}

        {/* Legend */}
        <line x1={PADDING_LEFT} y1={height - 16} x2={PADDING_LEFT + 16} y2={height - 16} stroke="var(--color-accent)" strokeWidth={2} />
        <text x={PADDING_LEFT + 20} y={height - 12} className="cost-trend__label">Cost</text>
        <line x1={PADDING_LEFT + 60} y1={height - 16} x2={PADDING_LEFT + 76} y2={height - 16} stroke="var(--color-warning)" strokeWidth={1.5} strokeDasharray="4 3" />
        <text x={PADDING_LEFT + 80} y={height - 12} className="cost-trend__label">Avg</text>

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect
              x={Math.min(tooltip.x - 50, SVG_WIDTH - PADDING_RIGHT - 100)}
              y={tooltip.y - 4}
              width={100}
              height={20}
              fill="var(--color-bg-tertiary)"
              stroke="var(--color-border)"
              rx={4}
            />
            <text
              x={Math.min(tooltip.x, SVG_WIDTH - PADDING_RIGHT - 50)}
              y={tooltip.y + 10}
              textAnchor="middle"
              className="cost-trend__tooltip-text"
            >
              #{tooltip.sessionId}: {formatCost(tooltip.cost)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
