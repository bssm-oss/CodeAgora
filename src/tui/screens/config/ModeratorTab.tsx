import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Config } from '../../../types/config.js';

interface Props {
  config: Config;
  isActive: boolean;
  onConfigChange: (newConfig: Config) => void;
}

export function ModeratorTab({ config, isActive, onConfigChange }: Props): React.JSX.Element {
  const [editMode, setEditMode] = useState(false);
  const [editModel, setEditModel] = useState('');
  const [message, setMessage] = useState('');

  const mod = config.moderator;

  function showMessage(msg: string): void {
    setMessage(msg);
    setTimeout(() => setMessage(''), 1500);
  }

  function saveEdit(): void {
    onConfigChange({
      ...config,
      moderator: { ...mod, model: editModel || mod.model },
    });
    setEditMode(false);
    showMessage('Saved ✓');
  }

  useInput((input, key) => {
    if (!isActive) return;

    if (editMode) {
      if (key.return) {
        saveEdit();
      } else if (key.escape) {
        setEditMode(false);
      } else if (key.backspace || key.delete) {
        setEditModel(m => m.slice(0, -1));
      } else if (input) {
        setEditModel(m => m + input);
      }
    } else {
      if (input === 'e') {
        setEditModel(mod.model);
        setEditMode(true);
      }
    }
  });

  if (editMode) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold>Edit moderator model (Enter to save):</Text>
        <Text>&gt; {editModel}<Text color="cyan">_</Text></Text>
        <Text dimColor>Current: {mod.model}  |  Esc to cancel</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Moderator</Text>
      <Text>Provider: <Text color="cyan">{mod.provider ?? '(none)'}</Text></Text>
      <Text>Model:    <Text color="cyan">{mod.model}</Text></Text>
      <Text>Backend:  <Text color="cyan">{mod.backend}</Text></Text>
      <Text dimColor>Press <Text bold>e</Text> to edit model</Text>
      {message ? <Text color="green">{message}</Text> : null}
    </Box>
  );
}
