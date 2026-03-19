/**
 * ScrollableList — Generic scrollable list with viewport windowing.
 * Keyboard handling is done by the parent; this is a pure render component.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors, icons } from '../theme.js';
import { t } from '@codeagora/shared/i18n/index.js';

interface ScrollableListProps<T> {
  items: T[];
  selectedIndex: number;
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
  height?: number;
  emptyMessage?: string;
}

export function ScrollableList<T>({
  items,
  selectedIndex,
  renderItem,
  height = 10,
  emptyMessage,
}: ScrollableListProps<T>): React.JSX.Element {
  const resolvedEmptyMessage = emptyMessage ?? t('list.noItems');
  if (items.length === 0) {
    return (
      <Box>
        <Text dimColor>{resolvedEmptyMessage}</Text>
      </Box>
    );
  }

  const clampedIndex = Math.min(selectedIndex, items.length - 1);

  // Calculate viewport window
  const halfHeight = Math.floor(height / 2);
  let startOffset = Math.max(0, clampedIndex - halfHeight);
  const endOffset = Math.min(items.length, startOffset + height);
  // Adjust if we're near the end
  if (endOffset - startOffset < height && startOffset > 0) {
    startOffset = Math.max(0, endOffset - height);
  }

  const visibleItems = items.slice(startOffset, endOffset);
  const hasAbove = startOffset > 0;
  const hasBelow = endOffset < items.length;

  return (
    <Box flexDirection="column">
      {hasAbove ? (
        <Text dimColor>{` ${icons.arrowDown} ${startOffset} more above`}</Text>
      ) : null}
      {visibleItems.map((item, vi) => {
        const realIndex = startOffset + vi;
        const isSelected = realIndex === clampedIndex;
        return (
          <Box key={realIndex}>
            <Text color={isSelected ? colors.selection.bg : undefined} bold={isSelected}>
              {isSelected ? `${icons.arrow} ` : '  '}
            </Text>
            {renderItem(item, realIndex, isSelected)}
          </Box>
        );
      })}
      {hasBelow ? (
        <Text dimColor>{` ${icons.arrowDown} ${items.length - endOffset} more below`}</Text>
      ) : null}
    </Box>
  );
}
