/**
 * Toast — Auto-dismiss notification message.
 */

import React from 'react';
import { Text } from 'ink';
import { colors, icons } from '../theme.js';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  visible: boolean;
}

const TYPE_CONFIG = {
  success: { color: colors.success, icon: icons.check },
  error: { color: colors.error, icon: icons.cross },
  info: { color: colors.primary, icon: icons.bullet },
} as const;

export function Toast({ message, type = 'info', visible }: ToastProps): React.JSX.Element | null {
  if (!visible || !message) return null;

  const config = TYPE_CONFIG[type];
  return (
    <Text color={config.color}>
      {` ${config.icon} ${message}`}
    </Text>
  );
}
