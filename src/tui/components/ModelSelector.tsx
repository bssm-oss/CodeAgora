import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

interface ModelEntry {
  source: string;
  model_id: string;
  name: string;
  tier: string;
  context: string;
}

export interface SelectedModel {
  id: string;
  name: string;
  tier: string;
  context: string;
}

interface Props {
  source?: 'nim' | 'openrouter' | 'all';
  onSelect: (model: SelectedModel) => void;
  onCancel: () => void;
}

// ============================================================================
// Data loading
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadModelRankings(): ModelEntry[] {
  try {
    const raw = readFileSync(path.join(__dirname, '../../data/model-rankings.json'), 'utf-8');
    const data = JSON.parse(raw) as { models?: ModelEntry[] };
    return data.models ?? [];
  } catch {
    return [];
  }
}

// ============================================================================
// Constants
// ============================================================================

const TIER_ORDER: Record<string, number> = {
  'S+': 0, S: 1, 'A+': 2, A: 3, 'A-': 4,
  'B+': 5, B: 6, 'B-': 7, C: 8,
};

const TIER_COLORS: Record<string, string> = {
  'S+': 'magenta', S: 'red', 'A+': 'yellow', A: 'yellow', 'A-': 'yellow',
  'B+': 'cyan', B: 'cyan', 'B-': 'cyan', C: 'gray',
};

const VISIBLE_COUNT = 15;

// ============================================================================
// Component
// ============================================================================

export function ModelSelector({ source, onSelect, onCancel }: Props): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const allModels: ModelEntry[] = useMemo(() => {
    const raw = loadModelRankings();
    const filtered = source && source !== 'all'
      ? raw.filter(m => m.source === source)
      : raw;
    return filtered.slice().sort((a, b) => {
      const ta = TIER_ORDER[a.tier] ?? 99;
      const tb = TIER_ORDER[b.tier] ?? 99;
      return ta - tb;
    });
  }, [source]);

  const filtered = useMemo(() => {
    if (!search) return allModels;
    const lower = search.toLowerCase();
    return allModels.filter(m =>
      m.name.toLowerCase().includes(lower) ||
      m.model_id.toLowerCase().includes(lower)
    );
  }, [allModels, search]);

  // Clamp selectedIndex when filter changes
  const clampedIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  // Compute visible window
  const startOffset = Math.max(0, clampedIndex - Math.floor(VISIBLE_COUNT / 2));
  const endOffset = Math.min(filtered.length, startOffset + VISIBLE_COUNT);
  const visibleModels = filtered.slice(startOffset, endOffset);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return && filtered.length > 0) {
      const model = filtered[clampedIndex];
      if (model) {
        onSelect({
          id: model.model_id,
          name: model.name,
          tier: model.tier,
          context: model.context,
        });
      }
      return;
    }
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(i => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (key.backspace || key.delete) {
      setSearch(s => s.slice(0, -1));
      setSelectedIndex(0);
      return;
    }
    if (input && !key.return) {
      setSearch(s => s + input);
      setSelectedIndex(0);
    }
  });

  const tierColor = (tier: string): string => TIER_COLORS[tier] ?? 'white';

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Select Model</Text>
      <Box marginTop={0}>
        <Text>Search: </Text>
        <Text color="cyan">{search}</Text>
        <Text color="gray">_</Text>
        <Text dimColor>  ({filtered.length} models)</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {filtered.length === 0 ? (
          <Text dimColor>No models match your search.</Text>
        ) : (
          visibleModels.map((model, vi) => {
            const realIndex = startOffset + vi;
            const isSelected = realIndex === clampedIndex;
            return (
              <Box key={model.model_id}>
                <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                  {isSelected ? '> ' : '  '}
                  [{model.tier.padEnd(2)}]
                </Text>
                <Text color={isSelected ? 'cyan' : tierColor(model.tier)} bold={isSelected}>
                  {' '}{model.name}
                </Text>
                <Text dimColor={!isSelected}>
                  {' '}({model.model_id.split('/')[0]}) {model.context}
                </Text>
              </Box>
            );
          })
        )}
        {filtered.length > VISIBLE_COUNT && (
          <Text dimColor>  ... {filtered.length - VISIBLE_COUNT} more (type to filter)</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {'\u2191\u2193'}: scroll | Enter: select | Type to search | Esc: cancel
        </Text>
      </Box>
    </Box>
  );
}
