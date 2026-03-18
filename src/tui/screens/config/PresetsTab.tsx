import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Config } from '../../../types/config.js';
import { Panel } from '../../components/Panel.js';
import { ScrollableList } from '../../components/ScrollableList.js';
import { colors, icons, getTerminalSize } from '../../theme.js';
import { t } from '../../../i18n/index.js';
import { getMissingProviders, isProviderAvailable } from '../../utils/provider-status.js';

// ============================================================================
// Preset Definitions
// ============================================================================

interface PresetDef {
  name: string;
  description: string;
  reviewerCount: number;
  providers: string[];
  build: () => Partial<Config>;
}

const PRESETS: PresetDef[] = [
  {
    name: 'Quick Setup',
    description: '3 Groq reviewers + 1 supporter',
    reviewerCount: 3,
    providers: ['groq'],
    build: () => ({
      reviewers: [
        { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api' as const, provider: 'groq', enabled: true, timeout: 120 },
        { id: 'r2', model: 'llama-3.3-70b-versatile', backend: 'api' as const, provider: 'groq', enabled: true, timeout: 120 },
        { id: 'r3', model: 'llama-3.3-70b-versatile', backend: 'api' as const, provider: 'groq', enabled: true, timeout: 120 },
      ],
      supporters: {
        pool: [
          { id: 's1', model: 'llama-3.3-70b-versatile', backend: 'api' as const, provider: 'groq', enabled: true, timeout: 120 },
        ],
        pickCount: 1,
        pickStrategy: 'random' as const,
        devilsAdvocate: { id: 'da', model: 'llama-3.3-70b-versatile', backend: 'api' as const, provider: 'groq', enabled: true, timeout: 120 },
        personaPool: ['.ca/personas/strict.md'],
        personaAssignment: 'random' as const,
      },
    }),
  },
  {
    name: 'Diversity',
    description: 'Groq + Google + Mistral mix',
    reviewerCount: 3,
    providers: ['groq', 'google', 'mistral'],
    build: () => ({
      reviewers: [
        { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api' as const, provider: 'groq', enabled: true, timeout: 120 },
        { id: 'r2', model: 'gemini-2.0-flash', backend: 'api' as const, provider: 'google', enabled: true, timeout: 120 },
        { id: 'r3', model: 'mistral-large-latest', backend: 'api' as const, provider: 'mistral', enabled: true, timeout: 120 },
      ],
      supporters: {
        pool: [
          { id: 's1', model: 'llama-3.3-70b-versatile', backend: 'api' as const, provider: 'groq', enabled: true, timeout: 120 },
        ],
        pickCount: 1,
        pickStrategy: 'random' as const,
        devilsAdvocate: { id: 'da', model: 'mistral-large-latest', backend: 'api' as const, provider: 'mistral', enabled: true, timeout: 120 },
        personaPool: ['.ca/personas/strict.md'],
        personaAssignment: 'random' as const,
      },
    }),
  },
  {
    name: 'Minimal',
    description: '1 reviewer + 1 supporter',
    reviewerCount: 1,
    providers: ['groq'],
    build: () => ({
      reviewers: [
        { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api' as const, provider: 'groq', enabled: true, timeout: 120 },
      ],
      supporters: {
        pool: [
          { id: 's1', model: 'llama-3.3-70b-versatile', backend: 'api' as const, provider: 'groq', enabled: true, timeout: 120 },
        ],
        pickCount: 1,
        pickStrategy: 'random' as const,
        devilsAdvocate: { id: 'da', model: 'llama-3.3-70b-versatile', backend: 'api' as const, provider: 'groq', enabled: true, timeout: 120 },
        personaPool: ['.ca/personas/strict.md'],
        personaAssignment: 'random' as const,
      },
    }),
  },
];

// ============================================================================
// Component
// ============================================================================

interface Props {
  config: Config;
  isActive: boolean;
  onConfigChange: (newConfig: Config) => void;
}

export function PresetsTab({ config, isActive, onConfigChange }: Props): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);

  function applyPreset(index: number): void {
    const preset = PRESETS[index];
    if (!preset) return;
    const partial = preset.build();
    onConfigChange({ ...config, ...partial } as Config);
    setConfirmIndex(null);
  }

  useInput((input, key) => {
    if (!isActive) return;

    if (confirmIndex !== null) {
      if (input === 'y' || input === 'Y') {
        applyPreset(confirmIndex);
      } else {
        setConfirmIndex(null);
      }
      return;
    }

    if (key.upArrow || input === 'k') {
      setSelectedIndex(i => Math.max(0, i - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(i => Math.min(PRESETS.length - 1, i + 1));
    } else if (key.return || input === ' ') {
      setConfirmIndex(selectedIndex);
    }
  });

  const { cols } = getTerminalSize();
  const listWidth = Math.max(Math.floor((cols - 4) * 0.4), 20);
  const detailWidth = Math.max((cols - 4) - listWidth - 2, 20);

  const selectedPreset = PRESETS[selectedIndex];

  return (
    <Box flexDirection="row">
      {/* Left: preset list */}
      <Panel title={t('config.tabs.presets')} width={listWidth}>
        {confirmIndex !== null ? (
          <Box flexDirection="column">
            <Text color={colors.warning} bold>
              {t('config.confirm.preset').replace('{name}', PRESETS[confirmIndex]?.name ?? '')}
            </Text>
            <Text dimColor>{t('config.presets.replaceWarning')}</Text>
          </Box>
        ) : (
          <ScrollableList
            items={PRESETS}
            selectedIndex={selectedIndex}
            height={10}
            renderItem={(preset, _i, isSelected) => (
              <Box flexDirection="column">
                <Text color={isSelected ? colors.selection.bg : undefined} bold={isSelected}>
                  {preset.name}
                </Text>
                <Text dimColor>{'  '}{preset.description}</Text>
              </Box>
            )}
          />
        )}
      </Panel>

      {/* Right: preview */}
      <Panel title="Preview" width={detailWidth}>
        {selectedPreset ? (
          <Box flexDirection="column">
            <Text bold color={colors.primary}>{selectedPreset.name}</Text>
            <Text dimColor>{selectedPreset.description}</Text>
            <Box marginTop={1} flexDirection="column">
              <Box>
                <Text dimColor>{'Reviewers:'.padEnd(14)}</Text>
                <Text>{selectedPreset.reviewerCount}</Text>
              </Box>
              <Box>
                <Text dimColor>{'Providers:'.padEnd(14)}</Text>
                {selectedPreset.providers.map((p, i) => {
                  const available = isProviderAvailable(p);
                  return (
                    <Text key={p}>
                      {i > 0 ? ', ' : ''}
                      <Text color={available ? colors.success : colors.error}>
                        {available ? icons.check : icons.cross}
                      </Text>
                      {' '}{p}
                    </Text>
                  );
                })}
              </Box>
              <Box>
                <Text dimColor>{'Supporters:'.padEnd(14)}</Text>
                <Text>1 + Devil&apos;s Advocate</Text>
              </Box>
            </Box>
            {(() => {
              const missing = getMissingProviders(selectedPreset.providers);
              if (missing.length > 0) {
                return (
                  <Box marginTop={1}>
                    <Text color={colors.warning}>
                      {icons.cross} Missing API keys: {missing.join(', ')}
                    </Text>
                  </Box>
                );
              }
              return null;
            })()}
            <Box marginTop={1}>
              <Text dimColor>Enter/Space: apply</Text>
            </Box>
          </Box>
        ) : null}
      </Panel>
    </Box>
  );
}
