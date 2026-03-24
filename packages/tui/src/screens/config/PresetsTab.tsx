import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Config } from '@codeagora/core/types/config.js';
import { STATIC_PRESETS, buildPresetConfig } from '@codeagora/core/config/presets.js';
import type { PresetConfig } from '@codeagora/core/config/presets.js';
import { Panel } from '../../components/Panel.js';
import { ScrollableList } from '../../components/ScrollableList.js';
import { colors, icons, getTerminalSize } from '../../theme.js';
import { t } from '@codeagora/shared/i18n/index.js';
import { getMissingProviders, isProviderAvailable } from '../../utils/provider-status.js';

// ============================================================================
// Component
// ============================================================================

interface Props {
  config: Config | null;
  isActive: boolean;
  onConfigChange: (newConfig: Config) => void;
}

export function PresetsTab({ config, isActive, onConfigChange }: Props): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);

  function applyPreset(index: number): void {
    const preset = STATIC_PRESETS[index];
    if (!preset) return;

    // Preserve existing mode/language if config exists
    const mode = config?.mode ?? 'pragmatic';
    const language = config?.language ?? 'en';

    const newConfig = buildPresetConfig({
      preset,
      mode: mode as 'strict' | 'pragmatic',
      language: language as 'en' | 'ko',
    });

    onConfigChange(newConfig);
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
      setSelectedIndex(i => Math.min(STATIC_PRESETS.length - 1, i + 1));
    } else if (key.return || input === ' ') {
      setConfirmIndex(selectedIndex);
    }
  });

  const { cols } = getTerminalSize();
  const listWidth = Math.max(Math.floor((cols - 4) * 0.4), 20);
  const detailWidth = Math.max((cols - 4) - listWidth - 2, 20);

  const selectedPreset = STATIC_PRESETS[selectedIndex];

  return (
    <Box flexDirection="row">
      {/* Left: preset list */}
      <Panel title={t('config.tabs.presets')} width={listWidth}>
        {confirmIndex !== null ? (
          <Box flexDirection="column">
            <Text color={colors.warning} bold>
              {t('config.confirm.preset').replace('{name}', STATIC_PRESETS[confirmIndex]?.name ?? '')}
            </Text>
            <Text dimColor>{t('config.presets.replaceWarning')}</Text>
          </Box>
        ) : (
          <ScrollableList
            items={STATIC_PRESETS}
            selectedIndex={selectedIndex}
            height={10}
            renderItem={(preset: PresetConfig, _i: number, isSelected: boolean) => (
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
      <Panel title={t('presets.preview')} width={detailWidth}>
        {selectedPreset ? (
          <Box flexDirection="column">
            <Text bold color={colors.primary}>{selectedPreset.name}</Text>
            <Text dimColor>{selectedPreset.description}</Text>
            <Box marginTop={1} flexDirection="column">
              <Box>
                <Text dimColor>{t('presets.reviewers').padEnd(14)}</Text>
                <Text>{selectedPreset.reviewerCount}</Text>
              </Box>
              <Box>
                <Text dimColor>{t('presets.providers').padEnd(14)}</Text>
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
                <Text dimColor>{'Discussion'.padEnd(14)}</Text>
                <Text>{selectedPreset.discussion ? 'Enabled' : 'Disabled'}</Text>
              </Box>
            </Box>
            {(() => {
              const missing = getMissingProviders(selectedPreset.providers);
              if (missing.length > 0) {
                return (
                  <Box marginTop={1}>
                    <Text color={colors.warning}>
                      {icons.cross} {t('presets.missingKeys').replace('{keys}', missing.join(', '))}
                    </Text>
                  </Box>
                );
              }
              return null;
            })()}
            <Box marginTop={1}>
              <Text dimColor>{t('presets.apply')}</Text>
            </Box>
          </Box>
        ) : null}
      </Panel>
    </Box>
  );
}
