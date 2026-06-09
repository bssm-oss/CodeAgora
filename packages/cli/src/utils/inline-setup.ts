/**
 * Inline Setup
 * Zero-config first run: detect providers, prompt for API key, create default config.
 */

import { createInterface } from 'readline';
import { saveCredential } from '@codeagora/core/config/credentials.js';
import { buildDefaultConfig } from '@codeagora/core/config/loader.js';
import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';
import { CA_ROOT } from '@codeagora/shared/utils/fs.js';
import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// Provider info
// ============================================================================

interface ProviderInfo {
  id: string;
  name: string;
  envVar: string;
  speed: string;
  signupUrl: string;
  category: 'recommended' | 'paid' | 'specialized';
  note: string;
}

const SETUP_PROVIDERS: ProviderInfo[] = [
  {
    id: 'groq',
    name: 'Groq',
    envVar: 'GROQ_API_KEY',
    speed: 'fast',
    signupUrl: 'console.groq.com/keys',
    category: 'recommended',
    note: 'recommended first key',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    envVar: 'OPENROUTER_API_KEY',
    speed: 'multi-model',
    signupUrl: 'openrouter.ai/settings/keys',
    category: 'paid',
    note: 'broad model access',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    speed: 'gpt-4o',
    signupUrl: 'platform.openai.com/api-keys',
    category: 'paid',
    note: 'flagship OpenAI models',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    speed: 'claude-haiku',
    signupUrl: 'console.anthropic.com/keys',
    category: 'paid',
    note: 'Claude models',
  },
  {
    id: 'opencode-go',
    name: 'OpenCode Go',
    envVar: 'OPENCODE_API_KEY',
    speed: 'coding',
    signupUrl: 'opencode.ai/auth',
    category: 'specialized',
    note: 'shared OpenCode key',
  },
  {
    id: 'opencode-zen',
    name: 'OpenCode Zen',
    envVar: 'OPENCODE_API_KEY',
    speed: 'curated',
    signupUrl: 'opencode.ai/auth',
    category: 'specialized',
    note: 'shared OpenCode key',
  },
];

const PROVIDER_ALIASES = new Map<string, string>();
SETUP_PROVIDERS.forEach((provider, index) => {
  for (const [alias, providerId] of [
    [String(index + 1), provider.id],
    [provider.id, provider.id],
    [provider.name.toLowerCase().replace(/\s+/g, '-'), provider.id],
    [provider.envVar.toLowerCase(), provider.id],
  ]) {
    PROVIDER_ALIASES.set(alias, providerId);
  }
});

// ============================================================================
// Detection
// ============================================================================

/**
 * Find the first available provider from environment variables.
 */
export function detectAvailableProvider(): { name: string; envVar: string } | null {
  for (const [provider, envVar] of Object.entries(PROVIDER_ENV_VARS)) {
    if (process.env[envVar]) {
      return { name: provider, envVar };
    }
  }
  return null;
}

// ============================================================================
// Inline setup flow
// ============================================================================

/**
 * Run inline setup when no config exists and no API keys are detected.
 * Prompts user for API key, saves it, creates default config.
 * Returns the provider name used.
 */
export async function runInlineSetup(baseDir: string): Promise<string> {
  console.error('');
  console.error('  CodeAgora \u2014 first run detected');
  console.error('');
  console.error('  Pick one review provider to start:');

  for (const p of SETUP_PROVIDERS) {
    const label = p.category === 'recommended' ? 'recommended' : p.category;
    const index = SETUP_PROVIDERS.indexOf(p) + 1;
    console.error(
      `  ${String(index).padStart(2)}. ${p.id.padEnd(12)} ${p.envVar.padEnd(20)} ${label.padEnd(11)} ${p.signupUrl}`
    );
  }
  console.error('');
  console.error('  Tip: you can paste either a raw key or ENV_VAR=value.');
  console.error('');

  const providerInput = await promptLine('  Provider [groq]: ');
  const preferredProvider = normalizeProviderInput(providerInput) ?? 'groq';

  // Prompt for API key
  const selected = getSetupProvider(preferredProvider);
  const key = await promptLine(`  Paste ${selected.envVar}: `);
  if (!key.trim()) {
    throw new Error('No API key provided. Run `agora init` for guided setup.');
  }

  const credential = parseCredentialInput(key.trim(), preferredProvider);
  const provider = credential.provider;
  const envVar = credential.envVar;

  // Save credential
  await saveCredential(envVar, credential.key);
  process.env[envVar] = credential.key;
  console.error(`  \u2713 Key saved to ~/.config/codeagora/credentials`);

  // Create default config
  const config = buildDefaultConfig(provider);
  const caDir = path.join(baseDir, CA_ROOT);
  await fs.mkdir(caDir, { recursive: true });
  await fs.writeFile(
    path.join(caDir, 'config.json'),
    JSON.stringify(config, null, 2),
    'utf-8',
  );
  console.error(`  \u2713 Default config created (.ca/config.json)`);
  console.error('');

  return provider;
}

// ============================================================================
// Helpers
// ============================================================================

function promptLine(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export interface ParsedCredentialInput {
  provider: string;
  envVar: string;
  key: string;
}

export function parseCredentialInput(input: string, preferredProvider = 'groq'): ParsedCredentialInput {
  const envAssignment = input.match(/^\s*([A-Z][A-Z0-9_]*_API_KEY)\s*=\s*(.+?)\s*$/);
  if (envAssignment) {
    const envVar = envAssignment[1];
    const key = envAssignment[2].trim();
    const preferred = normalizeProviderInput(preferredProvider);
    const preferredInfo = preferred ? getSetupProvider(preferred) : null;
    const provider = preferredInfo?.envVar === envVar
      ? preferredInfo.id
      : providerFromEnvVar(envVar) ?? preferred ?? detectProviderFromKey(key);
    return { provider, envVar, key };
  }

  const key = input.trim();
  const detected = detectProviderFromKey(key);
  const provider = detected === 'unknown' ? normalizeProviderInput(preferredProvider) ?? 'groq' : detected;
  const envVar = PROVIDER_ENV_VARS[provider] ?? `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;
  return { provider, envVar, key };
}

export function detectProviderFromKey(key: string): string {
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('sk-')) return 'openai';
  if (key.startsWith('oc_')) return 'opencode-go';
  return 'unknown';
}

function normalizeProviderInput(input: string): string | null {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, '-');
  if (!normalized) return null;
  return PROVIDER_ALIASES.get(normalized) ?? null;
}

function getSetupProvider(providerId: string): ProviderInfo {
  return SETUP_PROVIDERS.find((provider) => provider.id === providerId) ?? SETUP_PROVIDERS[0];
}

function providerFromEnvVar(envVar: string): string | null {
  const candidates = SETUP_PROVIDERS.filter((provider) => provider.envVar === envVar);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;
  return candidates.find((provider) => provider.id === 'opencode-go')?.id ?? candidates[0].id;
}
