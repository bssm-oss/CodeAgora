/**
 * ModelSelector — Searchable model picker with provider filtering and API key status.
 *
 * Search supports:
 * - Free text: matches model name or ID
 * - "provider/" prefix: filters to that provider (e.g. "groq/" shows only groq models)
 */

import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { colors, icons, getTerminalSize } from '../theme.js';
import { isProviderAvailable } from '../utils/provider-status.js';
import { t } from '@codeagora/shared/i18n/index.js';

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
  source: string;
}

interface Props {
  source?: string;
  provider?: string;
  onSelect: (model: SelectedModel) => void;
  onCancel: () => void;
}

// ============================================================================
// Data loading (cached)
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _cachedModels: ModelEntry[] | null = null;

function loadModelRankings(): ModelEntry[] {
  if (_cachedModels) return _cachedModels;
  try {
    const raw = readFileSync(path.join(__dirname, '../../../shared/src/data/model-rankings.json'), 'utf-8');
    const data = JSON.parse(raw) as { models?: ModelEntry[] };
    _cachedModels = data.models ?? [];
    return _cachedModels;
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

// ============================================================================
// Component
// ============================================================================

export function ModelSelector({ source, provider: initialProvider, onSelect, onCancel }: Props): React.JSX.Element {
  const [search, setSearch] = useState(initialProvider ? `${initialProvider}/` : '');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { rows } = getTerminalSize();
  const visibleCount = Math.max(rows - 8, 8);

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

    // "provider/" prefix filtering
    const slashIdx = lower.indexOf('/');
    if (slashIdx > 0) {
      const providerQuery = lower.slice(0, slashIdx);
      const modelQuery = lower.slice(slashIdx + 1);
      return allModels.filter(m => {
        const sourceMatch = m.source.toLowerCase().includes(providerQuery) ||
                           m.model_id.toLowerCase().startsWith(providerQuery);
        if (!sourceMatch) return false;
        if (!modelQuery) return true;
        return m.name.toLowerCase().includes(modelQuery) ||
               m.model_id.toLowerCase().includes(modelQuery);
      });
    }

    return allModels.filter(m =>
      m.name.toLowerCase().includes(lower) ||
      m.model_id.toLowerCase().includes(lower) ||
      m.source.toLowerCase().includes(lower)
    );
  }, [allModels, search]);

  const clampedIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  // Viewport windowing
  const halfHeight = Math.floor(visibleCount / 2);
  let startOffset = Math.max(0, clampedIndex - halfHeight);
  const endOffset = Math.min(filtered.length, startOffset + visibleCount);
  if (endOffset - startOffset < visibleCount && startOffset > 0) {
    startOffset = Math.max(0, endOffset - visibleCount);
  }
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
          source: model.source,
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
      const clean = input.replace(/[\x00-\x1F\x7F]/g, '');
      if (!clean) return;
      setSearch(s => s + clean);
      setSelectedIndex(0);
    }
  });

  const tierColor = (tier: string): string => TIER_COLORS[tier] ?? 'white';
  const hasAbove = startOffset > 0;
  const hasBelow = endOffset < filtered.length;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={colors.primary}>{t('model.selector.title')}</Text>
      <Box marginTop={0}>
        <Text>{t('model.selector.search')}</Text>
        <Text color={colors.primary}>{search}</Text>
        <Text color={colors.muted}>_</Text>
        <Text dimColor>  {t('model.selector.count').replace('{count}', String(filtered.length))}</Text>
      </Box>
      <Text dimColor>  {t('model.selector.tip')}</Text>
      <Box marginTop={1} flexDirection="column">
        {filtered.length === 0 ? (
          <Text dimColor>{t('model.selector.noMatch')}</Text>
        ) : (
          <>
            {hasAbove ? (
              <Text dimColor>{`  ${icons.arrowDown} ${startOffset} more above`}</Text>
            ) : null}
            {visibleModels.map((model, vi) => {
              const realIndex = startOffset + vi;
              const isSelected = realIndex === clampedIndex;
              const providerAvailable = isProviderAvailable(model.source);
              const keyIcon = providerAvailable ? icons.check : icons.cross;
              const keyColor = providerAvailable ? colors.success : colors.error;
              return (
                <Box key={`${model.source}-${model.model_id}`}>
                  <Text color={isSelected ? colors.selection.bg : undefined} bold={isSelected}>
                    {isSelected ? `${icons.arrow} ` : '  '}
                    <Text color={keyColor}>{keyIcon}</Text>
                    {' '}[{model.tier.padEnd(2)}]
                  </Text>
                  <Text color={isSelected ? colors.selection.bg : tierColor(model.tier)} bold={isSelected}>
                    {' '}{model.name}
                  </Text>
                  <Text dimColor={!isSelected}>
                    {' '}({model.source}) {model.context}
                  </Text>
                </Box>
              );
            })}
            {hasBelow ? (
              <Text dimColor>{`  ${icons.arrowDown} ${filtered.length - endOffset} more below`}</Text>
            ) : null}
          </>
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {t('model.selector.hints').replace('{check}', icons.check).replace('{cross}', icons.cross)}
        </Text>
      </Box>
    </Box>
  );
}
