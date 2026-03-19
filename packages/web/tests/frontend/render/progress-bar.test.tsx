import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../../../src/frontend/components/ProgressBar.js';

describe('ProgressBar', () => {
  it('renders the percentage label by default', () => {
    render(<ProgressBar progress={60} />);
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('sets fill width to match progress percentage', () => {
    const { container } = render(<ProgressBar progress={75} />);
    const fill = container.querySelector('.progress-bar-fill');
    expect(fill).toHaveStyle({ width: '75%' });
  });

  it('applies active variant class by default', () => {
    const { container } = render(<ProgressBar progress={40} />);
    expect(container.querySelector('.progress-bar-fill')).toHaveClass('progress-bar-fill--active');
  });

  it('applies complete variant class', () => {
    const { container } = render(<ProgressBar progress={100} variant="complete" />);
    expect(container.querySelector('.progress-bar-fill')).toHaveClass('progress-bar-fill--complete');
  });

  it('applies error variant class', () => {
    const { container } = render(<ProgressBar progress={30} variant="error" />);
    expect(container.querySelector('.progress-bar-fill')).toHaveClass('progress-bar-fill--error');
  });

  it('hides the label when showLabel is false', () => {
    render(<ProgressBar progress={50} showLabel={false} />);
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });

  it('clamps progress above 100 to 100', () => {
    render(<ProgressBar progress={150} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('clamps progress below 0 to 0', () => {
    render(<ProgressBar progress={-10} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
