import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Toast } from '../../../src/frontend/components/Toast.js';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders success toast with correct class', () => {
    const { container } = render(
      <Toast message="Saved!" type="success" onDismiss={vi.fn()} />,
    );

    const toast = container.querySelector('.toast');
    expect(toast).toHaveClass('toast--success');
  });

  it('renders error toast with correct class', () => {
    const { container } = render(
      <Toast message="Something went wrong." type="error" onDismiss={vi.fn()} />,
    );

    const toast = container.querySelector('.toast');
    expect(toast).toHaveClass('toast--error');
  });

  it('shows message text', () => {
    render(<Toast message="Operation successful!" type="success" onDismiss={vi.fn()} />);

    expect(screen.getByText('Operation successful!')).toBeInTheDocument();
  });

  it('has alert role for accessibility', () => {
    render(<Toast message="Alert!" type="error" onDismiss={vi.fn()} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('calls onDismiss after 5 seconds', () => {
    const onDismiss = vi.fn();
    render(<Toast message="Auto dismiss" type="success" onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when close button is clicked', () => {
    const onDismiss = vi.fn();
    render(<Toast message="Click to dismiss" type="error" onDismiss={onDismiss} />);

    screen.getByRole('button', { name: /dismiss/i }).click();
    expect(onDismiss).toHaveBeenCalled();
  });
});
