import React from 'react';
import { Box, Text } from 'ink';
import { Menu } from '../components/Menu.js';
import type { Screen } from '../hooks/useRouter.js';

interface HomeScreenProps {
  onNavigate: (screen: Screen) => void;
  onQuit: () => void;
}

const MENU_ITEMS = [
  { label: 'Review — Run code review pipeline', value: 'review-setup' },
  { label: 'Sessions — Browse review history', value: 'sessions' },
  { label: 'Config — View current configuration', value: 'config' },
  { label: 'Quit', value: 'quit' },
];

export function HomeScreen({ onNavigate, onQuit }: HomeScreenProps): React.JSX.Element {
  function handleSelect(item: { label: string; value: string }): void {
    if (item.value === 'quit') {
      onQuit();
    } else {
      onNavigate(item.value as Screen);
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Main Menu</Text>
      <Menu items={MENU_ITEMS} onSelect={handleSelect} />
    </Box>
  );
}
