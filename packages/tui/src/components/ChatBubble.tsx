import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

// ============================================================================
// Types
// ============================================================================

interface Props {
  reviewerId: string;
  model: string;
  stance: 'agree' | 'disagree' | 'neutral';
  message: string;
  isDevilsAdvocate: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function ChatBubble({ reviewerId, model, stance, message, isDevilsAdvocate }: Props): React.JSX.Element {
  const stanceIcon = stance === 'agree' ? '✅' : stance === 'neutral' ? '⚠️' : '❌';
  const stanceColor = stance === 'agree' ? colors.success : stance === 'neutral' ? colors.warning : colors.error;
  const borderColor = isDevilsAdvocate ? colors.accent : stanceColor;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      marginBottom={1}
    >
      {/* Header */}
      <Box>
        <Text color={colors.primary} bold>{reviewerId}</Text>
        {model !== '' && (
          <Text color={colors.muted}> ({model})</Text>
        )}
        {isDevilsAdvocate && (
          <Text color={colors.accent}> 👿 Devil's Advocate</Text>
        )}
      </Box>

      {/* Stance + message */}
      <Box>
        <Text color={stanceColor} bold>{stanceIcon} {stance.toUpperCase()}</Text>
        <Text color={colors.muted}> — </Text>
        <Text bold={isDevilsAdvocate} wrap="wrap">{message}</Text>
      </Box>
    </Box>
  );
}
