import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Config, AgentConfig } from '@codeagora/core/types/config.js';
import { Panel } from '../../components/Panel.js';
import { ScrollableList } from '../../components/ScrollableList.js';
import { TextInput } from '../../components/TextInput.js';
import { colors, icons, statusIcon, statusColor, getTerminalSize } from '../../theme.js';
import { DetailRow } from '../../components/DetailRow.js';
import { t } from '@codeagora/shared/i18n/index.js';

// ============================================================================
// Types
// ============================================================================

type Mode = 'list' | 'edit-pick-count' | 'confirm-delete';

interface Props {
  config: Config;
  isActive: boolean;
  onConfigChange: (newConfig: Config) => void;
}

// ============================================================================
// Component
// ============================================================================

export function SupportersTab({ config, isActive, onConfigChange }: Props): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [pickCountInput, setPickCountInput] = useState('');

  const pool = config.supporters?.pool ?? [];
  const da = config.supporters?.devilsAdvocate ?? { id: 'da', model: '', backend: 'api' as const, provider: '', enabled: true, timeout: 120 };

  // Combined list: pool entries + DA
  const allItems: Array<{ agent: AgentConfig; isDA: boolean }> = [
    ...pool.map(s => ({ agent: s, isDA: false })),
    { agent: da, isDA: true },
  ];

  // ---- Actions ----

  function toggleItem(index: number): void {
    const item = allItems[index];
    if (!item) return;

    if (item.isDA) {
      onConfigChange({
        ...config,
        supporters: {
          ...config.supporters,
          devilsAdvocate: { ...da, enabled: !da.enabled },
        },
      });
    } else {
      const updated = pool.map((s, i) =>
        i === index ? { ...s, enabled: !s.enabled } : s
      );
      onConfigChange({ ...config, supporters: { ...config.supporters, pool: updated } });
    }
  }

  function deleteSupporter(index: number): void {
    if (index >= pool.length) return; // Can't delete DA
    const updated = pool.filter((_, i) => i !== index);
    onConfigChange({ ...config, supporters: { ...config.supporters, pool: updated } });
    setSelectedIndex(Math.max(0, index - 1));
    setMode('list');
  }

  function cyclePickStrategy(): void {
    const current = config.supporters.pickStrategy;
    const next = current === 'random' ? 'round-robin' : 'random';
    onConfigChange({
      ...config,
      supporters: { ...config.supporters, pickStrategy: next },
    });
  }

  function savePickCount(): void {
    const num = parseInt(pickCountInput, 10);
    if (!isNaN(num) && num >= 1) {
      onConfigChange({
        ...config,
        supporters: { ...config.supporters, pickCount: num },
      });
    }
    setMode('list');
  }

  // ---- Input ----

  useInput((input, key) => {
    if (!isActive) return;

    if (mode === 'confirm-delete') {
      if (input === 'y' || input === 'Y') {
        deleteSupporter(selectedIndex);
      } else {
        setMode('list');
      }
      return;
    }

    if (mode === 'edit-pick-count') {
      if (key.return) {
        savePickCount();
      } else if (key.escape) {
        setMode('list');
      } else if (key.backspace || key.delete) {
        setPickCountInput(s => s.slice(0, -1));
      } else if (input && /\d/.test(input)) {
        setPickCountInput(s => s + input);
      }
      return;
    }

    // List mode
    if (key.upArrow || input === 'k') {
      setSelectedIndex(i => Math.max(0, i - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(i => Math.min(allItems.length - 1, i + 1));
    } else if (input === ' ') {
      toggleItem(selectedIndex);
    } else if (input === 'd') {
      const item = allItems[selectedIndex];
      if (item && !item.isDA && pool.length > 1) {
        setMode('confirm-delete');
      }
    } else if (input === 'p') {
      setPickCountInput(String(config.supporters.pickCount));
      setMode('edit-pick-count');
    } else if (input === 's') {
      cyclePickStrategy();
    }
  });

  const { cols, rows } = getTerminalSize();
  const listWidth = Math.max(Math.floor((cols - 4) * 0.4), 20);
  const detailWidth = Math.max((cols - 4) - listWidth - 2, 20);

  const selectedItem = allItems[selectedIndex];

  return (
    <Box flexDirection="row">
      {/* Left panel */}
      <Panel title={`${t('config.tabs.supporters')} (${pool.length})`} width={listWidth}>
        <ScrollableList
          items={allItems}
          selectedIndex={selectedIndex}
          height={Math.max(rows - 8, 6)}
          renderItem={(item, _i, isSelected) => {
            const enabled = item.agent.enabled ?? true;
            return (
              <Text color={isSelected ? colors.selection.bg : undefined} bold={isSelected}>
                {statusIcon(enabled)} {item.agent.id}
                {'  '}
                {item.isDA
                  ? <Text color={colors.accent}>[DA]</Text>
                  : <Text dimColor>{item.agent.provider}/{item.agent.model?.slice(0, 16)}</Text>
                }
              </Text>
            );
          }}
        />
      </Panel>

      {/* Right panel */}
      <Panel title={t('config.detail.title')} width={detailWidth}>
        {mode === 'confirm-delete' && selectedItem ? (
          <Text color={colors.error} bold>
            {t('config.confirm.delete').replace('{id}', selectedItem.agent.id)}
          </Text>
        ) : mode === 'edit-pick-count' ? (
          <Box flexDirection="column">
            <Text bold>{t('config.pool.pickCount')}</Text>
            <TextInput value={pickCountInput} isActive={true} />
            <Text dimColor>{t('config.edit.save')}  {t('config.edit.cancel')}</Text>
          </Box>
        ) : selectedItem ? (
          <Box flexDirection="column">
            <DetailRow label={t('config.detail.id')} value={selectedItem.agent.id} labelWidth={14} />
            <DetailRow label={t('config.detail.provider')} value={selectedItem.agent.provider ?? t('config.detail.none')} labelWidth={14} />
            <DetailRow label={t('config.detail.model')} value={selectedItem.agent.model} highlight labelWidth={14} />
            <DetailRow label={t('config.detail.backend')} value={selectedItem.agent.backend} labelWidth={14} />
            <DetailRow label={t('config.detail.timeout')} value={`${selectedItem.agent.timeout ?? 120}s`} labelWidth={14} />
            <DetailRow label={t('config.detail.status')} value={(selectedItem.agent.enabled ?? true) ? t('config.detail.enabled') : t('config.detail.disabled')} color={statusColor(selectedItem.agent.enabled ?? true)} labelWidth={14} />
            {selectedItem.isDA ? (
              <DetailRow label="Role" value={t('config.pool.devilsAdvocate')} labelWidth={14} />
            ) : null}

            <Box marginTop={1} flexDirection="column">
              <Text dimColor bold>{icons.separator} {t('config.supporter.poolSettings')}</Text>
              <DetailRow label={t('config.pool.pickCount')} value={String(config.supporters.pickCount)} labelWidth={14} />
              <DetailRow label={t('config.pool.pickStrategy')} value={config.supporters.pickStrategy} labelWidth={14} />
            </Box>

            <Box marginTop={1}>
              <Text dimColor>{t('config.supporter.hints')}</Text>
            </Box>
          </Box>
        ) : (
          <Text dimColor>{t('config.supporter.noSelected')}</Text>
        )}
      </Panel>
    </Box>
  );
}

