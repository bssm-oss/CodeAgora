import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { listSessions, showSession } from '../../cli/commands/sessions.js';
import type { SessionEntry, SessionDetail } from '../../cli/commands/sessions.js';

type ViewMode = 'list' | 'detail';

function statusColor(status: string): string {
  switch (status) {
    case 'completed': return 'green';
    case 'failed': return 'red';
    case 'in_progress': return 'yellow';
    default: return 'white';
  }
}

export function SessionsScreen(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSessions(process.cwd())
      .then((entries) => {
        setSessions(entries);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, []);

  useInput((input, key) => {
    if (viewMode === 'list') {
      if ((input === 'j' || key.downArrow) && sessions.length > 0) {
        setSelectedIndex(i => Math.min(i + 1, sessions.length - 1));
      } else if ((input === 'k' || key.upArrow) && sessions.length > 0) {
        setSelectedIndex(i => Math.max(i - 1, 0));
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

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>Sessions</Text>
        <Text dimColor>Loading sessions...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>Sessions</Text>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (viewMode === 'detail' && detail) {
    const entry = detail.entry;
    const verdict = detail.verdict;
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>Session Detail</Text>
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text bold>ID:     </Text>
            <Text>{entry.id}</Text>
          </Box>
          <Box>
            <Text bold>Date:   </Text>
            <Text>{entry.date}</Text>
          </Box>
          <Box>
            <Text bold>Status: </Text>
            <Text color={statusColor(entry.status)}>{entry.status}</Text>
          </Box>
          {detail.metadata && typeof detail.metadata['diffPath'] === 'string' && (
            <Box>
              <Text bold>Diff:   </Text>
              <Text>{String(detail.metadata['diffPath'])}</Text>
            </Box>
          )}
          {verdict && (
            <Box marginTop={1} flexDirection="column">
              <Text bold>Verdict:</Text>
              {typeof verdict['decision'] === 'string' && (
                <Box>
                  <Text>  Decision: </Text>
                  <Text>{String(verdict['decision'])}</Text>
                </Box>
              )}
              {typeof verdict['reasoning'] === 'string' && (
                <Box>
                  <Text dimColor>  {String(verdict['reasoning'])}</Text>
                </Box>
              )}
            </Box>
          )}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Escape/q: back to list</Text>
        </Box>
      </Box>
    );
  }

  if (detailLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>Sessions</Text>
        <Text dimColor>Loading session detail...</Text>
      </Box>
    );
  }

  // List view
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Sessions</Text>
      {sessions.length === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>No sessions found. Run &apos;agora review&apos; to create one.</Text>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          {sessions.map((session, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <Box key={session.id}>
                {isSelected ? (
                  <Text color="cyan" bold>{'> '}</Text>
                ) : (
                  <Text>{'  '}</Text>
                )}
                <Text bold={isSelected}>{session.date}</Text>
                <Text>  </Text>
                <Text dimColor={!isSelected}>{session.sessionId}</Text>
                <Text>  </Text>
                <Text color={statusColor(session.status)}>{session.status}</Text>
              </Box>
            );
          })}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          {sessions.length > 0 ? 'Enter: details | ' : ''}j/k: scroll | q: back
        </Text>
      </Box>
    </Box>
  );
}
