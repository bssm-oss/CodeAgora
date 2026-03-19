/**
 * TrendChart — Self-contained SVG bar/line chart.
 * No external chart library — pure SVG rendering.
 */

import React, { useState, useRef, useCallback } from 'react';

export interface TrendDataPoint {
  label: string;
  value: number;
}

interface TrendChartProps {
  data: readonly TrendDataPoint[];
  title: string;
  height?: number;
  barColor?: string;
}

const PADDING_LEFT = 40;
const PADDING_RIGHT = 16;
const PADDING_TOP = 8;
const PADDING_BOTTOM = 28;

export function TrendChart({
  data,
  title,
  height = 120,
  barColor = 'var(--color-accent)',
}: TrendChartProps): React.JSX.Element {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || data.length === 0) {
        setTooltip(null);
        return;
      }

      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const chartWidth = rect.width - PADDING_LEFT - PADDING_RIGHT;
      const barWidth = chartWidth / data.length;
      const index = Math.floor((mouseX - PADDING_LEFT) / barWidth);

      if (index >= 0 && index < data.length) {
        const point = data[index];
        setTooltip({
          x: PADDING_LEFT + index * barWidth + barWidth / 2,
          y: PADDING_TOP,
          label: point.label,
          value: point.value,
        });
      } else {
        setTooltip(null);
      }
    },
    [data],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  if (data.length === 0) {
    return (
      <div className="trend-chart">
        <div className="trend-chart__title">{title}</div>
        <div className="trend-chart__empty">No data available</div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="trend-chart">
      <div className="trend-chart__title">{title}</div>
      <svg
        ref={svgRef}
        className="trend-chart__svg"
        width="100%"
        height={height}
        viewBox={`0 0 400 ${height}`}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Y-axis labels */}
        <text x={PADDING_LEFT - 4} y={PADDING_TOP + 8} textAnchor="end" className="trend-chart__label">
          {maxValue}
        </text>
        <text x={PADDING_LEFT - 4} y={height - PADDING_BOTTOM} textAnchor="end" className="trend-chart__label">
          0
        </text>

        {/* Grid line */}
        <line
          x1={PADDING_LEFT}
          y1={height - PADDING_BOTTOM}
          x2={400 - PADDING_RIGHT}
          y2={height - PADDING_BOTTOM}
          stroke="var(--color-border)"
          strokeWidth={1}
        />

        {/* Bars */}
        {data.map((point, i) => {
          const chartWidth = 400 - PADDING_LEFT - PADDING_RIGHT;
          const barWidth = chartWidth / data.length;
          const barGap = Math.max(barWidth * 0.2, 1);
          const chartHeight = height - PADDING_TOP - PADDING_BOTTOM;
          const barHeight = (point.value / maxValue) * chartHeight;
          const x = PADDING_LEFT + i * barWidth + barGap / 2;
          const y = height - PADDING_BOTTOM - barHeight;

          return (
            <rect
              key={point.label}
              x={x}
              y={y}
              width={Math.max(barWidth - barGap, 1)}
              height={barHeight}
              fill={barColor}
              opacity={0.8}
              rx={2}
            />
          );
        })}

        {/* X-axis labels — show first, last, and middle if >2 */}
        {data.length > 0 && (
          <>
            <text
              x={PADDING_LEFT}
              y={height - 4}
              textAnchor="start"
              className="trend-chart__label"
            >
              {data[0].label}
            </text>
            {data.length > 1 && (
              <text
                x={400 - PADDING_RIGHT}
                y={height - 4}
                textAnchor="end"
                className="trend-chart__label"
              >
                {data[data.length - 1].label}
              </text>
            )}
          </>
        )}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect
              x={tooltip.x - 40}
              y={tooltip.y - 4}
              width={80}
              height={20}
              fill="var(--color-bg-tertiary)"
              stroke="var(--color-border)"
              rx={4}
            />
            <text
              x={tooltip.x}
              y={tooltip.y + 10}
              textAnchor="middle"
              className="trend-chart__tooltip-text"
            >
              {tooltip.label}: {tooltip.value}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
