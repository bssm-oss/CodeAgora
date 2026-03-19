/**
 * Panel — Bordered container with optional title.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { borders, colors } from '../theme.js';

interface PanelProps {
  title?: string;
  borderStyle?: 'round' | 'single' | 'double';
  borderColor?: string;
  width?: number;
  height?: number;
  children: React.ReactNode;
}

export function Panel({
  title,
  borderStyle = borders.panel,
  borderColor = colors.muted,
  width,
  height,
  children,
}: PanelProps): React.JSX.Element {
  return (
    <Box
      flexDirection="column"
      borderStyle={borderStyle}
      borderColor={borderColor}
      width={width}
      height={height}
    >
      {title ? (
        <Box marginBottom={0}>
          <Text bold color={colors.primary}>{` ${title} `}</Text>
        </Box>
      ) : null}
      <Box flexDirection="column" paddingX={1}>
        {children}
      </Box>
    </Box>
  );
}
