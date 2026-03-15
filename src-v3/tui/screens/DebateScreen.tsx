import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { DebatePanel } from '../components/DebatePanel.js';
import type { DebateRound } from '../components/DebatePanel.js';

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

  return (
    <Box flexDirection="column" padding={1}>
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold>L2 Discussion Moderator</Text>
      </Box>

      {/* Summary bar */}
      <Box marginBottom={1}>
        <Text color="gray">Total: </Text>
        <Text bold>{total}</Text>
        <Text color="gray">  Resolved: </Text>
        <Text color="green" bold>{resolved}</Text>
        <Text color="gray">  Escalated: </Text>
        <Text color="red" bold>{escalated}</Text>
      </Box>

      {/* Discussion list */}
      {discussions.length === 0 ? (
        <Text color="gray">No discussions.</Text>
      ) : (
        discussions.map((d, idx) => (
          <DebatePanel
            key={d.id}
            discussionId={d.id}
            severity={d.severity}
            title={d.title}
            filePath={d.filePath}
            rounds={d.rounds}
            status={d.status}
            isSelected={idx === selectedIndex}
          />
        ))
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>j/k or arrows: scroll | q: back</Text>
      </Box>
    </Box>
  );
}
