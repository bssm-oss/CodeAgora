/**
 * EventLog — Scrollable live event feed with color-coded entries.
 */

import React, { useEffect, useRef } from 'react';
import type { PipelineEventEntry, ProgressEvent, DiscussionEvent } from '../hooks/usePipelineEvents.js';

interface EventLogProps {
  events: PipelineEventEntry[];
}

const EVENT_TYPE_ICONS: Record<string, string> = {
  'stage-start': '\u25B6',
  'stage-update': '\u2022',
  'stage-complete': '\u2713',
  'stage-error': '\u2717',
  'pipeline-complete': '\u2605',
  'discussion-start': '\u25B6',
  'round-start': '\u21BB',
  'supporter-response': '\u2022',
  'consensus-check': '\u2714',
  'discussion-end': '\u2713',
  'forced-decision': '\u26A0',
  'objection': '\u2717',
};

function getEventTypeClass(entry: PipelineEventEntry): string {
  if (entry.source === 'progress') {
    const evt = entry.event as ProgressEvent;
    switch (evt.event) {
      case 'stage-start': return 'event-item--start';
      case 'stage-update': return 'event-item--update';
      case 'stage-complete': return 'event-item--complete';
      case 'stage-error': return 'event-item--error';
      case 'pipeline-complete': return 'event-item--complete';
      default: return '';
    }
  }
  const evt = entry.event as DiscussionEvent;
  switch (evt.type) {
    case 'discussion-start': return 'event-item--start';
    case 'discussion-end': return 'event-item--complete';
    case 'forced-decision': return 'event-item--error';
    case 'objection': return 'event-item--error';
    default: return 'event-item--update';
  }
}

function getEventIcon(entry: PipelineEventEntry): string {
  if (entry.source === 'progress') {
    const evt = entry.event as ProgressEvent;
    return EVENT_TYPE_ICONS[evt.event] ?? '\u2022';
  }
  const evt = entry.event as DiscussionEvent;
  return EVENT_TYPE_ICONS[evt.type] ?? '\u2022';
}

function getEventMessage(entry: PipelineEventEntry): string {
  if (entry.source === 'progress') {
    const evt = entry.event as ProgressEvent;
    return `[${evt.stage}] ${evt.message}`;
  }
  const evt = entry.event as DiscussionEvent;
  switch (evt.type) {
    case 'discussion-start':
      return `Discussion started: ${evt.issueTitle} (${evt.filePath})`;
    case 'round-start':
      return `Round ${evt.roundNum} started (${evt.discussionId})`;
    case 'supporter-response':
      return `${evt.supporterId}: ${evt.stance} (round ${evt.roundNum})`;
    case 'consensus-check':
      return `Consensus ${evt.reached ? 'reached' : 'not reached'} (round ${evt.roundNum})`;
    case 'discussion-end':
      return `Discussion ended: ${evt.finalSeverity} (${evt.consensusReached ? 'consensus' : 'no consensus'})`;
    case 'forced-decision':
      return `Forced decision: ${evt.severity} — ${evt.reasoning}`;
    case 'objection':
      return `Objection by ${evt.supporterId}: ${evt.reasoning}`;
    default:
      return 'Unknown event';
  }
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function EventLog({ events }: EventLogProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="event-log">
        <h3>Event Log</h3>
        <p className="event-log-empty">No events yet</p>
      </div>
    );
  }

  // Display latest first
  const reversed = [...events].reverse();

  return (
    <div className="event-log">
      <h3>Event Log</h3>
      <div className="event-log-list" ref={containerRef}>
        {reversed.map((entry) => (
          <div key={entry.id} className={`event-item ${getEventTypeClass(entry)}`}>
            <span className="event-time">{formatTimestamp(entry.timestamp)}</span>
            <span className="event-icon">{getEventIcon(entry)}</span>
            <span className="event-message">{getEventMessage(entry)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
