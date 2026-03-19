/**
 * Discussions — Discussion/debate viewer page.
 * Session selector, discussion list with filters, and detailed debate view.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useApi } from '../hooks/useApi.js';
import { DiscussionList } from '../components/DiscussionList.js';
import { DebateTimeline } from '../components/DebateTimeline.js';
import { StanceVisualization } from '../components/StanceVisualization.js';
import { ConsensusProgress } from '../components/ConsensusProgress.js';
import { summarizeDiscussion } from '../utils/discussion-helpers.js';
import type {
  DiscussionVerdict,
  DiscussionRound,
} from '../utils/discussion-helpers.js';

// ============================================================================
// Types
// ============================================================================

interface SessionData {
  metadata: {
    sessionId: string;
    date: string;
  };
  discussions: DiscussionVerdict[];
  rounds: Record<string, DiscussionRound[]>;
}

// ============================================================================
// Component
// ============================================================================

export function Discussions(): React.JSX.Element {
  const [dateInput, setDateInput] = useState('');
  const [idInput, setIdInput] = useState('');
  const [sessionPath, setSessionPath] = useState<string | null>(null);
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string | null>(null);

  const { data: session, loading, error, refetch } = useApi<SessionData>(
    sessionPath ?? '',
  );

  const handleLoad = useCallback(() => {
    if (dateInput.trim() && idInput.trim()) {
      setSessionPath(`/api/sessions/${dateInput.trim()}/${idInput.trim()}`);
      setSelectedDiscussionId(null);
    }
  }, [dateInput, idInput]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleLoad();
      }
    },
    [handleLoad],
  );

  const handleSelectDiscussion = useCallback((discussionId: string) => {
    setSelectedDiscussionId((prev) =>
      prev === discussionId ? null : discussionId,
    );
  }, []);

  const selectedVerdict = useMemo(() => {
    if (!session || !selectedDiscussionId) return null;
    return (
      session.discussions.find(
        (d) => d.discussionId === selectedDiscussionId,
      ) ?? null
    );
  }, [session, selectedDiscussionId]);

  const selectedRounds = useMemo(() => {
    if (!session || !selectedDiscussionId) return [];
    return session.rounds[selectedDiscussionId] ?? [];
  }, [session, selectedDiscussionId]);

  const summary = useMemo(() => {
    if (!selectedVerdict) return null;
    return summarizeDiscussion(selectedVerdict, selectedRounds);
  }, [selectedVerdict, selectedRounds]);

  // No session path set yet — show the selector
  if (!sessionPath) {
    return (
      <div className="page">
        <h2>Discussions</h2>
        <p>Enter a session date and ID to view discussions and debates.</p>

        <div className="disc-selector">
          <input
            className="filter-input"
            type="text"
            placeholder="Date (e.g. 2024-01-15)"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Session date"
          />
          <input
            className="filter-input"
            type="text"
            placeholder="Session ID"
            value={idInput}
            onChange={(e) => setIdInput(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Session ID"
          />
          <button
            className="disc-selector__load"
            onClick={handleLoad}
            type="button"
            disabled={!dateInput.trim() || !idInput.trim()}
          >
            Load Session
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <h2>Discussions</h2>
        <p>Loading session...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h2>Discussions</h2>
        <p className="error-text">Error: {error}</p>
        <div className="disc-selector">
          <button
            onClick={() => setSessionPath(null)}
            type="button"
            className="retry-button"
          >
            Change Session
          </button>
          <button onClick={refetch} type="button" className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="page">
        <h2>Discussions</h2>
        <p>Session not found.</p>
      </div>
    );
  }

  const discussions = session.discussions ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <h2>Discussions</h2>
        <span className="page-header__count">
          {discussions.length} discussion{discussions.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setSessionPath(null)}
          type="button"
          className="disc-change-session"
        >
          Change Session
        </button>
      </div>

      <p className="disc-session-info">
        Session: {session.metadata.sessionId} ({session.metadata.date})
      </p>

      {discussions.length === 0 ? (
        <p className="disc-empty">No discussions found in this session.</p>
      ) : (
        <div className="disc-layout">
          <div className="disc-layout__list">
            <DiscussionList
              discussions={discussions}
              selectedId={selectedDiscussionId}
              onSelect={handleSelectDiscussion}
            />
          </div>

          {selectedVerdict && (
            <div className="disc-layout__detail">
              {summary && (
                <div className="disc-summary">
                  <span className="disc-summary__item">
                    {summary.totalRounds} round{summary.totalRounds !== 1 ? 's' : ''}
                  </span>
                  <span className="disc-summary__item">
                    {summary.totalSupporters} supporter{summary.totalSupporters !== 1 ? 's' : ''}
                  </span>
                  <span className="disc-summary__item">
                    {summary.finalConsensusPercentage}% final agreement
                  </span>
                  {summary.hasDevilsAdvocate && (
                    <span className="disc-summary__item disc-summary__item--da">
                      Devil&apos;s Advocate present
                    </span>
                  )}
                </div>
              )}

              <StanceVisualization rounds={selectedRounds} />
              <ConsensusProgress
                rounds={selectedRounds}
                consensusReached={selectedVerdict.consensusReached}
              />
              <DebateTimeline
                verdict={selectedVerdict}
                rounds={selectedRounds}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
