import React from 'react';
import { render, screen } from '@testing-library/react';
import { TrendChart } from '../../../src/frontend/components/TrendChart.js';
import type { TrendDataPoint } from '../../../src/frontend/components/TrendChart.js';

const SAMPLE_DATA: TrendDataPoint[] = [
  { label: 'Jan', value: 10 },
  { label: 'Feb', value: 25 },
  { label: 'Mar', value: 15 },
];

describe('TrendChart', () => {
  it('renders SVG element when data is provided', () => {
    render(<TrendChart data={SAMPLE_DATA} title="Reviews per Month" />);
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('renders bars for each data point', () => {
    render(<TrendChart data={SAMPLE_DATA} title="Reviews per Month" />);
    const bars = document.querySelectorAll('rect');
    // 3 bars for 3 data points (may include tooltip rect, but at least 3)
    expect(bars.length).toBeGreaterThanOrEqual(3);
  });

  it('handles empty data gracefully', () => {
    render(<TrendChart data={[]} title="Reviews per Month" />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
    expect(document.querySelector('svg')).not.toBeInTheDocument();
  });

  it('renders the chart title', () => {
    render(<TrendChart data={SAMPLE_DATA} title="Reviews per Month" />);
    expect(screen.getByText('Reviews per Month')).toBeInTheDocument();
  });

  it('renders axis labels for first and last data points', () => {
    render(<TrendChart data={SAMPLE_DATA} title="Reviews per Month" />);
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Mar')).toBeInTheDocument();
  });

  it('renders y-axis max value label', () => {
    render(<TrendChart data={SAMPLE_DATA} title="Reviews per Month" />);
    // maxValue is 25
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
