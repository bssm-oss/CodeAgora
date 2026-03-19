/**
 * DiscussionList — Summary list of all discussions in a session.
 * Shows verdict info with filtering by severity and consensus status.
 */

import React, { useState, useMemo, useCallback } from 'react';
import type { DiscussionVerdict, DiscussionSeverity } from '../utils/discussion-helpers.js';
import {
  discussionSeverityClassMap,
  discussionSeverityLabelMap,
} from '../utils/discussion-helpers.js';

interface DiscussionListProps {
  discussions: readonly DiscussionVerdict[];
  selectedId: string | null;
  onSelect: (discussionId: string) => void;
}

type SeverityFilter = DiscussionSeverity | 'all';
type ConsensusFilter = 'all' | 'reached' | 'not-reached';

export function DiscussionList({
  discussions,
  selectedId,
  onSelect,
}: DiscussionListProps): React.JSX.Element {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [consensusFilter, setConsensusFilter] = useState<ConsensusFilter>('all');

  const filtered = useMemo(() => {
    let result = [...discussions];

    if (severityFilter !== 'all') {
      result = result.filter((d) => d.finalSeverity === severityFilter);
    }

    if (consensusFilter === 'reached') {
      result = result.filter((d) => d.consensusReached);
    } else if (consensusFilter === 'not-reached') {
      result = result.filter((d) => !d.consensusReached);
    }

    return result;
  }, [discussions, severityFilter, consensusFilter]);

  const handleSeverityChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSeverityFilter(e.target.value as SeverityFilter);
    },
    [],
  );

  const handleConsensusChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setConsensusFilter(e.target.value as ConsensusFilter);
    },
    [],
  );

  return (
    <div className="disc-list">
      <div className="disc-list__filters">
        <select
          className="filter-select"
          value={severityFilter}
          onChange={handleSeverityChange}
          aria-label="Filter by severity"
        >
          <option value="all">All Severities</option>
          <option value="HARSHLY_CRITICAL">Harshly Critical</option>
          <option value="CRITICAL">Critical</option>
          <option value="WARNING">Warning</option>
          <option value="SUGGESTION">Suggestion</option>
          <option value="DISMISSED">Dismissed</option>
        </select>

        <select
          className="filter-select"
          value={consensusFilter}
          onChange={handleConsensusChange}
          aria-label="Filter by consensus"
        >
          <option value="all">All Consensus</option>
          <option value="reached">Consensus Reached</option>
          <option value="not-reached">No Consensus</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="disc-list__empty">No discussions match the current filters.</p>
      ) : (
        <div className="disc-list__items">
          {filtered.map((d) => {
            const isSelected = d.discussionId === selectedId;
            const rowClass = [
              'disc-list__row',
              isSelected ? 'disc-list__row--selected' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={d.discussionId}
                className={rowClass}
                onClick={() => onSelect(d.discussionId)}
                type="button"
              >
                <span className="disc-list__id">{d.discussionId}</span>
                <span className="disc-list__file">{d.filePath}</span>
                <span className="disc-list__line">
                  L{d.lineRange[0]}-{d.lineRange[1]}
                </span>
                <span
                  className={`disc-severity ${discussionSeverityClassMap[d.finalSeverity]}`}
                >
                  {discussionSeverityLabelMap[d.finalSeverity]}
                </span>
                <span className="disc-list__rounds">{d.rounds} round{d.rounds !== 1 ? 's' : ''}</span>
                <span
                  className={`disc-list__consensus ${
                    d.consensusReached
                      ? 'disc-list__consensus--reached'
                      : 'disc-list__consensus--not-reached'
                  }`}
                >
                  {d.consensusReached ? 'Consensus' : 'No Consensus'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
