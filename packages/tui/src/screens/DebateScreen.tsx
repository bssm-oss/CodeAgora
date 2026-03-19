import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Panel } from '../components/Panel.js';
import { ScrollableList } from '../components/ScrollableList.js';
import type { DebateRound } from '../components/DebatePanel.js';
import {
  colors,
  icons,
  severityColor,
  severityIcon,
  getTerminalSize,
  LIST_WIDTH_RATIO,
  DETAIL_WIDTH_RATIO,
  MIN_COLS,
} from '../theme.js';

// ============================================================================
// Types
// ============================================================================

export interface DebateDiscussion {
  id: string;
  severity: string;
  title: string;
  filePath: string;
  rounds: DebateRound[];
  status: 'pending' | 'active' | 'resolved' | 'escalated';
}

interface Props {
  discussions: DebateDiscussion[];
}

// ============================================================================
// Helpers
// ============================================================================

function discussionStatusIcon(status: DebateDiscussion['status']): string {
  switch (status) {
    case 'resolved':  return icons.enabled;   // ●
    case 'active':    return icons.partial;   // ◐
    default:          return icons.disabled;  // ○
  }
}

function discussionStatusColor(status: DebateDiscussion['status']): string {
  switch (status) {
    case 'resolved':  return colors.success;
    case 'active':    return colors.warning;
    case 'escalated': return colors.error;
    default:          return colors.muted;
  }
}

// ============================================================================
// Component
// ============================================================================

export function DebateScreen({ discussions }: Props): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const total = discussions.length;
  const resolved = discussions.filter(d => d.status === 'resolved').length;
  const escalated = discussions.filter(d => d.status === 'escalated').length;

  useInput((_input, key) => {
    if (key.downArrow || _input === 'j') {
      setSelectedIndex(i => Math.min(i + 1, total - 1));
    } else if (key.upArrow || _input === 'k') {
      setSelectedIndex(i => Math.max(i - 1, 0));
    }
  });

  const { cols } = getTerminalSize();
  const effectiveCols = Math.max(cols, MIN_COLS);
  const listWidth = Math.floor(effectiveCols * LIST_WIDTH_RATIO);
  const detailWidth = Math.floor(effectiveCols * DETAIL_WIDTH_RATIO);
  const listHeight = Math.max(8, (process.stdout.rows || 24) - 10);

  const selected = discussions[selectedIndex] ?? null;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color={colors.primary}>L2 Discussion Moderator</Text>
      </Box>

      {/* Summary bar */}
      <Box marginBottom={1}>
        <Text color={colors.muted}>Total: </Text>
        <Text bold>{total}</Text>
        <Text color={colors.muted}>  Resolved: </Text>
        <Text color={colors.success} bold>{resolved}</Text>
        <Text color={colors.muted}>  Escalated: </Text>
        <Text color={colors.error} bold>{escalated}</Text>
      </Box>

      {/* Master-detail layout */}
      {discussions.length === 0 ? (
        <Text color={colors.muted}>No discussions.</Text>
      ) : (
        <Box flexDirection="row" gap={1}>
          {/* Left: discussion list */}
          <Panel title="Discussions" width={listWidth}>
            <ScrollableList
              items={discussions}
              selectedIndex={selectedIndex}
              height={listHeight}
              emptyMessage="No discussions."
              renderItem={(d: DebateDiscussion, _idx: number, isSelected: boolean) => (
                <Box>
                  <Text color={severityColor(d.severity)}>
                    {severityIcon(d.severity)}{' '}
                  </Text>
                  <Text bold={isSelected} wrap="truncate-end">
                    {d.title}
                  </Text>
                  <Text color={colors.muted}> {d.filePath}</Text>
                  <Text>  </Text>
                  <Text color={discussionStatusColor(d.status)}>
                    {discussionStatusIcon(d.status)}
                  </Text>
                </Box>
              )}
            />
          </Panel>

          {/* Right: discussion detail */}
          <Panel title="Detail" width={detailWidth}>
            {selected === null ? (
              <Text dimColor>Select a discussion</Text>
            ) : (
              <Box flexDirection="column">
                {/* Header */}
                <Box marginBottom={1}>
                  <Text color={severityColor(selected.severity)} bold>
                    {severityIcon(selected.severity)} {selected.severity}
                  </Text>
                  <Text>  </Text>
                  <Text color={discussionStatusColor(selected.status)}>
                    {discussionStatusIcon(selected.status)} {selected.status.toUpperCase()}
                  </Text>
                </Box>

                <Box marginBottom={1}>
                  <Text bold>{selected.title}</Text>
                </Box>

                <Box marginBottom={1}>
                  <Text color={colors.primary}>{selected.filePath}</Text>
                </Box>

                {/* Rounds */}
                {selected.rounds.length === 0 ? (
                  <Text dimColor>No rounds yet.</Text>
                ) : (
                  selected.rounds.map((r) => (
                    <Box key={r.round} flexDirection="column" marginBottom={1}>
                      <Text bold color={colors.muted}>Round {r.round}</Text>
                      {r.supporters.map((s) => (
                        <Box key={s.id} marginLeft={2} flexDirection="column">
                          <Box>
                            <Text
                              color={s.stance === 'AGREE' ? colors.success : colors.error}
                              bold
                            >
                              {s.stance}
                            </Text>
                            {s.isDevilsAdvocate === true && (
                              <Text color={colors.accent}> [DA]</Text>
                            )}
                            <Text color={colors.muted}> {s.id}</Text>
                          </Box>
                          <Box marginLeft={2}>
                            <Text wrap="wrap">{s.reasoning}</Text>
                          </Box>
                        </Box>
                      ))}
                      <Box marginLeft={2} marginTop={1}>
                        {r.consensusReached ? (
                          <Text color={colors.success}>
                            {icons.check} Consensus reached
                          </Text>
                        ) : (
                          <Text color={colors.warning}>
                            {icons.cross} No consensus
                          </Text>
                        )}
                      </Box>
                    </Box>
                  ))
                )}
              </Box>
            )}
          </Panel>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>j/k or arrows: scroll | q: back</Text>
      </Box>
    </Box>
  );
}
