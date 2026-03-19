import React from 'react';
import { Box, Text } from 'ink';

// ============================================================================
// Types
// ============================================================================

export interface DebateRound {
  round: number;
  supporters: Array<{
    id: string;
    stance: 'AGREE' | 'DISAGREE';
    reasoning: string;
    isDevilsAdvocate?: boolean;
  }>;
  consensusReached: boolean;
}

export interface DebatePanelProps {
  discussionId: string;
  severity: string;
  title: string;
  filePath: string;
  rounds: DebateRound[];
  status: 'pending' | 'active' | 'resolved' | 'escalated';
  isSelected?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function severityColor(severity: string): string {
  switch (severity) {
    case 'HARSHLY_CRITICAL': return 'red';
    case 'CRITICAL': return 'red';
    case 'WARNING': return 'yellow';
    case 'SUGGESTION': return 'cyan';
    default: return 'white';
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'pending': return 'gray';
    case 'active': return 'yellow';
    case 'resolved': return 'green';
    case 'escalated': return 'red';
    default: return 'white';
  }
}


// ============================================================================
// Component
// ============================================================================

export function DebatePanel({
  discussionId,
  severity,
  title,
  filePath,
  rounds,
  status,
  isSelected = false,
}: DebatePanelProps): React.JSX.Element {
  const lastRound = rounds[rounds.length - 1];
  const consensusReached = lastRound?.consensusReached ?? false;

  return (
    <Box
      flexDirection="column"
      borderStyle={isSelected ? 'single' : undefined}
      borderColor={isSelected ? 'cyan' : undefined}
      paddingX={1}
      marginBottom={1}
    >
      {/* Header row: severity badge + id + file + title */}
      <Box>
        <Text color={severityColor(severity)} bold>
          [{severity}]
        </Text>
        <Text color="gray"> {discussionId} </Text>
        <Text color="cyan">{filePath}</Text>
        <Text> — {title}</Text>
      </Box>

      {/* Status indicator */}
      <Box>
        <Text dimColor>Status: </Text>
        <Text color={statusColor(status)} bold={status === 'active' || status === 'escalated'}>
          {status.toUpperCase()}
        </Text>
      </Box>

      {/* Rounds */}
      {rounds.map((r) => (
        <Box key={r.round} flexDirection="column" marginTop={1}>
          <Text bold color="gray">
            Round {r.round}
          </Text>
          {r.supporters.map((s) => (
            <Box key={s.id} marginLeft={2}>
              <Text color={s.stance === 'AGREE' ? 'green' : 'red'} bold>
                {s.stance}
              </Text>
              {s.isDevilsAdvocate === true && (
                <Text color="magenta"> [DA]</Text>
              )}
              <Text color="gray"> {s.id}: </Text>
              <Text wrap="wrap">{s.reasoning}</Text>
            </Box>
          ))}
        </Box>
      ))}

      {/* Consensus status */}
      <Box marginTop={1}>
        {consensusReached ? (
          <Text color="green">Consensus reached</Text>
        ) : (
          <Text color="yellow">No consensus</Text>
        )}
      </Box>
    </Box>
  );
}
