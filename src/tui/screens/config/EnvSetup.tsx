import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { PROVIDER_ENV_VARS } from '../../../providers/env-vars.js';

// ============================================================================
// Types
// ============================================================================

type Step = 'provider' | 'key-input' | 'testing' | 'result';

interface Props {
  onDone: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function addEnvVar(key: string, value: string): void {
  const sanitized = value.replace(/[\r\n]/g, '');
  const envPath = path.join(process.cwd(), '.env');
  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
  const lines = existing.split('\n');
  const idx = lines.findIndex(l => l.startsWith(`${key}=`));
  if (idx >= 0) {
    lines[idx] = `${key}=${sanitized}`;
  } else {
    lines.push(`${key}=${sanitized}`);
  }
  writeFileSync(envPath, lines.filter((l, i) => i < lines.length - 1 || l !== '').join('\n') + '\n');
}

// ============================================================================
// Component
// ============================================================================

const PROVIDERS = Object.keys(PROVIDER_ENV_VARS);

export function EnvSetup({ onDone }: Props): React.JSX.Element {
  const [step, setStep] = useState<Step>('provider');
  const [providerIndex, setProviderIndex] = useState(0);
  const [keyInput, setKeyInput] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const selectedProvider = PROVIDERS[providerIndex] ?? 'groq';
  const envVarName = PROVIDER_ENV_VARS[selectedProvider] ?? `${selectedProvider.toUpperCase()}_API_KEY`;

  useInput((input, key) => {
    if (step === 'provider') {
      if (key.escape) {
        onDone();
        return;
      }
      if (key.upArrow || input === 'k') {
        setProviderIndex(i => Math.max(0, i - 1));
      } else if (key.downArrow || input === 'j') {
        setProviderIndex(i => Math.min(PROVIDERS.length - 1, i + 1));
      } else if (key.return) {
        setStep('key-input');
      }
      return;
    }

    if (step === 'key-input') {
      if (key.escape) {
        setStep('provider');
        setKeyInput('');
        return;
      }
      if (key.return) {
        if (!keyInput.trim()) return;
        // Save to .env
        addEnvVar(envVarName, keyInput.trim());
        // Set in current process for immediate use
        process.env[envVarName] = keyInput.trim();
        setStep('testing');
        // Run ping test asynchronously
        runPingTest(selectedProvider, keyInput.trim());
        return;
      }
      if (key.backspace || key.delete) {
        setKeyInput(s => s.slice(0, -1));
        return;
      }
      if (input && !key.return) {
        setKeyInput(s => s + input);
      }
      return;
    }

    if (step === 'result') {
      if (key.return || key.escape || input === 'q') {
        onDone();
      }
    }
  });

  async function runPingTest(provider: string, _apiKey: string): Promise<void> {
    const start = Date.now();
    try {
      // Dynamic import to avoid loading heavy deps at component load
      const { getModel } = await import('../../../l1/provider-registry.js');
      const { generateText } = await import('ai');

      // Pick a small/default model per provider for testing
      const testModels: Record<string, string> = {
        groq: 'llama-3.3-70b-versatile',
        'nvidia-nim': 'deepseek-r1',
        openrouter: 'google/gemini-2.5-flash',
        google: 'gemini-2.0-flash',
        mistral: 'mistral-large-latest',
        cerebras: 'llama-3.3-70b',
        together: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        xai: 'grok-2',
      };
      const model = testModels[provider] ?? 'llama-3.3-70b-versatile';
      const languageModel = getModel(provider, model);
      const abortSignal = AbortSignal.timeout(10_000);
      await generateText({ model: languageModel, prompt: 'Say OK', abortSignal });
      const latency = Date.now() - start;
      setTestResult({ ok: true, message: `${provider} connected (${latency}ms)` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, message: `Connection failed: ${msg.slice(0, 80)}` });
    }
    setStep('result');
  }

  if (step === 'provider') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold>API Key Setup</Text>
        <Text dimColor>Select a provider to configure:</Text>
        <Box marginTop={1} flexDirection="column">
          {PROVIDERS.map((p, i) => {
            const envVar = PROVIDER_ENV_VARS[p] ?? '';
            const hasKey = Boolean(process.env[envVar]);
            return (
              <Box key={p}>
                <Text color={i === providerIndex ? 'cyan' : undefined} bold={i === providerIndex}>
                  {i === providerIndex ? '> ' : '  '}{p}
                </Text>
                <Text dimColor> ({envVar})</Text>
                {hasKey && <Text color="green"> [set]</Text>}
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>j/k: navigate | Enter: select | Esc: back</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'key-input') {
    const masked = keyInput.length > 4
      ? '*'.repeat(keyInput.length - 4) + keyInput.slice(-4)
      : keyInput;
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold>API Key Setup - {selectedProvider}</Text>
        <Box marginTop={1}>
          <Text>{envVarName}: </Text>
          <Text color="cyan">{masked}</Text>
          <Text color="gray">_</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter: save and test | Esc: back</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'testing') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold>API Key Setup - {selectedProvider}</Text>
        <Box marginTop={1}>
          <Text color="yellow">Testing connection...</Text>
        </Box>
      </Box>
    );
  }

  // step === 'result'
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>API Key Setup - {selectedProvider}</Text>
      <Box marginTop={1}>
        {testResult?.ok ? (
          <Text color="green">{'\u2713'} {testResult.message}</Text>
        ) : (
          <Text color="red">{'\u2717'} {testResult?.message ?? 'Unknown error'}</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>.env updated with {envVarName}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Enter or Esc to continue</Text>
      </Box>
    </Box>
  );
}
