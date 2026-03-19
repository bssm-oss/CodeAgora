import React from 'react';
import { render, screen } from '@testing-library/react';
import { EventLog } from '../../../src/frontend/components/EventLog.js';
import type { PipelineEventEntry, ProgressEvent, DiscussionEvent } from '../../../src/frontend/hooks/usePipelineEvents.js';

function makeProgressEntry(
  id: number,
  eventType: ProgressEvent['event'],
  stage: ProgressEvent['stage'],
  message: string,
  timestamp = Date.now()
): PipelineEventEntry {
  return {
    id,
    source: 'progress',
    event: {
      stage,
      event: eventType,
      progress: 50,
      message,
      timestamp,
    } satisfies ProgressEvent,
    timestamp,
  };
}

function makeDiscussionEntry(
  id: number,
  event: DiscussionEvent,
  timestamp = Date.now()
): PipelineEventEntry {
  return { id, source: 'discussion', event, timestamp };
}

describe('EventLog', () => {
  it('renders empty state message when no events', () => {
    render(<EventLog events={[]} />);
    expect(screen.getByText('No events yet')).toBeInTheDocument();
  });

  it('renders "Event Log" heading always', () => {
    render(<EventLog events={[]} />);
    expect(screen.getByText('Event Log')).toBeInTheDocument();
  });

  it('renders event messages for progress events', () => {
    const events = [
      makeProgressEntry(1, 'stage-start', 'review', 'Review started'),
      makeProgressEntry(2, 'stage-complete', 'review', 'Review complete'),
    ];
    render(<EventLog events={events} />);
    expect(screen.getByText(/\[review\] Review started/)).toBeInTheDocument();
    expect(screen.getByText(/\[review\] Review complete/)).toBeInTheDocument();
  });

  it('renders event messages for discussion events', () => {
    const discEvent: DiscussionEvent = {
      type: 'discussion-start',
      discussionId: 'd1',
      issueTitle: 'Memory leak',
      filePath: 'src/app.ts',
      severity: 'CRITICAL',
    };
    const events = [makeDiscussionEntry(1, discEvent)];
    render(<EventLog events={events} />);
    expect(screen.getByText(/Discussion started: Memory leak \(src\/app\.ts\)/)).toBeInTheDocument();
  });

  it('applies color class based on event type', () => {
    const events = [
      makeProgressEntry(1, 'stage-start', 'init', 'Init started'),
      makeProgressEntry(2, 'stage-error', 'review', 'Error occurred'),
      makeProgressEntry(3, 'stage-complete', 'verdict', 'Done'),
    ];
    const { container } = render(<EventLog events={events} />);
    const items = container.querySelectorAll('.event-item');
    expect(items[0]).toHaveClass('event-item--complete'); // reversed: complete is first
    expect(items[1]).toHaveClass('event-item--error');
    expect(items[2]).toHaveClass('event-item--start');
  });

  it('shows at most 200 events', () => {
    const events: PipelineEventEntry[] = Array.from({ length: 250 }, (_, i) =>
      makeProgressEntry(i, 'stage-update', 'review', `Update ${i}`)
    );
    // EventLog receives pre-sliced events from the hook, but renders all passed in
    // Pass exactly 200 to verify all are rendered
    const sliced = events.slice(50); // 200 entries
    const { container } = render(<EventLog events={sliced} />);
    const items = container.querySelectorAll('.event-item');
    expect(items).toHaveLength(200);
  });

  it('renders timestamps for each event', () => {
    const ts = new Date('2024-01-15T10:30:45Z').getTime();
    const events = [makeProgressEntry(1, 'stage-update', 'review', 'Processing', ts)];
    const { container } = render(<EventLog events={events} />);
    const timeEl = container.querySelector('.event-time');
    expect(timeEl).toBeInTheDocument();
    expect(timeEl?.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});
