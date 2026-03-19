import React from 'react';
import { Box, Text } from 'ink';
import { t } from '@codeagora/shared/i18n/index.js';
import { colors, borders } from '../theme.js';

export function Header(): React.JSX.Element {
  return (
    <Box borderStyle={borders.panel} borderColor={colors.muted} paddingX={1}>
      <Text color={colors.primary} bold>{t('app.title')}</Text>
      <Text color={colors.muted}>{' v1.1.0'}</Text>
      <Text dimColor>{' — '}{t('app.subtitle')}</Text>
    </Box>
  );
}
