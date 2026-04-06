import React from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { VerdictBanner } from '../components/VerdictBanner.js';
import { SeveritySummary } from '../components/SeveritySummary.js';
import { DiffViewer } from '../components/DiffViewer.js';
import { IssueCard } from '../components/IssueCard.js';
import {
  aggregateIssues,
  computeSeverityCounts,
  issuesToMarkers,
  formatDuration,
  formatDate,
} from '../utils/review-helpers.js';
import type {
  Severity,
  ReviewEntry,
  DiffIssueMarker,
} from '../utils/review-helpers.js';

// ============================================================================
// Types
// ============================================================================

interface Discussion {
  discussionId: string;
  filePath: string;
  lineRange: [number, number];
  finalSeverity: string;
  reasoning: string;
  consensusReached: boolean;
  rounds: number;
}

interface SessionDetail {
  metadata: {
    sessionId: string;
    date: string;
    timestamp: number;
    diffPath: string;
    status: 'in_progress' | 'completed' | 'failed' | 'interrupted';
    startedAt: number;
    completedAt?: number;
  };
  reviews: ReviewEntry[];
  discussions: Discussion[];
  verdict: {
    decision: 'ACCEPT' | 'REJECT' | 'NEEDS_HUMAN';
    reasoning: string;
    questionsForHuman?: string[];
  } | null;
  diff?: string;
}

// ============================================================================
// Status class map
// ============================================================================

const statusClassMap: Record<string, string> = {
  completed: 'review-status--completed',
  in_progress: 'review-status--in-progress',
  failed: 'review-status--failed',
};

// ============================================================================
// Component
// ============================================================================

export function ReviewDetail(): React.JSX.Element {
  const { date, id } = useParams<{ date: string; id: string }>();

  const isValidParams = date && id && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d+$/.test(id);

  const { data: session, loading, error } = useApi<SessionDetail>(
    isValidParams ? `/api/sessions/${date}/${id}` : '',
  );

  if (!isValidParams) {
    return (
      <div className="page">
        <h2>Error</h2>
        <p>Invalid session identifier</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <p>Loading session...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="page">
        <h2>Error</h2>
        <p>{error ?? 'Session not found'}</p>
      </div>
    );
  }

  const issues = aggregateIssues(session.reviews);
  const severityCounts = computeSeverityCounts(issues);
  const diffMarkers = issuesToMarkers(issues);

  return (
    <div className="page review-detail">
      {/* Session Metadata Header */}
      <div className="review-detail__header">
        <h2>Review: {session.metadata.sessionId}</h2>
        <div className="review-detail__meta">
          <span className="review-detail__meta-item">
            Date: {session.metadata.date}
          </span>
          <span className="review-detail__meta-item">
            Started: {formatDate(session.metadata.startedAt)}
          </span>
          <span className="review-detail__meta-item">
            Duration: {formatDuration(session.metadata.startedAt, session.metadata.completedAt)}
          </span>
          <span className={`review-detail__meta-item review-status ${statusClassMap[session.metadata.status] ?? ''}`}>
            {session.metadata.status}
          </span>
        </div>
      </div>

      {/* Verdict Banner */}
      {session.verdict && (
        <VerdictBanner
          decision={session.verdict.decision}
          reasoning={session.verdict.reasoning}
          questionsForHuman={session.verdict.questionsForHuman}
        />
      )}

      {/* Severity Summary */}
      <section className="review-detail__section">
        <h3>Issue Summary</h3>
        <SeveritySummary counts={severityCounts} />
      </section>

      {/* Diff Viewer */}
      {session.diff && (
        <section className="review-detail__section">
          <h3>Annotated Diff</h3>
          <DiffViewer diffText={session.diff} issues={diffMarkers} />
        </section>
      )}

      {/* Issues List */}
      <section className="review-detail__section">
        <h3>Issues ({issues.length})</h3>
        {issues.length === 0 ? (
          <p className="review-detail__empty">No issues found.</p>
        ) : (
          <div className="review-detail__issues">
            {issues.map((issue, idx) => (
              <IssueCard
                key={`${issue.filePath}-${issue.lineRange[0]}-${idx}`}
                issueTitle={issue.issueTitle}
                problem={issue.problem}
                evidence={issue.evidence}
                severity={issue.severity}
                suggestion={issue.suggestion}
                filePath={issue.filePath}
                lineRange={issue.lineRange}
                confidence={issue.confidence}
                reviewers={issue.reviewers}
              />
            ))}
          </div>
        )}
      </section>

      {/* Discussions */}
      {session.discussions.length > 0 && (
        <section className="review-detail__section">
          <h3>Discussions ({session.discussions.length})</h3>
          <div className="review-detail__discussions">
            {session.discussions.map((disc) => (
              <div key={disc.discussionId} className="discussion-card">
                <div className="discussion-card__header">
                  <span className="discussion-card__file">
                    {disc.filePath ? `${disc.filePath}:${disc.lineRange?.[0]}-${disc.lineRange?.[1]}` : disc.discussionId}
                  </span>
                  <span className="discussion-card__rounds">{disc.rounds} rounds</span>
                  <span className={`discussion-card__consensus ${disc.consensusReached ? 'discussion-card__consensus--reached' : ''}`}>
                    {disc.consensusReached ? 'Consensus' : 'No consensus'}
                  </span>
                </div>
                <p className="discussion-card__reasoning">{disc.reasoning}</p>
                <span className="discussion-card__severity">Final: {disc.finalSeverity}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
