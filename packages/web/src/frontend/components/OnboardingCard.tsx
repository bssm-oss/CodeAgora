import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';

// ============================================================================
// Types
// ============================================================================

interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
}

// ============================================================================
// Component
// ============================================================================

export function OnboardingCard(): React.JSX.Element {
  const navigate = useNavigate();
  const { data: health } = useApi<HealthResponse>('/api/health');

  const btnBase: React.CSSProperties = {
    padding: '10px 20px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'inherit',
  };

  return (
    <div className="onboarding-card">
      <h3 style={{ marginBottom: '8px', fontSize: '20px' }}>Welcome to CodeAgora</h3>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
        Start your first code review:
      </p>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '24px' }}>
        <button
          type="button"
          style={{ ...btnBase, background: 'var(--color-accent)', color: '#0d1117', border: 'none' }}
          onClick={() => navigate('/pipeline')}
        >
          📋 Paste Diff
        </button>
        <button
          type="button"
          style={{ ...btnBase, background: 'transparent', color: 'var(--color-text)' }}
          onClick={() => navigate('/pipeline')}
        >
          🔗 PR URL
        </button>
      </div>

      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
        Or run from CLI: <code>git diff | agora review</code>
      </p>

      {health && (
        <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '16px' }}>
          Provider Status: {health.status} &middot; v{health.version}
        </p>
      )}
    </div>
  );
}
