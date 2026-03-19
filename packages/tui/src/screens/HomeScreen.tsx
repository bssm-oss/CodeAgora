import React from 'react';
import { Box, Text } from 'ink';
import { Menu } from '../components/Menu.js';
import { Panel } from '../components/Panel.js';
import type { Screen } from '../hooks/useRouter.js';
import { t } from '@codeagora/shared/i18n/index.js';
import { colors, icons } from '../theme.js';

interface HomeScreenProps {
  onNavigate: (screen: Screen) => void;
  onQuit: () => void;
}

function getMenuItems(): Array<{ label: string; value: string }> {
  return [
    { label: `${icons.arrow} ${t('home.review')}`, value: 'review-setup' },
    { label: `${icons.arrow} ${t('home.sessions')}`, value: 'sessions' },
    { label: `${icons.arrow} ${t('home.config')}`, value: 'config' },
    { label: `${icons.arrow} ${t('home.quit')}`, value: 'quit' },
  ];
}

export function HomeScreen({ onNavigate, onQuit }: HomeScreenProps): React.JSX.Element {
  function handleSelect(item: { label: string; value: string }): void {
    if (item.value === 'quit') {
      onQuit();
    } else {
      onNavigate(item.value as Screen);
    }
  }

  return (
    <Panel title={t('app.title')}>
      <Box flexDirection="column" marginBottom={1}>
        <Text color={colors.success}>{icons.check} Ready</Text>
        <Text color={colors.muted}>{'v1.1.0'}</Text>
      </Box>
      <Menu items={getMenuItems()} onSelect={handleSelect} />
    </Panel>
  );
}
