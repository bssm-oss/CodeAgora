import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Config } from '@codeagora/core/types/config.js';
import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';
import { Panel } from '../../components/Panel.js';
import { TextInput } from '../../components/TextInput.js';
import { colors, icons, getTerminalSize } from '../../theme.js';
import { DetailRow } from '../../components/DetailRow.js';
import { t } from '@codeagora/shared/i18n/index.js';

const PROVIDERS = Object.keys(PROVIDER_ENV_VARS);
const BACKENDS = ['api', 'opencode', 'codex', 'gemini', 'claude', 'copilot'] as const;
const EDIT_FIELDS = ['provider', 'model', 'backend'] as const;

interface Props {
  config: Config;
  isActive: boolean;
  onConfigChange: (newConfig: Config) => void;
}

export function ModeratorTab({ config, isActive, onConfigChange }: Props): React.JSX.Element {
  const [editMode, setEditMode] = useState(false);
  const [editProvider, setEditProvider] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editBackend, setEditBackend] = useState('');
  const [activeField, setActiveField] = useState(0);

  const mod = config.moderator ?? { model: '', backend: 'api' as const, provider: '' };

  function startEdit(): void {
    setEditProvider(mod.provider ?? '');
    setEditModel(mod.model ?? '');
    setEditBackend(mod.backend ?? 'api');
    setActiveField(0);
    setEditMode(true);
  }

  function saveEdit(): void {
    onConfigChange({
      ...config,
      moderator: {
        ...mod,
        provider: editProvider || mod.provider,
        model: editModel || mod.model,
        backend: editBackend as typeof mod.backend || mod.backend,
      },
    });
    setEditMode(false);
  }

  useInput((input, key) => {
    if (!isActive) return;

    if (editMode) {
      if (key.return) { saveEdit(); return; }
      if (key.escape) { setEditMode(false); return; }
      if (key.tab) {
        setActiveField(f => (f + 1) % EDIT_FIELDS.length);
        return;
      }

      const field = EDIT_FIELDS[activeField]!;

      if (field === 'provider') {
        if (key.upArrow || input === 'k' || key.downArrow || input === 'j') {
          const idx = PROVIDERS.indexOf(editProvider);
          const next = (idx + (key.upArrow || input === 'k' ? -1 : 1) + PROVIDERS.length) % PROVIDERS.length;
          setEditProvider(PROVIDERS[next]!);
        }
        return;
      }
      if (field === 'backend') {
        if (key.upArrow || input === 'k' || key.downArrow || input === 'j') {
          const idx = BACKENDS.indexOf(editBackend as typeof BACKENDS[number]);
          const next = (idx + 1) % BACKENDS.length;
          setEditBackend(BACKENDS[next]!);
        }
        return;
      }
      // model field
      if (key.backspace || key.delete) {
        setEditModel(s => s.slice(0, -1));
      } else if (input) {
        const clean = input.replace(/[\x00-\x1F\x7F]/g, '');
        if (clean) setEditModel(s => s + clean);
      }
      return;
    }

    if (input === 'e') startEdit();
  });

  const { cols } = getTerminalSize();
  const totalWidth = Math.max(cols - 4, 40);

  if (editMode) {
    return (
      <Panel title={`${t('config.tabs.moderator')} — Edit`} width={totalWidth}>
        {EDIT_FIELDS.map((field, fi) => {
          const isActive = activeField === fi;
          const value = field === 'provider' ? editProvider : field === 'model' ? editModel : editBackend;
          const isCycle = field === 'provider' || field === 'backend';
          return (
            <Box key={field}>
              <Text color={isActive ? colors.primary : colors.muted} bold={isActive}>
                {isActive ? icons.arrow : ' '} {t(`config.detail.${field}`).padEnd(12)}
              </Text>
              {isCycle ? (
                <Text color={isActive ? colors.primary : undefined}>
                  {value}{isActive ? <Text dimColor> {t('config.edit.cycleHint')}</Text> : null}
                </Text>
              ) : (
                <TextInput value={value} isActive={isActive} />
              )}
            </Box>
          );
        })}
        <Box marginTop={1}>
          <Text dimColor>{t('config.edit.hints')}</Text>
        </Box>
      </Panel>
    );
  }

  return (
    <Panel title={t('config.tabs.moderator')} width={totalWidth}>
      <DetailRow label={t('config.detail.provider')} value={mod.provider ?? t('config.detail.none')} />
      <DetailRow label={t('config.detail.model')} value={mod.model} highlight />
      <DetailRow label={t('config.detail.backend')} value={mod.backend} />
      <Box marginTop={1}>
        <Text dimColor>[e] {t('config.help.edit')}</Text>
      </Box>
    </Panel>
  );
}

