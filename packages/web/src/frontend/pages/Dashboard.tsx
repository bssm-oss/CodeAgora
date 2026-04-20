/**
 * Dashboard — Landing page for the CodeAgora web dashboard.
 * Aggregates data from sessions, costs, and health endpoints to show
 * a high-level overview of review pipeline activity.
 */

import React, { useMemo } from 'react';
import { useApi } from '../hooks/useApi.js';
import { StatCards } from '../components/StatCards.js';
import { RecentActivity } from '../components/RecentActivity.js';
import { QuickActions } from '../components/QuickActions.js';
import { WeeklyTrend } from '../components/WeeklyTrend.js';
import { OnboardingCard } from '../components/OnboardingCard.js';

interface SessionMetadata {
  sessionId: string;
  date: string;
  timestamp: number;
  diffPath: string;
  status: 'in_progress' | 'completed' | 'failed' | 'interrupted';
  startedAt: number;
  completedAt?: number;
}

interface PaginatedSessions {
  items: SessionMetadata[];
  total: number;
  page: number;
  limit: number;
}

interface CostsApiResponse {
  totalCost: number;
  sessionCount: number;
  sessions: unknown[];
}

interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function Dashboard(): React.JSX.Element {
  const { data: sessionsResponse, loading: sessionsLoading, error: sessionsError, refetch: refetchSessions } =
    useApi<PaginatedSessions>('/api/sessions?limit=200');
  const { data: costs, loading: costsLoading } =
    useApi<CostsApiResponse>('/api/costs');
  const { data: health } =
    useApi<HealthResponse>('/api/health');

  const sessionList = useMemo(() => sessionsResponse?.items ?? [], [sessionsResponse]);

  const costSummary = useMemo(() => {
    if (!costs) return null;
    return { totalCost: costs.totalCost, sessionCount: costs.sessionCount };
  }, [costs]);

  const isLoading = sessionsLoading || costsLoading;

  if (isLoading) {
    return (
      <div className="page">
        <h2>Dashboard</h2>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (sessionsError) {
    return (
      <div className="page">
        <h2>Dashboard</h2>
        <p className="error-text">Error: {sessionsError}</p>
        <button onClick={refetchSessions} type="button" className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Dashboard</h2>
        {health && (
          <span className="page-header__count">
            v{health.version} &middot; up {formatUptime(health.uptime)}
          </span>
        )}
      </div>

      {sessionList.length === 0 ? (
        <OnboardingCard />
      ) : (
        <>
          <StatCards sessions={sessionList} costs={costSummary} />
          <div className="dashboard-grid">
            <div className="dashboard-grid__main">
              <WeeklyTrend sessions={sessionList} />
              <RecentActivity sessions={sessionList} limit={10} />
            </div>
            <div className="dashboard-grid__side">
              <QuickActions />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
