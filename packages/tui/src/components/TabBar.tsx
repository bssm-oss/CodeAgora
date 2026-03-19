/**
 * TabBar — Horizontal tab strip with number key shortcuts.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

interface Tab {
  id: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
}

export function TabBar({ tabs, activeTab }: TabBarProps): React.JSX.Element {
  return (
    <Box flexDirection="row" gap={1}>
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTab;
        return (
          <Box key={tab.id}>
            {isActive ? (
              <Text backgroundColor={colors.selection.bg} color={colors.selection.fg} bold>
                {` ${i + 1}.${tab.label} `}
              </Text>
            ) : (
              <Text dimColor>
                {` ${i + 1}.${tab.label} `}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
