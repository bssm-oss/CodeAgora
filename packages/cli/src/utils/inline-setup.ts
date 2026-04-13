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
  name: string;
  envVar: string;
  speed: string;
  signupUrl: string;
  free: boolean;
}

const FREE_PROVIDERS: ProviderInfo[] = [
  { name: 'Groq', envVar: 'GROQ_API_KEY', speed: '\u26A1 fastest', signupUrl: 'console.groq.com/keys', free: true },
  { name: 'Cerebras', envVar: 'CEREBRAS_API_KEY', speed: '\u26A1 very fast', signupUrl: 'cloud.cerebras.ai', free: true },
  { name: 'GitHub Models', envVar: 'GITHUB_TOKEN', speed: '\uD83D\uDD35 moderate', signupUrl: '(uses GITHUB_TOKEN)', free: true },
  { name: 'NVIDIA NIM', envVar: 'NVIDIA_API_KEY', speed: '\uD83D\uDD35 moderate', signupUrl: 'build.nvidia.com', free: true },
];

const PAID_PROVIDERS: ProviderInfo[] = [
  { name: 'OpenAI', envVar: 'OPENAI_API_KEY', speed: 'gpt-4o', signupUrl: 'platform.openai.com/api-keys', free: false },
  { name: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', speed: 'claude-sonnet', signupUrl: 'console.anthropic.com/keys', free: false },
  { name: 'Google', envVar: 'GOOGLE_API_KEY', speed: 'gemini-2.5', signupUrl: 'aistudio.google.com/apikey', free: false },
];

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
  console.error('  Free providers (no credit card):');

  for (const p of FREE_PROVIDERS) {
    console.error(`  \u2726 ${p.name.padEnd(14)} ${p.speed.padEnd(16)} ${p.signupUrl}`);
  }
  console.error('');
  console.error('  Paid providers (better quality):');
  for (const p of PAID_PROVIDERS) {
    console.error(`  \u2726 ${p.name.padEnd(14)} ${p.speed.padEnd(16)} ${p.signupUrl}`);
  }
  console.error('');

  // Prompt for API key
  const key = await promptLine('  Paste your API key (Groq recommended): ');
  if (!key.trim()) {
    throw new Error('No API key provided. Run `agora init` for guided setup.');
  }

  // Detect provider from key prefix
  const provider = detectProviderFromKey(key.trim());
  const envVar = PROVIDER_ENV_VARS[provider] ?? `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;

  // Save credential
  await saveCredential(envVar, key.trim());
  process.env[envVar] = key.trim();
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

function detectProviderFromKey(key: string): string {
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('sk-')) return 'openai';
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('AI')) return 'google';
  if (key.startsWith('ghp_') || key.startsWith('gho_')) return 'github-models';
  if (key.startsWith('nvapi-')) return 'nvidia-nim';
  // Default to groq for unrecognized keys
  return 'groq';
}
