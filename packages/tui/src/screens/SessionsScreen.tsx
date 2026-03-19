import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { listSessions, showSession, getSessionStats } from '@codeagora/cli/commands/sessions.js';
import type { SessionEntry, SessionDetail, SessionStats } from '@codeagora/cli/commands/sessions.js';
import { Panel } from '../components/Panel.js';
import { ScrollableList } from '../components/ScrollableList.js';
import { DetailRow } from '../components/DetailRow.js';
import {
  colors,
  icons,
  decisionColor,
  getTerminalSize,
  LIST_WIDTH_RATIO,
  DETAIL_WIDTH_RATIO,
  MIN_COLS,
} from '../theme.js';

// ============================================================================
// Types
// ============================================================================

type ViewMode = 'list' | 'detail';
type StatusFilter = 'all' | 'completed' | 'failed' | 'in_progress';
type SortMode = 'date' | 'issues';

// ============================================================================
// Helpers
// ============================================================================

/** Map session status to a decision-style label for display. */
function statusToDecision(status: string): string {
  switch (status) {
    case 'completed': return 'ACCEPT';
    case 'failed':    return 'REJECT';
    default:          return status.toUpperCase();
  }
}

/** Pick a color for the status/decision label. */
function entryDecisionColor(status: string): string {
  switch (status) {
    case 'completed': return colors.success;
    case 'failed':    return colors.error;
    case 'in_progress': return colors.warning;
    default:          return 'white';
  }
}

// ============================================================================
// Component
// ============================================================================

export function SessionsScreen(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [stats, setStats] = useState<SessionStats | null>(null);

  function fetchSessions(status: StatusFilter, sort: SortMode): void {
    setLoading(true);
    const opts = {
      limit: 20,
      status: status === 'all' ? undefined : status,
      sort,
    };
    Promise.all([
      listSessions(process.cwd(), opts),
      getSessionStats(process.cwd()),
    ])
      .then(([entries, sessionStats]) => {
        setSessions(entries);
        setStats(sessionStats);
        setSelectedIndex(0);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchSessions(statusFilter, sortMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sortMode]);

  useInput((input, key) => {
    if (viewMode === 'list') {
      if ((input === 'j' || key.downArrow) && sessions.length > 0) {
        setSelectedIndex(i => Math.min(i + 1, sessions.length - 1));
      } else if ((input === 'k' || key.upArrow) && sessions.length > 0) {
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (input === 'f') {
        const filters: StatusFilter[] = ['all', 'completed', 'failed', 'in_progress'];
        const currentIdx = filters.indexOf(statusFilter);
        const next = filters[(currentIdx + 1) % filters.length]!;
        setStatusFilter(next);
      } else if (input === 's') {
        setSortMode(prev => prev === 'date' ? 'issues' : 'date');
      } else if (key.return && sessions.length > 0) {
        const entry = sessions[selectedIndex];
        if (entry) {
          setDetailLoading(true);
          showSession(process.cwd(), entry.id)
            .then((d) => {
              setDetail(d);
              setDetailLoading(false);
              setViewMode('detail');
            })
            .catch((e: unknown) => {
              setError(e instanceof Error ? e.message : String(e));
              setDetailLoading(false);
            });
        }
      }
    } else {
      if (key.escape || input === 'q') {
        setViewMode('list');
        setDetail(null);
      }
    }
  });

  const { cols } = getTerminalSize();
  const effectiveCols = Math.max(cols, MIN_COLS);
  const listWidth = Math.floor(effectiveCols * LIST_WIDTH_RATIO);
  const detailWidth = Math.floor(effectiveCols * DETAIL_WIDTH_RATIO);
  const listHeight = Math.max(8, (process.stdout.rows || 24) - 8);

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={colors.primary}>Sessions</Text>
        <Text dimColor>Loading sessions...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={colors.primary}>Sessions</Text>
        <Text color={colors.error}>Error: {error}</Text>
        <Box marginTop={1}>
          <Text dimColor>q: back</Text>
        </Box>
      </Box>
    );
  }

  if (detailLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={colors.primary}>Sessions</Text>
        <Text dimColor>Loading session detail...</Text>
      </Box>
    );
  }

  // ── Detail view ───────────────────────────────────────────────────────────

  if (viewMode === 'detail' && detail) {
    const entry = detail.entry;
    const verdict = detail.verdict;
    const rawDecision = typeof verdict?.['decision'] === 'string'
      ? String(verdict['decision'])
      : statusToDecision(entry.status);
    const rawReasoning = typeof verdict?.['reasoning'] === 'string'
      ? String(verdict['reasoning'])
      : undefined;
    const issueCount = Array.isArray(verdict?.['issues'])
      ? (verdict!['issues'] as unknown[]).length
      : Array.isArray(verdict?.['findings'])
        ? (verdict!['findings'] as unknown[]).length
        : undefined;

    return (
      <Box flexDirection="column" padding={1}>
        <Box flexDirection="row" gap={1}>
          {/* Detail panel */}
          <Panel title="Session Detail" width={detailWidth}>
            <DetailRow label="ID" value={entry.id} />
            <DetailRow label="Date" value={entry.date} />
            <DetailRow
              label="Decision"
              value={rawDecision}
              color={decisionColor(rawDecision)}
              highlight
            />
            {typeof detail.metadata?.['diffPath'] === 'string' && (
              <DetailRow label="Diff" value={String(detail.metadata['diffPath'])} />
            )}
            {issueCount !== undefined && (
              <DetailRow label="Issues" value={String(issueCount)} />
            )}
            {rawReasoning !== undefined && (
              <Box marginTop={1} flexDirection="column">
                <Text dimColor bold>Reasoning</Text>
                <Text wrap="wrap">{rawReasoning}</Text>
              </Box>
            )}
          </Panel>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Escape/q: back to list</Text>
        </Box>
      </Box>
    );
  }

  // ── Filter bar ─────────────────────────────────────────────────────────────

  const filterLabels: Record<StatusFilter, string> = {
    all: 'all',
    completed: 'accept',
    failed: 'reject',
    in_progress: 'in-progress',
  };

  const filterKeys: StatusFilter[] = ['all', 'completed', 'failed', 'in_progress'];

  // ── List view ─────────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column" padding={1}>
      {/* Filter + sort bar */}
      <Box marginBottom={1}>
        <Text dimColor>Filter: </Text>
        {filterKeys.map((f, i) => (
          <React.Fragment key={f}>
            {i > 0 && <Text dimColor> | </Text>}
            <Text
              color={statusFilter === f ? colors.primary : undefined}
              bold={statusFilter === f}
            >
              {filterLabels[f]}
            </Text>
          </React.Fragment>
        ))}
        <Text dimColor>    Sort: </Text>
        <Text color={colors.primary} bold>{sortMode}</Text>
      </Box>

      {/* Master-detail layout */}
      <Box flexDirection="row" gap={1}>
        {/* Left: session list */}
        <Panel title="Sessions" width={listWidth}>
          <ScrollableList
            items={sessions}
            selectedIndex={selectedIndex}
            height={listHeight}
            emptyMessage="No sessions found. Run 'agora review' to create one."
            renderItem={(session: SessionEntry, _idx: number, isSelected: boolean) => {
              const decision = statusToDecision(session.status);
              const dColor = entryDecisionColor(session.status);
              return (
                <Box>
                  <Text color={colors.primary} bold={isSelected}>
                    {icons.enabled}{' '}
                  </Text>
                  <Text bold={isSelected}>{session.date}/{session.sessionId}</Text>
                  <Text>  </Text>
                  <Text color={dColor} bold={isSelected}>{decision}</Text>
                </Box>
              );
            }}
          />
        </Panel>

        {/* Right: session detail preview */}
        <Panel title="Detail" width={detailWidth}>
          {sessions.length === 0 ? (
            <Text dimColor>Select a session to preview</Text>
          ) : (() => {
            const sel = sessions[selectedIndex];
            if (!sel) return <Text dimColor>—</Text>;
            const decision = statusToDecision(sel.status);
            const dColor = entryDecisionColor(sel.status);
            return (
              <Box flexDirection="column">
                <DetailRow label="ID" value={sel.id} />
                <DetailRow label="Date" value={sel.date} />
                <DetailRow
                  label="Decision"
                  value={decision}
                  color={dColor}
                  highlight
                />
                <Box marginTop={1}>
                  <Text dimColor>Press Enter for full detail</Text>
                </Box>
              </Box>
            );
          })()}
        </Panel>
      </Box>

      {/* Stats footer */}
      {stats !== null && stats.totalSessions > 0 && (
        <Box marginTop={1}>
          <Text dimColor>
            {icons.bullet} {stats.totalSessions} sessions
            {'  '}
            <Text color={colors.success}>{stats.completed} accepted</Text>
            {'  '}
            <Text color={colors.error}>{stats.failed} rejected</Text>
            {'  '}
            Success rate: {stats.successRate.toFixed(1)}%
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          {sessions.length > 0 ? 'Enter: details | ' : ''}f: filter | s: sort | j/k: scroll | q: back
        </Text>
      </Box>
    </Box>
  );
}
