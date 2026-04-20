import React from 'react';
import { Box, Text } from 'ink';
import { colors, icons } from '../theme.js';

// ============================================================================
// Types
// ============================================================================

interface Props {
  reviewerId: string;
  provider: string;
  model: string;
  status: 'running' | 'done' | 'failed';
  issueCount: number;
  elapsed: number;
}

// ============================================================================
// Helpers
// ============================================================================

function statusIcon(status: Props['status']): string {
  switch (status) {
    case 'running': return '\u27f3'; // ⟳
    case 'done':    return icons.check;   // ✓
    case 'failed':  return icons.cross;   // ✗
  }
}

function statusColor(status: Props['status']): string {
  switch (status) {
    case 'running': return colors.warning;
    case 'done':    return colors.success;
    case 'failed':  return colors.error;
  }
}

// ============================================================================
// Component
// ============================================================================

export function ReviewerCard({ reviewerId, provider, model, status, issueCount, elapsed }: Props): React.JSX.Element {
  const ico = statusIcon(status);
  const col = statusColor(status);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={col}
      paddingX={1}
      marginRight={1}
      minWidth={14}
    >
      <Text bold>{reviewerId}</Text>
      {provider !== '' && (
        <Text color={colors.muted}>{provider}</Text>
      )}
      {model !== '' && (
        <Text color={colors.muted} dimColor>{model.length > 14 ? model.slice(0, 13) + '\u2026' : model}</Text>
      )}
      <Box marginTop={0}>
        <Text color={col}>{ico} </Text>
        {status === 'running' ? (
          <Text color={colors.muted}>{icons.ellipsis}</Text>
        ) : (
          <Text color={col}>{issueCount} issue{issueCount !== 1 ? 's' : ''}</Text>
        )}
      </Box>
      {status !== 'running' && elapsed > 0 && (
        <Text dimColor color={colors.muted}>{elapsed}s</Text>
      )}
    </Box>
  );
}
