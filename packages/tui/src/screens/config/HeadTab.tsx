import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Config } from '@codeagora/core/types/config.js';
import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';
import { Panel } from '../../components/Panel.js';
import { TextInput } from '../../components/TextInput.js';
import { colors, icons, getTerminalSize } from '../../theme.js';
import { DetailRow } from '../../components/DetailRow.js';

const PROVIDERS = Object.keys(PROVIDER_ENV_VARS);
const BACKENDS = ['api', 'opencode', 'codex', 'gemini', 'claude', 'copilot'] as const;
const EDIT_FIELDS = ['provider', 'model', 'backend', 'timeout'] as const;

interface Props {
  config: Config;
  isActive: boolean;
  onConfigChange: (newConfig: Config) => void;
}

export function HeadTab({ config, isActive, onConfigChange }: Props): React.JSX.Element {
  const [editMode, setEditMode] = useState(false);
  const [editProvider, setEditProvider] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editBackend, setEditBackend] = useState('');
  const [editTimeout, setEditTimeout] = useState('');
  const [activeField, setActiveField] = useState(0);
  const [validationError, setValidationError] = useState('');

  const head = config.head ?? { model: '', backend: 'api' as const, provider: '', timeout: 120, enabled: true };

  function startEdit(): void {
    setEditProvider(head.provider ?? '');
    setEditModel(head.model ?? '');
    setEditBackend(head.backend ?? 'api');
    setEditTimeout(String(head.timeout ?? 120));
    setActiveField(0);
    setValidationError('');
    setEditMode(true);
  }

  function toggleEnabled(): void {
    onConfigChange({
      ...config,
      head: { ...head, enabled: !head.enabled },
    });
  }

  function saveEdit(): void {
    const timeout = parseInt(editTimeout, 10);
    const trimmedModel = (editModel || head.model || '').trim();
    
    // Validate model name is not empty before saving
    if (!trimmedModel) {
      setValidationError('Model name cannot be empty');
      return;
    }
    setValidationError('');
    
    onConfigChange({
      ...config,
      head: {
        ...head,
        provider: editProvider || head.provider,
        model: trimmedModel,
        backend: editBackend as typeof head.backend || head.backend,
        timeout: isNaN(timeout) ? 120 : timeout,
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
      // model and timeout — text input
      const setter = field === 'model' ? setEditModel : setEditTimeout;
      const value = field === 'model' ? editModel : editTimeout;
      if (key.backspace || key.delete) {
        setter(value.slice(0, -1));
      } else if (input) {
        const clean = input.replace(/[\x00-\x1F\x7F]/g, '');
        if (clean) setter(value + clean);
      }
      return;
    }

    if (input === 'e') startEdit();
    if (input === ' ') toggleEnabled();
  });

  const { cols } = getTerminalSize();
  const totalWidth = Math.max(cols - 4, 40);

  if (editMode) {
    return (
      <Panel title="Head (L3 Verdict) — Edit" width={totalWidth}>
        {EDIT_FIELDS.map((field, fi) => {
          const isActiveField = activeField === fi;
          const value = field === 'provider' ? editProvider
            : field === 'model' ? editModel
            : field === 'backend' ? editBackend
            : editTimeout;
          const isCycle = field === 'provider' || field === 'backend';
          return (
            <Box key={field}>
              <Text color={isActiveField ? colors.primary : colors.muted} bold={isActiveField}>
                {isActiveField ? icons.arrow : ' '} {field.padEnd(12)}
              </Text>
              {isCycle ? (
                <Text color={isActiveField ? colors.primary : undefined}>
                  {value}{isActiveField ? <Text dimColor> (arrows to cycle)</Text> : null}
                </Text>
              ) : (
                <TextInput value={value} isActive={isActiveField} />
              )}
            </Box>
          );
        })}
        {validationError ? (
          <Box marginTop={1}>
            <Text color={colors.error}>{icons.cross} {validationError}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <Text dimColor>Enter save  Esc cancel  Tab next field</Text>
        </Box>
      </Panel>
    );
  }

  return (
    <Panel title="Head (L3 Verdict)" width={totalWidth}>
      <DetailRow label="Enabled" value={head.enabled ? `${icons.check} Yes` : `${icons.cross} No`} />
      <DetailRow label="Provider" value={head.provider ?? 'none'} />
      <DetailRow label="Model" value={head.model} highlight />
      <DetailRow label="Backend" value={head.backend} />
      <DetailRow label="Timeout" value={`${head.timeout ?? 120}s`} />
      <Box marginTop={1}>
        <Text dimColor>[e] edit  [space] toggle enabled</Text>
      </Box>
    </Panel>
  );
}
