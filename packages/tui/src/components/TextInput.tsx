/**
 * TextInput — Inline text input with cursor display.
 * Keyboard handling is done by the parent; this is a pure render component.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

interface TextInputProps {
  value: string;
  label?: string;
  placeholder?: string;
  mask?: boolean;
  isActive?: boolean;
}

export function TextInput({
  value,
  label,
  placeholder,
  mask = false,
  isActive = true,
}: TextInputProps): React.JSX.Element {
  let displayValue = value;
  if (mask && value.length > 4) {
    displayValue = '\u2022'.repeat(value.length - 4) + value.slice(-4);
  } else if (mask && value.length > 0) {
    displayValue = '\u2022'.repeat(value.length);
  }

  const showPlaceholder = !value && placeholder;

  return (
    <Box>
      {label ? (
        <Text dimColor>{label}: </Text>
      ) : null}
      {showPlaceholder ? (
        <Text dimColor>{placeholder}</Text>
      ) : (
        <Text color={isActive ? colors.primary : undefined}>{displayValue}</Text>
      )}
      {isActive ? <Text color={colors.primary}>_</Text> : null}
    </Box>
  );
}
