import React from 'react';
import type { Severity } from '../utils/review-helpers.js';

interface SeveritySummaryProps {
  counts: Record<Severity, number>;
}

const severityOrder: Severity[] = ['HARSHLY_CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION'];

const severitySegmentClass: Record<Severity, string> = {
  HARSHLY_CRITICAL: 'severity-summary__segment--harshly-critical',
  CRITICAL: 'severity-summary__segment--critical',
  WARNING: 'severity-summary__segment--warning',
  SUGGESTION: 'severity-summary__segment--suggestion',
};

const severitySegmentLabel: Record<Severity, string> = {
  HARSHLY_CRITICAL: 'Harshly Critical',
  CRITICAL: 'Critical',
  WARNING: 'Warning',
  SUGGESTION: 'Suggestion',
};

export function SeveritySummary({ counts }: SeveritySummaryProps): React.JSX.Element {
  const total = severityOrder.reduce((sum, s) => sum + counts[s], 0);

  return (
    <div className="severity-summary">
      <div className="severity-summary__bar">
        {severityOrder.map((severity) => {
          const count = counts[severity];
          if (count === 0) return null;
          const widthPercent = total > 0 ? (count / total) * 100 : 0;
          return (
            <div
              key={severity}
              className={`severity-summary__segment ${severitySegmentClass[severity]}`}
              style={{ width: `${widthPercent}%` }}
              title={`${severitySegmentLabel[severity]}: ${count}`}
            >
              {count}
            </div>
          );
        })}
      </div>
      <div className="severity-summary__legend">
        {severityOrder.map((severity) => (
          <span key={severity} className="severity-summary__legend-item">
            <span className={`severity-summary__legend-dot ${severitySegmentClass[severity]}`} />
            {severitySegmentLabel[severity]}: {counts[severity]}
          </span>
        ))}
      </div>
    </div>
  );
}
