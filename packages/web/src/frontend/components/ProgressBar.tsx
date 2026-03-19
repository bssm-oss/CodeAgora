/**
 * ProgressBar — Animated horizontal progress bar with percentage display.
 */

import React from 'react';

export type ProgressBarVariant = 'active' | 'complete' | 'error';

interface ProgressBarProps {
  progress: number;
  variant?: ProgressBarVariant;
  showLabel?: boolean;
}

const VARIANT_CLASSES: Record<ProgressBarVariant, string> = {
  active: 'progress-bar-fill--active',
  complete: 'progress-bar-fill--complete',
  error: 'progress-bar-fill--error',
};

export function ProgressBar({
  progress,
  variant = 'active',
  showLabel = true,
}: ProgressBarProps): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, progress));
  const fillClass = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.active;

  return (
    <div className="progress-bar">
      <div className="progress-bar-track">
        <div
          className={`progress-bar-fill ${fillClass}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="progress-bar-label">{Math.round(clamped)}%</span>
      )}
    </div>
  );
}
