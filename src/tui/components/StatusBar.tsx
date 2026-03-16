import React from 'react';
import { Box, Text } from 'ink';
import type { Screen } from '../hooks/useRouter.js';
import { t } from '../../i18n/index.js';

interface StatusBarProps {
  screen: Screen;
  canGoBack: boolean;
}

function getScreenHints(): Record<Screen, string> {
  return {
    home: t('statusbar.home'),
    'review-setup': t('statusbar.reviewSetup'),
    review: t('statusbar.review'),
    pipeline: t('statusbar.pipeline'),
    results: t('statusbar.results'),
    sessions: t('statusbar.sessions'),
    config: t('statusbar.config'),
    debate: t('statusbar.debate'),
    context: t('statusbar.context') || 'Tab: files | j/k: scroll | c: collapse | Enter: detail | q: back',
  };
}

export function StatusBar({ screen, canGoBack }: StatusBarProps): React.JSX.Element {
  const hint = getScreenHints()[screen] ?? (canGoBack ? t('statusbar.review') : t('statusbar.quit'));
  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
      <Text dimColor>{screen}</Text>
      <Text dimColor>{hint}</Text>
    </Box>
  );
}
