import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Config, AgentConfig, ReviewerEntry } from '@codeagora/core/types/config.js';
import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';
import { ModelSelector } from '../../components/ModelSelector.js';
import type { SelectedModel } from '../../components/ModelSelector.js';
import { Panel } from '../../components/Panel.js';
import { ScrollableList } from '../../components/ScrollableList.js';
import { TextInput } from '../../components/TextInput.js';
import { colors, icons, statusColor, statusIcon, getTerminalSize } from '../../theme.js';
import { DetailRow } from '../../components/DetailRow.js';
import { t } from '@codeagora/shared/i18n/index.js';
import { isProviderAvailable } from '../../utils/provider-status.js';

// ============================================================================
// Helpers
// ============================================================================

const PROVIDERS = Object.keys(PROVIDER_ENV_VARS);
const BACKENDS = ['api', 'opencode', 'codex', 'gemini', 'claude', 'copilot'] as const;

function isAutoReviewer(entry: ReviewerEntry): boolean {
  return 'auto' in entry && entry.auto === true;
}

function isStaticReviewer(entry: ReviewerEntry): entry is AgentConfig {
  return !isAutoReviewer(entry);
}

// ============================================================================
// Types
// ============================================================================

type Mode = 'list' | 'edit' | 'add-provider' | 'add-model' | 'model-selector' | 'confirm-delete';

interface EditState {
  provider: string;
  model: string;
  backend: string;
  timeout: string;
  persona: string;
  activeField: number;
}

const EDIT_FIELDS = ['provider', 'model', 'backend', 'timeout', 'persona'] as const;

interface Props {
  config: Config;
  isActive: boolean;
  onConfigChange: (newConfig: Config) => void;
}

// ============================================================================
// Component
// ============================================================================

export function ReviewersTab({ config, isActive, onConfigChange }: Props): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [editState, setEditState] = useState<EditState>({
    provider: '', model: '', backend: 'api', timeout: '120', persona: '', activeField: 0,
  });
  const [addProviderIndex, setAddProviderIndex] = useState(0);

  const reviewers = Array.isArray(config.reviewers) ? config.reviewers : [];

  // ---- Actions ----

  function toggleEnabled(index: number): void {
    const entry = reviewers[index];
    if (!entry || isAutoReviewer(entry)) return;
    const agent = entry as AgentConfig;
    const updated = reviewers.map((r, i) =>
      i === index ? { ...agent, enabled: !agent.enabled } : r
    );
    onConfigChange({ ...config, reviewers: updated });
  }

  function deleteReviewer(index: number): void {
    const updated = reviewers.filter((_, i) => i !== index);
    if (updated.length === 0) return;
    onConfigChange({ ...config, reviewers: updated });
    setSelectedIndex(Math.max(0, index - 1));
    setMode('list');
  }

  function startEdit(index: number): void {
    const entry = reviewers[index];
    if (!entry || isAutoReviewer(entry)) return;
    const agent = entry as AgentConfig;
    setEditState({
      provider: agent.provider ?? '',
      model: agent.model,
      backend: agent.backend,
      timeout: String(agent.timeout ?? 120),
      persona: agent.persona ?? '',
      activeField: 0,
    });
    setMode('edit');
  }

  function saveEdit(index: number): void {
    const entry = reviewers[index];
    if (!entry || isAutoReviewer(entry)) return;
    const agent = entry as AgentConfig;
    const timeout = parseInt(editState.timeout, 10);
    const updated = reviewers.map((r, i) =>
      i === index
        ? {
            ...agent,
            provider: editState.provider || agent.provider,
            model: editState.model || agent.model,
            backend: editState.backend as AgentConfig['backend'] || agent.backend,
            timeout: isNaN(timeout) ? agent.timeout : timeout,
            persona: editState.persona || undefined,
          }
        : r
    );
    onConfigChange({ ...config, reviewers: updated });
    setMode('list');
  }

  function nextReviewerId(current: ReviewerEntry[]): string {
    const nums = current.map(r => {
      const m = /^r(\d+)$/.exec(r.id);
      return m ? parseInt(m[1]!, 10) : 0;
    });
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `r${max + 1}`;
  }

  function addReviewer(provider: string, model: string): void {
    const id = nextReviewerId(reviewers);
    const newReviewer: AgentConfig = {
      id,
      model: model || 'llama-3.3-70b-versatile',
      backend: 'api',
      provider,
      enabled: true,
      timeout: 120,
    };
    onConfigChange({ ...config, reviewers: [...reviewers, newReviewer] });
    setSelectedIndex(reviewers.length);
    setMode('list');
  }

  // ---- Input handling ----

  useInput((input, key) => {
    if (!isActive) return;

    // ---- Confirm delete ----
    if (mode === 'confirm-delete') {
      if (input === 'y' || input === 'Y') {
        deleteReviewer(selectedIndex);
      } else {
        setMode('list');
      }
      return;
    }

    // ---- Add provider selection ----
    if (mode === 'add-provider') {
      if (key.upArrow || input === 'k') {
        setAddProviderIndex(i => Math.max(0, i - 1));
      } else if (key.downArrow || input === 'j') {
        setAddProviderIndex(i => Math.min(PROVIDERS.length - 1, i + 1));
      } else if (key.return) {
        setEditState(s => ({ ...s, model: '', provider: PROVIDERS[addProviderIndex] ?? 'groq' }));
        setMode('add-model');
      } else if (key.escape) {
        setMode('list');
      }
      return;
    }

    // ---- Add model input ----
    if (mode === 'add-model') {
      if (key.return) {
        if (editState.model.trim()) {
          addReviewer(editState.provider, editState.model.trim());
        } else {
          setMode('model-selector');
        }
      } else if (key.escape) {
        setMode('list');
      } else if (key.backspace || key.delete) {
        setEditState(s => ({ ...s, model: s.model.slice(0, -1) }));
      } else if (input) {
        const clean = input.replace(/[\x00-\x1F\x7F]/g, '');
        if (clean) setEditState(s => ({ ...s, model: s.model + clean }));
      }
      return;
    }

    // ---- Edit mode ----
    if (mode === 'edit') {
      if (key.return) {
        saveEdit(selectedIndex);
        return;
      }
      if (key.escape) {
        setMode('list');
        return;
      }
      if (key.tab) {
        setEditState(s => ({
          ...s,
          activeField: (s.activeField + 1) % EDIT_FIELDS.length,
        }));
        return;
      }

      const field = EDIT_FIELDS[editState.activeField]!;

      // Provider/backend: cycle with j/k
      if (field === 'provider') {
        if (key.upArrow || input === 'k') {
          const idx = PROVIDERS.indexOf(editState.provider);
          const prev = (idx - 1 + PROVIDERS.length) % PROVIDERS.length;
          setEditState(s => ({ ...s, provider: PROVIDERS[prev]! }));
        } else if (key.downArrow || input === 'j') {
          const idx = PROVIDERS.indexOf(editState.provider);
          const next = (idx + 1) % PROVIDERS.length;
          setEditState(s => ({ ...s, provider: PROVIDERS[next]! }));
        }
        return;
      }

      if (field === 'backend') {
        if (key.upArrow || input === 'k' || key.downArrow || input === 'j') {
          const idx = BACKENDS.indexOf(editState.backend as typeof BACKENDS[number]);
          const next = (idx + 1) % BACKENDS.length;
          setEditState(s => ({ ...s, backend: BACKENDS[next]! }));
        }
        return;
      }

      // Text fields: model, timeout, persona
      if (key.backspace || key.delete) {
        setEditState(s => ({ ...s, [field]: (s[field as keyof EditState] as string).slice(0, -1) }));
      } else if (input) {
        const clean = input.replace(/[\x00-\x1F\x7F]/g, '');
        if (clean) setEditState(s => ({ ...s, [field]: (s[field as keyof EditState] as string) + clean }));
      }
      return;
    }

    // ---- List mode ----
    if (key.upArrow || input === 'k') {
      setSelectedIndex(i => Math.max(0, i - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(i => Math.min(reviewers.length - 1, i + 1));
    } else if (input === ' ') {
      toggleEnabled(selectedIndex);
    } else if (input === 'e') {
      startEdit(selectedIndex);
    } else if (input === 'a') {
      setAddProviderIndex(0);
      setMode('add-provider');
    } else if (input === 'd') {
      if (reviewers.length > 1 && reviewers[selectedIndex] && !isAutoReviewer(reviewers[selectedIndex]!)) {
        setMode('confirm-delete');
      }
    } else if (input === 'c') {
      // Clone selected reviewer
      const entry = reviewers[selectedIndex];
      if (entry && isStaticReviewer(entry)) {
        const clone: AgentConfig = {
          ...entry,
          id: nextReviewerId(reviewers),
        };
        onConfigChange({ ...config, reviewers: [...reviewers, clone] });
        setSelectedIndex(reviewers.length);
      }
    }
  });

  // ---- Model selector ----
  if (mode === 'model-selector') {
    return (
      <ModelSelector
        source="all"
        provider={editState.provider}
        onSelect={(model: SelectedModel) => {
          addReviewer(editState.provider, model.id.split('/').pop() ?? model.id);
        }}
        onCancel={() => setMode('list')}
      />
    );
  }

  // ---- Declarative config ----
  if (!Array.isArray(config.reviewers)) {
    return (
      <Panel title={t('config.tabs.reviewers')}>
        <Text color={colors.warning}>{t('config.reviewer.declarative')}</Text>
        <Text>count: {(config.reviewers as { count: number }).count}</Text>
        <Text dimColor>{t('config.reviewer.declarativeHint')}</Text>
      </Panel>
    );
  }

  // ---- Empty ----
  if (reviewers.length === 0) {
    return (
      <Panel title={t('config.tabs.reviewers')}>
        <Text dimColor>{t('config.reviewer.noReviewers').replace('{key}', 'a')}</Text>
      </Panel>
    );
  }

  const { cols } = getTerminalSize();
  const listWidth = Math.max(Math.floor((cols - 4) * 0.4), 20);
  const detailWidth = Math.max((cols - 4) - listWidth - 2, 20);

  const selectedEntry = reviewers[selectedIndex];

  return (
    <Box flexDirection="row">
      {/* Left panel: reviewer list */}
      <Panel title={`${t('config.tabs.reviewers')} (${reviewers.length})`} width={listWidth}>
        <ScrollableList
          items={reviewers}
          selectedIndex={selectedIndex}
          height={Math.max(getTerminalSize().rows - 8, 6)}
          renderItem={(entry, _i, isSelected) => {
            const isAuto = isAutoReviewer(entry);
            const agent = isAuto ? null : (entry as AgentConfig);
            const enabled = entry.enabled ?? true;
            const providerOk = isAuto || (agent?.provider ? isProviderAvailable(agent.provider) : false);
            return (
              <Text
                color={isSelected ? colors.selection.bg : undefined}
                bold={isSelected}
              >
                {statusIcon(enabled)} {entry.id}
                {'  '}
                {isAuto
                  ? <Text color={colors.warning}>[Auto]</Text>
                  : <>
                      <Text color={providerOk ? undefined : colors.error} dimColor={providerOk}>
                        {agent?.provider}/{agent?.model?.slice(0, 18)}
                      </Text>
                      {!providerOk ? <Text color={colors.error}> {icons.cross}</Text> : null}
                    </>
                }
              </Text>
            );
          }}
        />
      </Panel>

      {/* Right panel: detail / edit / confirm */}
      <Panel title={t('config.detail.title')} width={detailWidth}>
        {mode === 'confirm-delete' && selectedEntry ? (
          <Box flexDirection="column">
            <Text color={colors.error} bold>
              {t('config.confirm.delete').replace('{id}', selectedEntry.id)}
            </Text>
          </Box>
        ) : mode === 'add-provider' ? (
          <Box flexDirection="column">
            <Text bold>{t('config.detail.provider')}</Text>
            <ScrollableList
              items={PROVIDERS}
              selectedIndex={addProviderIndex}
              height={Math.max(getTerminalSize().rows - 10, 6)}
              renderItem={(p, _i, isSel) => (
                <Text color={isSel ? colors.selection.bg : undefined} bold={isSel}>{p}</Text>
              )}
            />
            <Text dimColor>{t('config.provider.selectHint')}</Text>
          </Box>
        ) : mode === 'add-model' ? (
          <Box flexDirection="column">
            <Text bold>{t('config.detail.model')}</Text>
            <TextInput
              value={editState.model}
              placeholder={t('config.model.placeholder')}
              isActive={true}
            />
            <Text dimColor>{t('config.detail.provider')}: {editState.provider}  |  {t('config.edit.cancel')}</Text>
          </Box>
        ) : mode === 'edit' && selectedEntry && isStaticReviewer(selectedEntry) ? (
          <Box flexDirection="column">
            <Text bold color={colors.primary}>{t('config.help.edit')} {selectedEntry.id}</Text>
            <Box marginTop={1} flexDirection="column">
              {EDIT_FIELDS.map((field, fi) => {
                const isActiveField = editState.activeField === fi;
                const value = editState[field as keyof EditState] as string;
                const label = t(`config.detail.${field}`);
                const isCycleField = field === 'provider' || field === 'backend';
                return (
                  <Box key={field}>
                    <Text color={isActiveField ? colors.primary : colors.muted} bold={isActiveField}>
                      {isActiveField ? icons.arrow : ' '} {label.padEnd(10)}
                    </Text>
                    {isCycleField ? (
                      <Text color={isActiveField ? colors.primary : undefined}>
                        {value}
                        {isActiveField ? <Text dimColor> {t('config.edit.cycleHint')}</Text> : null}
                      </Text>
                    ) : (
                      <TextInput value={value} isActive={isActiveField} />
                    )}
                  </Box>
                );
              })}
            </Box>
            <Box marginTop={1}>
              <Text dimColor>{t('config.edit.hints')}</Text>
            </Box>
          </Box>
        ) : selectedEntry ? (
          <Box flexDirection="column">
            {renderDetailView(selectedEntry)}
            <Box marginTop={1}>
              <Text dimColor>
                {isAutoReviewer(selectedEntry)
                  ? t('config.reviewer.autoSelected')
                  : t('config.reviewer.hints')
                      .replace('{edit}', t('config.help.edit'))
                      .replace('{toggle}', t('config.help.toggle'))
                      .replace('{delete}', t('config.help.delete'))
                }
              </Text>
            </Box>
          </Box>
        ) : (
          <Text dimColor>{t('config.reviewer.noSelected')}</Text>
        )}
      </Panel>
    </Box>
  );
}

// ============================================================================
// Detail View
// ============================================================================

function renderDetailView(entry: ReviewerEntry): React.JSX.Element {
  const isAuto = 'auto' in entry && entry.auto === true;
  const enabled = entry.enabled ?? true;

  if (isAuto) {
    return (
      <Box flexDirection="column">
        <DetailRow label={t('config.detail.id')} value={entry.id} />
        <DetailRow label={t('config.detail.status')} value={enabled ? t('config.detail.enabled') : t('config.detail.disabled')} color={statusColor(enabled)} />
        <DetailRow label="Type" value="Auto (L0 Thompson Sampling)" />
      </Box>
    );
  }

  const agent = entry as AgentConfig;
  return (
    <Box flexDirection="column">
      <DetailRow label={t('config.detail.id')} value={agent.id} />
      <DetailRow label={t('config.detail.provider')} value={agent.provider ?? t('config.detail.none')} />
      <DetailRow label={t('config.detail.model')} value={agent.model} highlight />
      <DetailRow label={t('config.detail.backend')} value={agent.backend} />
      <DetailRow label={t('config.detail.timeout')} value={`${agent.timeout ?? 120}s`} />
      <DetailRow label={t('config.detail.persona')} value={agent.persona ?? t('config.detail.none')} />
      <DetailRow label={t('config.detail.status')} value={enabled ? t('config.detail.enabled') : t('config.detail.disabled')} color={statusColor(enabled)} />
      {agent.fallback ? (
        <DetailRow label={t('config.detail.fallback')} value={`${agent.fallback.provider ?? ''}/${agent.fallback.model}`} />
      ) : null}
    </Box>
  );
}

