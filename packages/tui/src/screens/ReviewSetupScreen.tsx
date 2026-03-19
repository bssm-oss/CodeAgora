import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import fs from 'fs';
import { loadConfigFrom } from '@codeagora/core/config/loader.js';
import { getEnabledReviewers } from '@codeagora/core/config/loader.js';
import type { AgentConfig } from '@codeagora/core/types/config.js';
import type { Screen } from '../hooks/useRouter.js';
import { colors } from '../theme.js';
import { t } from '@codeagora/shared/i18n/index.js';

// ============================================================================
// Types
// ============================================================================

type Step = 'diff-input' | 'config-check' | 'summary';

interface ReviewSetupScreenProps {
  onNavigate: (screen: Screen, params?: ReviewSetupParams) => void;
  onBack: () => void;
}

export interface ReviewSetupParams {
  diffPath: string;
  enabledReviewers: AgentConfig[];
}

// ============================================================================
// ReviewSetupScreen
// ============================================================================

export function ReviewSetupScreen({ onNavigate, onBack }: ReviewSetupScreenProps): React.JSX.Element {
  const [step, setStep] = useState<Step>('diff-input');
  const [diffInput, setDiffInput] = useState('');
  const [diffError, setDiffError] = useState('');
  const [configError, setConfigError] = useState('');
  const [reviewers, setReviewers] = useState<AgentConfig[]>([]);
  const [toggleStates, setToggleStates] = useState<boolean[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (step === 'diff-input') {
      handleDiffInput(input, key);
    } else if (step === 'config-check') {
      handleConfigInput(input, key);
    } else if (step === 'summary') {
      handleSummaryInput(input, key);
    }
  });

  function handleDiffInput(input: string, key: { return: boolean; backspace: boolean; delete: boolean; escape: boolean }): void {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.return) {
      submitDiffPath();
      return;
    }
    if (key.backspace || key.delete) {
      setDiffInput(prev => prev.slice(0, -1));
      setDiffError('');
      return;
    }
    if (input && !key.return) {
      setDiffInput(prev => prev + input);
      setDiffError('');
    }
  }

  function submitDiffPath(): void {
    const trimmed = diffInput.trim();
    if (!trimmed) {
      setDiffError('Path cannot be empty');
      return;
    }
    if (!fs.existsSync(trimmed)) {
      setDiffError(`File not found: ${trimmed}`);
      return;
    }
    setDiffError('');
    loadConfigAndAdvance();
  }

  function loadConfigAndAdvance(): void {
    loadConfigFrom(process.cwd())
      .then(config => {
        const enabled = getEnabledReviewers(config);
        setReviewers(enabled);
        setToggleStates(enabled.map(r => r.enabled));
        setSelectedIndex(0);
        setConfigError('');
        setStep('config-check');
      })
      .catch(() => {
        setReviewers([]);
        setToggleStates([]);
        setConfigError('no-config');
        setStep('config-check');
      });
  }

  function handleConfigInput(input: string, key: { return: boolean; upArrow: boolean; downArrow: boolean; escape: boolean }): void {
    if (configError === 'no-config') {
      if (key.escape || input === 'b' || input === 'q') {
        onBack();
      }
      return;
    }

    if (key.escape || input === 'b') {
      setStep('diff-input');
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(reviewers.length - 1, prev + 1));
      return;
    }

    if (input === ' ') {
      setToggleStates(prev => {
        const next = [...prev];
        next[selectedIndex] = !next[selectedIndex];
        return next;
      });
      return;
    }

    if (key.return) {
      setStep('summary');
    }
  }

  function handleSummaryInput(input: string, key: { return: boolean; escape: boolean }): void {
    if (key.escape || input === 'b') {
      setStep('config-check');
      return;
    }
    if (key.return) {
      const activeReviewers = reviewers.filter((_, i) => toggleStates[i]);
      onNavigate('pipeline', { diffPath: diffInput.trim(), enabledReviewers: activeReviewers });
    }
  }

  const enabledCount = toggleStates.filter(Boolean).length;

  if (step === 'diff-input') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>{t('review.setup.step').replace('{step}', '1').replace('{total}', '3')}</Text>
        <Box marginTop={1}>
          <Text>{t('review.setup.diffPath')}</Text>
          <Text color={colors.primary}>{diffInput}</Text>
          <Text color={colors.secondary}>_</Text>
        </Box>
        {diffError ? (
          <Box marginTop={1}>
            <Text color={colors.error}>{diffError}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <Text dimColor>{t('review.setup.continueHint')}</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'config-check') {
    if (configError === 'no-config') {
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold>{t('review.setup.step').replace('{step}', '2').replace('{total}', '3')}</Text>
          <Box marginTop={1}>
            <Text color={colors.warning}>{t('review.setup.noConfig')}</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>{t('review.setup.escBack')}</Text>
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>{t('review.setup.step').replace('{step}', '2').replace('{total}', '3')}</Text>
        <Box marginTop={1}>
          <Text>{t('review.setup.reviewers').replace('{enabled}', String(enabledCount)).replace('{total}', String(reviewers.length))}</Text>
        </Box>
        {reviewers.map((reviewer, i) => (
          <Box key={reviewer.id} marginLeft={2}>
            <Text color={i === selectedIndex ? colors.primary : undefined}>
              {i === selectedIndex ? '> ' : '  '}
              [{toggleStates[i] ? 'x' : ' '}] {reviewer.label ?? reviewer.id} ({reviewer.provider ?? reviewer.backend}/{reviewer.model})
            </Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text dimColor>{t('review.setup.navHint')}</Text>
        </Box>
      </Box>
    );
  }

  // step === 'summary'
  const activeReviewers = reviewers.filter((_, i) => toggleStates[i]);
  const providerSet = new Set(activeReviewers.map(r => r.provider ?? r.backend));
  const providerInfo = [...providerSet].join(', ') || 'none';

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>{t('review.setup.step').replace('{step}', '3').replace('{total}', '3')}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>{t('review.setup.diff')} <Text color={colors.primary}>{diffInput.trim()}</Text></Text>
        <Text>{t('review.setup.reviewerCount')} <Text color={colors.primary}>{enabledCount}</Text></Text>
        <Text>{t('review.setup.providers')} <Text color={colors.primary}>{providerInfo}</Text></Text>
      </Box>
      <Box marginTop={1}>
        <Text color={colors.success}>{t('review.setup.startButton')}</Text>
        <Text dimColor>{t('review.setup.startHint')}</Text>
      </Box>
    </Box>
  );
}
