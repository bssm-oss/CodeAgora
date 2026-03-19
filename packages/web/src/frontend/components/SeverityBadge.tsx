import React from 'react';
import { severityClassMap, severityLabelMap } from '../utils/review-helpers.js';
import type { Severity } from '../utils/review-helpers.js';

interface SeverityBadgeProps {
  severity: Severity;
  variant?: 'small' | 'large';
}

export function SeverityBadge({ severity, variant = 'small' }: SeverityBadgeProps): React.JSX.Element {
  const className = [
    'severity-badge',
    severityClassMap[severity],
    variant === 'large' ? 'severity-badge--large' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={className}>{severityLabelMap[severity]}</span>;
}

export type { Severity };
