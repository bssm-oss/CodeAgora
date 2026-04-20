import React from 'react';

// ============================================================================
// Types
// ============================================================================

interface Props {
  reviewerId: string;
  status: 'running' | 'done' | 'failed';
  issueCount: number;
  elapsed: number;
}

// ============================================================================
// Helpers
// ============================================================================

function statusIcon(status: Props['status']): string {
  switch (status) {
    case 'running': return '⟳';
    case 'done':    return '✓';
    case 'failed':  return '✗';
  }
}

// ============================================================================
// Component
// ============================================================================

export function ReviewerCard({ reviewerId, status, issueCount, elapsed }: Props): React.JSX.Element {
  return (
    <div className={`reviewer-card reviewer-card--${status}`}>
      <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '13px' }}>{reviewerId}</div>
      <div style={{ fontSize: '12px' }}>
        <span>{statusIcon(status)}</span>
        {status === 'running' ? (
          <span style={{ marginLeft: '4px', color: 'var(--color-text-secondary)' }}>running…</span>
        ) : (
          <span style={{ marginLeft: '4px' }}>
            {issueCount} issue{issueCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {status !== 'running' && elapsed > 0 && (
        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
          {elapsed.toFixed(1)}s
        </div>
      )}
    </div>
  );
}
