import React from 'react';
import { Box, Text } from 'ink';

// ============================================================================
// Shared DetailRow Component
// ============================================================================

export interface DetailRowProps {
  label: string;
  value: string;
  color?: string;
  highlight?: boolean;
  labelWidth?: number;
}

export function DetailRow({ label, value, color, highlight, labelWidth = 12 }: DetailRowProps): React.JSX.Element {
  return (
    <Box>
      <Text dimColor>{label.padEnd(labelWidth)}</Text>
      <Text color={color} bold={highlight}>{value}</Text>
    </Box>
  );
}
