import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Config, AgentConfig, ReviewerEntry } from '../../../types/config.js';
import { PROVIDER_ENV_VARS } from '../../../providers/env-vars.js';
import { ModelSelector } from '../../components/ModelSelector.js';
import type { SelectedModel } from '../../components/ModelSelector.js';

const PROVIDERS = Object.keys(PROVIDER_ENV_VARS);

function isAutoReviewer(entry: ReviewerEntry): boolean {
  return 'auto' in entry && entry.auto === true;
}

function isStaticReviewer(entry: ReviewerEntry): entry is AgentConfig {
  return !isAutoReviewer(entry);
}

interface AddFormState {
  step: 'provider' | 'model';
  providerIndex: number;
  model: string;
}

interface EditFormState {
  model: string;
  timeout: string;
}

interface ConfirmState {
  index: number;
}

interface Props {
  config: Config;
  isActive: boolean;
  onConfigChange: (newConfig: Config) => void;
}

export function ReviewersTab({ config, isActive, onConfigChange }: Props): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [addForm, setAddForm] = useState<AddFormState | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmState | null>(null);
  const [message, setMessage] = useState<string>('');
  const [showModelSelector, setShowModelSelector] = useState<'add' | 'edit' | null>(null);

  const reviewers = Array.isArray(config.reviewers) ? config.reviewers : [];
  const _staticReviewers = reviewers.filter(isStaticReviewer) as AgentConfig[];

  function showMessage(msg: string): void {
    setMessage(msg);
    setTimeout(() => setMessage(''), 1500);
  }

  function toggleEnabled(index: number): void {
    const entry = reviewers[index];
    if (!entry || isAutoReviewer(entry)) return;
    const agent = entry as AgentConfig;
    const updated = reviewers.map((r, i) =>
      i === index ? { ...agent, enabled: !agent.enabled } : r
    );
    onConfigChange({ ...config, reviewers: updated });
    showMessage('Saved ✓');
  }

  function deleteReviewer(index: number): void {
    const updated = reviewers.filter((_, i) => i !== index);
    if (updated.length === 0) {
      showMessage('Cannot delete — need at least 1 reviewer');
      return;
    }
    onConfigChange({ ...config, reviewers: updated });
    setSelectedIndex(Math.max(0, index - 1));
    setConfirmDelete(null);
    showMessage('Saved ✓');
  }

  function addReviewer(form: AddFormState): void {
    const provider = PROVIDERS[form.providerIndex] ?? 'groq';
    const id = `r${reviewers.length + 1}`;
    const newReviewer: AgentConfig = {
      id,
      model: form.model || 'llama-3.3-70b-versatile',
      backend: 'api',
      provider,
      enabled: true,
      timeout: 120,
    };
    onConfigChange({ ...config, reviewers: [...reviewers, newReviewer] });
    showMessage('Saved ✓');
  }

  function saveEdit(index: number, form: EditFormState): void {
    const entry = reviewers[index];
    if (!entry || isAutoReviewer(entry)) return;
    const agent = entry as AgentConfig;
    const timeout = parseInt(form.timeout, 10);
    const updated = reviewers.map((r, i) =>
      i === index
        ? { ...agent, model: form.model || agent.model, timeout: isNaN(timeout) ? agent.timeout : timeout }
        : r
    );
    onConfigChange({ ...config, reviewers: updated });
    setEditForm(null);
    showMessage('Saved ✓');
  }

  useInput((input, key) => {
    if (!isActive) return;

    // Confirm delete mode
    if (confirmDelete !== null) {
      if (input === 'y' || input === 'Y') {
        deleteReviewer(confirmDelete.index);
      } else if (input === 'n' || input === 'N' || key.escape) {
        setConfirmDelete(null);
      }
      return;
    }

    // Add form mode
    if (addForm !== null) {
      if (addForm.step === 'provider') {
        if (key.upArrow || input === 'k') {
          setAddForm(f => f ? { ...f, providerIndex: Math.max(0, f.providerIndex - 1) } : f);
        } else if (key.downArrow || input === 'j') {
          setAddForm(f => f ? { ...f, providerIndex: Math.min(PROVIDERS.length - 1, f.providerIndex + 1) } : f);
        } else if (key.return) {
          setAddForm(f => f ? { ...f, step: 'model' } : f);
        } else if (key.escape) {
          setAddForm(null);
        }
      } else {
        // model step
        if (key.return) {
          if (addForm.model.trim()) {
            addReviewer(addForm);
            setAddForm(null);
          } else {
            // Empty model input -> open model selector
            setShowModelSelector('add');
          }
        } else if (key.escape) {
          setAddForm(null);
        } else if (key.backspace || key.delete) {
          setAddForm(f => f ? { ...f, model: f.model.slice(0, -1) } : f);
        } else if (input) {
          setAddForm(f => f ? { ...f, model: f.model + input } : f);
        }
      }
      return;
    }

    // Edit form mode
    if (editForm !== null) {
      if (key.tab) {
        // toggle between model and timeout fields via simple state flag — not needed, single field at a time
      } else if (key.return) {
        saveEdit(selectedIndex, editForm);
      } else if (key.escape) {
        setEditForm(null);
      } else if (key.backspace || key.delete) {
        setEditForm(f => f ? { ...f, model: f.model.slice(0, -1) } : f);
      } else if (input) {
        setEditForm(f => f ? { ...f, model: f.model + input } : f);
      }
      return;
    }

    // Normal navigation
    if (key.upArrow || input === 'k') {
      setSelectedIndex(i => Math.max(0, i - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(i => Math.min(reviewers.length - 1, i + 1));
    } else if (input === ' ') {
      toggleEnabled(selectedIndex);
    } else if (input === 'd') {
      if (reviewers[selectedIndex] && !isAutoReviewer(reviewers[selectedIndex]!)) {
        setConfirmDelete({ index: selectedIndex });
      }
    } else if (input === 'a') {
      setAddForm({ step: 'provider', providerIndex: 0, model: '' });
    } else if (input === 'e') {
      const entry = reviewers[selectedIndex];
      if (entry && isStaticReviewer(entry)) {
        setEditForm({ model: entry.model, timeout: String(entry.timeout ?? 120) });
        setShowModelSelector('edit');
      }
    }
  });

  // Render model selector for add
  if (showModelSelector === 'add' && addForm !== null) {
    return (
      <ModelSelector
        source="all"
        onSelect={(model: SelectedModel) => {
          setAddForm(f => f ? { ...f, model: model.id.split('/').pop() ?? model.id } : f);
          setShowModelSelector(null);
          // Immediately add the reviewer
          const provider = PROVIDERS[addForm.providerIndex] ?? 'groq';
          const id = `r${reviewers.length + 1}`;
          const newReviewer: AgentConfig = {
            id,
            model: model.id.split('/').pop() ?? model.id,
            backend: 'api',
            provider,
            enabled: true,
            timeout: 120,
          };
          onConfigChange({ ...config, reviewers: [...reviewers, newReviewer] });
          setAddForm(null);
          showMessage('Saved \u2713');
        }}
        onCancel={() => {
          setShowModelSelector(null);
        }}
      />
    );
  }

  // Render model selector for edit
  if (showModelSelector === 'edit') {
    return (
      <ModelSelector
        source="all"
        onSelect={(model: SelectedModel) => {
          const entry = reviewers[selectedIndex];
          if (entry && isStaticReviewer(entry)) {
            const agent = entry as AgentConfig;
            const updated = reviewers.map((r, i) =>
              i === selectedIndex
                ? { ...agent, model: model.id.split('/').pop() ?? model.id }
                : r
            );
            onConfigChange({ ...config, reviewers: updated });
            showMessage('Saved \u2713');
          }
          setShowModelSelector(null);
          setEditForm(null);
        }}
        onCancel={() => {
          setShowModelSelector(null);
          setEditForm(null);
        }}
      />
    );
  }

  // Render confirm delete
  if (confirmDelete !== null) {
    const entry = reviewers[confirmDelete.index] as AgentConfig | undefined;
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="red">Delete reviewer &quot;{entry?.id}&quot;?</Text>
        <Text>Press <Text bold>y</Text> to confirm, <Text bold>n</Text> to cancel</Text>
      </Box>
    );
  }

  // Render add form
  if (addForm !== null) {
    if (addForm.step === 'provider') {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text bold>Select provider (j/k, Enter):</Text>
          {PROVIDERS.map((p, i) => (
            <Text key={p} color={i === addForm.providerIndex ? 'cyan' : undefined}>
              {i === addForm.providerIndex ? '> ' : '  '}{p}
            </Text>
          ))}
          <Text dimColor>Esc to cancel</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold>Model name (Enter to confirm, empty Enter to browse):</Text>
        <Text>&gt; {addForm.model}<Text color="cyan">_</Text></Text>
        <Text dimColor>Provider: {PROVIDERS[addForm.providerIndex]}  |  Esc to cancel</Text>
      </Box>
    );
  }

  // Render edit form
  if (editForm !== null) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold>Edit model (Enter to save):</Text>
        <Text>&gt; {editForm.model}<Text color="cyan">_</Text></Text>
        <Text dimColor>Esc to cancel</Text>
      </Box>
    );
  }

  if (!Array.isArray(config.reviewers)) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="yellow">Declarative reviewers config</Text>
        <Text>count: {(config.reviewers as { count: number }).count}</Text>
        <Text dimColor>Edit .ca/config.json directly to change declarative settings.</Text>
      </Box>
    );
  }

  if (reviewers.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>No reviewers. Press <Text bold>a</Text> to add one.</Text>
        {message ? <Text color="green">{message}</Text> : null}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text dimColor>Space toggle  e edit  a add  d delete  j/k navigate</Text>
      {reviewers.map((entry, i) => {
        const selected = i === selectedIndex;
        const bg = selected ? 'blue' : undefined;
        if (isAutoReviewer(entry)) {
          return (
            <Box key={entry.id}>
              <Text backgroundColor={bg} color="yellow">
                {selected ? '> ' : '  '}{entry.id}{'  '}[Auto - L0 selects]{'  '}
                {entry.enabled ? <Text color="green">ON</Text> : <Text color="red">OFF</Text>}
              </Text>
            </Box>
          );
        }
        const agent = entry as AgentConfig;
        return (
          <Box key={agent.id}>
            <Text backgroundColor={bg}>
              {selected ? '> ' : '  '}{agent.id}{'  '}{agent.provider ?? ''}{'/'}{agent.model}{'  '}
              {agent.enabled ? <Text color="green">ON</Text> : <Text color="red">OFF</Text>}
            </Text>
          </Box>
        );
      })}
      {message ? <Text color="green">{message}</Text> : null}
    </Box>
  );
}
