import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Config } from '@codeagora/core/types/config.js';
import { Panel } from '../../components/Panel.js';
import { TextInput } from '../../components/TextInput.js';
import { colors, icons, getTerminalSize } from '../../theme.js';
import { DetailRow } from '../../components/DetailRow.js';

const SETTINGS_FIELDS = ['mode', 'language', 'maxRounds', 'codeSnippetRange', 'objectionTimeout', 'maxObjectionRounds'] as const;
type SettingsField = typeof SETTINGS_FIELDS[number];

interface Props {
  config: Config;
  isActive: boolean;
  onConfigChange: (newConfig: Config) => void;
}

export function SettingsTab({ config, isActive, onConfigChange }: Props): React.JSX.Element {
  const [editMode, setEditMode] = useState(false);
  const [activeField, setActiveField] = useState(0);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const mode = config.mode ?? 'pragmatic';
  const language = config.language ?? 'en';
  const disc = config.discussion ?? { maxRounds: 3, codeSnippetRange: 10, objectionTimeout: 60, maxObjectionRounds: 1, registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null } };

  function startEdit(): void {
    setEditValues({
      mode,
      language,
      maxRounds: String(disc.maxRounds),
      codeSnippetRange: String(disc.codeSnippetRange),
      objectionTimeout: String(disc.objectionTimeout ?? 60),
      maxObjectionRounds: String(disc.maxObjectionRounds ?? 1),
    });
    setActiveField(0);
    setEditMode(true);
  }

  function saveEdit(): void {
    onConfigChange({
      ...config,
      mode: editValues['mode'] as Config['mode'],
      language: editValues['language'] as Config['language'],
      discussion: {
        ...disc,
        maxRounds: parseInt(editValues['maxRounds'] ?? '3', 10) || 3,
        codeSnippetRange: parseInt(editValues['codeSnippetRange'] ?? '10', 10) || 10,
        objectionTimeout: parseInt(editValues['objectionTimeout'] ?? '60', 10) || 60,
        maxObjectionRounds: parseInt(editValues['maxObjectionRounds'] ?? '1', 10) || 1,
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
        setActiveField(f => (f + 1) % SETTINGS_FIELDS.length);
        return;
      }

      const field = SETTINGS_FIELDS[activeField]!;

      // Cycle fields
      if (field === 'mode') {
        if (key.upArrow || input === 'k' || key.downArrow || input === 'j') {
          setEditValues(v => ({ ...v, mode: v['mode'] === 'strict' ? 'pragmatic' : 'strict' }));
        }
        return;
      }
      if (field === 'language') {
        if (key.upArrow || input === 'k' || key.downArrow || input === 'j') {
          setEditValues(v => ({ ...v, language: v['language'] === 'en' ? 'ko' : 'en' }));
        }
        return;
      }

      // Numeric text fields
      const currentVal = editValues[field] ?? '';
      if (key.backspace || key.delete) {
        setEditValues(v => ({ ...v, [field]: currentVal.slice(0, -1) }));
      } else if (input && /\d/.test(input)) {
        setEditValues(v => ({ ...v, [field]: currentVal + input }));
      }
      return;
    }

    if (input === 'e') startEdit();
  });

  const { cols } = getTerminalSize();
  const totalWidth = Math.max(cols - 4, 40);

  const fieldLabels: Record<SettingsField, string> = {
    mode: 'Review Mode',
    language: 'Language',
    maxRounds: 'Max Rounds',
    codeSnippetRange: 'Code Snippet',
    objectionTimeout: 'Objection Timeout',
    maxObjectionRounds: 'Max Objections',
  };

  if (editMode) {
    return (
      <Panel title="Settings — Edit" width={totalWidth}>
        {SETTINGS_FIELDS.map((field, fi) => {
          const isActiveField = activeField === fi;
          const value = editValues[field] ?? '';
          const isCycle = field === 'mode' || field === 'language';
          return (
            <Box key={field}>
              <Text color={isActiveField ? colors.primary : colors.muted} bold={isActiveField}>
                {isActiveField ? icons.arrow : ' '} {fieldLabels[field].padEnd(20)}
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
        <Box marginTop={1}>
          <Text dimColor>Enter save  Esc cancel  Tab next field</Text>
        </Box>
      </Panel>
    );
  }

  return (
    <Panel title="Settings" width={totalWidth}>
      <DetailRow label="Review Mode" value={mode} highlight />
      <DetailRow label="Language" value={language === 'ko' ? 'Korean' : 'English'} />
      <Box marginTop={1}>
        <Text bold color={colors.primary}>Discussion</Text>
      </Box>
      <DetailRow label="Max Rounds" value={String(disc.maxRounds)} />
      <DetailRow label="Code Snippet" value={`±${disc.codeSnippetRange} lines`} />
      <DetailRow label="Objection Timeout" value={`${disc.objectionTimeout ?? 60}s`} />
      <DetailRow label="Max Objections" value={String(disc.maxObjectionRounds ?? 1)} />
      <Box marginTop={1}>
        <Text dimColor>[e] edit</Text>
      </Box>
    </Panel>
  );
}
