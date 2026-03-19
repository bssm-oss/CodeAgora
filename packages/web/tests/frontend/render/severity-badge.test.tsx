import React from 'react';
import { render, screen } from '@testing-library/react';
import { SeverityBadge } from '../../../src/frontend/components/SeverityBadge.js';

describe('SeverityBadge', () => {
  it('renders correct label for HARSHLY_CRITICAL', () => {
    render(<SeverityBadge severity="HARSHLY_CRITICAL" />);
    expect(screen.getByText('Harshly Critical')).toBeInTheDocument();
  });

  it('renders correct label for CRITICAL', () => {
    render(<SeverityBadge severity="CRITICAL" />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('renders correct label for WARNING', () => {
    render(<SeverityBadge severity="WARNING" />);
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('renders correct label for SUGGESTION', () => {
    render(<SeverityBadge severity="SUGGESTION" />);
    expect(screen.getByText('Suggestion')).toBeInTheDocument();
  });

  it('applies the correct CSS class per severity', () => {
    const { rerender } = render(<SeverityBadge severity="CRITICAL" />);
    expect(screen.getByText('Critical')).toHaveClass('severity-badge--critical');

    rerender(<SeverityBadge severity="WARNING" />);
    expect(screen.getByText('Warning')).toHaveClass('severity-badge--warning');

    rerender(<SeverityBadge severity="SUGGESTION" />);
    expect(screen.getByText('Suggestion')).toHaveClass('severity-badge--suggestion');

    rerender(<SeverityBadge severity="HARSHLY_CRITICAL" />);
    expect(screen.getByText('Harshly Critical')).toHaveClass('severity-badge--harshly-critical');
  });

  it('applies large variant class when variant is large', () => {
    render(<SeverityBadge severity="CRITICAL" variant="large" />);
    expect(screen.getByText('Critical')).toHaveClass('severity-badge--large');
  });

  it('does not apply large variant class by default', () => {
    render(<SeverityBadge severity="WARNING" />);
    expect(screen.getByText('Warning')).not.toHaveClass('severity-badge--large');
  });
});
