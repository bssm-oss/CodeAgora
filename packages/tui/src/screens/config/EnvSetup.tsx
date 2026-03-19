import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';
import { saveCredential, getCredentialsPath } from '@codeagora/core/config/credentials.js';
import { Panel } from '../../components/Panel.js';
import { ScrollableList } from '../../components/ScrollableList.js';
import { TextInput } from '../../components/TextInput.js';
import { Toast } from '../../components/Toast.js';
import { colors, icons, getTerminalSize } from '../../theme.js';
import { t } from '@codeagora/shared/i18n/index.js';
import {
  checkProviderHealth,
  checkAllProviderHealth,
  type HealthCheckResult,
} from '../../utils/provider-status.js';

// ============================================================================
// Types
// ============================================================================

type Step = 'provider' | 'key-input' | 'testing' | 'result' | 'bulk-testing' | 'bulk-result';

interface Props {
  onDone: () => void;
}

// ============================================================================
// Component
// ============================================================================

const PROVIDERS = Object.keys(PROVIDER_ENV_VARS);

export function EnvSetup({ onDone }: Props): React.JSX.Element {
  const [step, setStep] = useState<Step>('provider');
  const [providerIndex, setProviderIndex] = useState(0);
  const [keyInput, setKeyInput] = useState('');
  const [testResult, setTestResult] = useState<HealthCheckResult | null>(null);
  const [bulkResults, setBulkResults] = useState<HealthCheckResult[]>([]);
  const [bulkProgress, setBulkProgress] = useState('');

  const selectedProvider = PROVIDERS[providerIndex] ?? 'groq';
  const envVarName = PROVIDER_ENV_VARS[selectedProvider] ?? `${selectedProvider.toUpperCase()}_API_KEY`;

  function startTest(provider: string): void {
    setStep('testing');
    checkProviderHealth(provider).then(result => {
      setTestResult(result);
      setStep('result');
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ provider, model: '', ok: false, latencyMs: null, error: msg.slice(0, 100) });
      setStep('result');
    });
  }

  function startBulkTest(): void {
    setStep('bulk-testing');
    setBulkResults([]);
    setBulkProgress('Starting...');
    checkAllProviderHealth((result, done, total) => {
      setBulkResults(prev => [...prev, result]);
      setBulkProgress(`${done}/${total} providers checked`);
    }).then(results => {
      setBulkResults(results);
      setStep('bulk-result');
    }).catch(() => {
      setStep('bulk-result');
    });
  }

  useInput((input, key) => {
    if (step === 'provider') {
      if (key.escape) { onDone(); return; }
      if (key.upArrow || input === 'k') {
        setProviderIndex(i => Math.max(0, i - 1));
      } else if (key.downArrow || input === 'j') {
        setProviderIndex(i => Math.min(PROVIDERS.length - 1, i + 1));
      } else if (key.return) {
        setKeyInput('');
        setStep('key-input');
      } else if (input === 'h') {
        // Quick health check for selected provider (without changing key)
        const hasKey = Boolean(process.env[envVarName]);
        if (hasKey) {
          startTest(selectedProvider);
        }
      } else if (input === 't') {
        // Bulk health check all configured providers
        startBulkTest();
      }
      return;
    }

    if (step === 'key-input') {
      if (key.escape) { setStep('provider'); setKeyInput(''); return; }
      if (key.return) {
        const trimmed = keyInput.trim().replace(/[\r\n]/g, '');
        if (!trimmed) return;
        if (trimmed.length > 500 || !/^[A-Za-z0-9_\-.]+$/.test(trimmed)) return;
        saveCredential(envVarName, trimmed);
        process.env[envVarName] = trimmed;
        startTest(selectedProvider);
        return;
      }
      if (key.backspace || key.delete) { setKeyInput(s => s.slice(0, -1)); return; }
      if (input && !key.return) {
        const clean = input.replace(/[\x00-\x1F\x7F]/g, '');
        if (clean) setKeyInput(s => s + clean);
      }
      return;
    }

    if (step === 'result') {
      if (input === 'r') {
        // Retry test
        startTest(selectedProvider);
      } else if (key.return || key.escape || input === 'q') {
        setStep('provider');
      }
      return;
    }

    if (step === 'bulk-result') {
      if (key.return || key.escape || input === 'q') {
        setStep('provider');
      }
    }
  });

  const { cols, rows } = getTerminalSize();
  const totalWidth = Math.max(cols - 4, 40);

  // ---- Provider selection ----
  if (step === 'provider') {
    return (
      <Panel title={`${t('config.tabs.apiKeys')} — ${t('config.apiKeys.selectProvider')}`} width={totalWidth}>
        <ScrollableList
          items={PROVIDERS}
          selectedIndex={providerIndex}
          height={Math.max(rows - 10, 8)}
          renderItem={(p, _i, isSelected) => {
            const envVar = PROVIDER_ENV_VARS[p] ?? '';
            const hasKey = Boolean(process.env[envVar]);
            return (
              <Text color={isSelected ? colors.selection.bg : undefined} bold={isSelected}>
                {p}
                <Text dimColor> ({envVar})</Text>
                {hasKey
                  ? <Text color={colors.success}> {icons.check}</Text>
                  : <Text color={colors.error}> {icons.cross}</Text>
                }
              </Text>
            );
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>{t('config.apiKeys.enterHints')}</Text>
        </Box>
      </Panel>
    );
  }

  // ---- Key input ----
  if (step === 'key-input') {
    return (
      <Panel title={`${t('config.tabs.apiKeys')} — ${selectedProvider}`} width={totalWidth}>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>{envVarName}:</Text>
          <TextInput value={keyInput} mask={true} isActive={true} />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>{t('config.apiKeys.saveHints')}</Text>
        </Box>
      </Panel>
    );
  }

  // ---- Testing single ----
  if (step === 'testing') {
    return (
      <Panel title={`${t('config.tabs.apiKeys')} — ${selectedProvider}`} width={totalWidth}>
        <Text color={colors.warning}>{t('config.apiKeys.testingConnection')}</Text>
      </Panel>
    );
  }

  // ---- Single result (with retry) ----
  if (step === 'result') {
    return (
      <Panel title={`${t('config.tabs.apiKeys')} — ${selectedProvider}`} width={totalWidth}>
        {testResult?.ok ? (
          <Text color={colors.success}>
            {icons.check} {t('config.apiKeys.connected').replace('{provider}', testResult.provider).replace('{latency}', String(testResult.latencyMs))}
          </Text>
        ) : (
          <Box flexDirection="column">
            <Text color={colors.error}>
              {icons.cross} {testResult?.error ?? t('config.apiKeys.failed')}
            </Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>{getCredentialsPath()}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>{t('config.apiKeys.retryHints')}</Text>
        </Box>
      </Panel>
    );
  }

  // ---- Bulk testing ----
  if (step === 'bulk-testing') {
    return (
      <Panel title={`${t('config.tabs.apiKeys')} — ${t('config.apiKeys.healthCheckAll')}`} width={totalWidth}>
        <Text color={colors.warning}>{t('config.apiKeys.testingAll')} {bulkProgress}</Text>
        <Box marginTop={1} flexDirection="column">
          {bulkResults.map(r => (
            <Box key={r.provider}>
              <Text color={r.ok ? colors.success : colors.error}>
                {r.ok ? icons.check : icons.cross}
              </Text>
              <Text> {r.provider.padEnd(16)}</Text>
              {r.ok
                ? <Text dimColor>{r.latencyMs}ms</Text>
                : <Text color={colors.error}>{r.error?.slice(0, 50)}</Text>
              }
            </Box>
          ))}
        </Box>
      </Panel>
    );
  }

  // ---- Bulk results ----
  return (
    <Panel title={`${t('config.tabs.apiKeys')} — ${t('config.apiKeys.healthCheckResults')}`} width={totalWidth}>
      <Box flexDirection="column">
        {bulkResults.map(r => (
          <Box key={r.provider}>
            <Text color={r.ok ? colors.success : colors.error}>
              {r.ok ? icons.check : icons.cross}
            </Text>
            <Text> {r.provider.padEnd(16)}</Text>
            {r.ok
              ? <Text dimColor>{r.latencyMs}ms</Text>
              : <Text color={colors.error}>{r.error?.slice(0, 50)}</Text>
            }
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Toast
          message={t('config.apiKeys.healthSummary').replace('{ok}', String(bulkResults.filter(r => r.ok).length)).replace('{total}', String(bulkResults.length))}
          type={bulkResults.every(r => r.ok) ? 'success' : 'error'}
          visible={true}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{t('config.apiKeys.continueHints')}</Text>
      </Box>
    </Panel>
  );
}
