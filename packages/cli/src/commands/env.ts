/**
 * Environment credential commands.
 */

import { getCredentialsPath, saveCredential } from '@codeagora/core/config/credentials.js';
import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';
import { dim, statusColor } from '../utils/colors.js';
import { parseCredentialInput } from '../utils/inline-setup.js';

export interface EnvCredentialStatus {
  provider: string;
  envVar: string;
  isSet: boolean;
}

export interface EnvSetResult {
  provider: string;
  envVar: string;
  credentialsPath: string;
}

function looksLikeEnvVar(input: string): boolean {
  return /^[A-Z][A-Z0-9_]*_API_KEY$/.test(input.trim());
}

export function listEnvironmentCredentials(): EnvCredentialStatus[] {
  return Object.entries(PROVIDER_ENV_VARS)
    .map(([provider, envVar]) => ({
      provider,
      envVar,
      isSet: Boolean(process.env[envVar]),
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

export async function setEnvironmentCredential(target: string, value: string): Promise<EnvSetResult> {
  const trimmedTarget = target.trim();
  const trimmedValue = value.trim();
  if (!trimmedTarget) {
    throw new Error('Provider or ENV_VAR is required. Example: agora env set openrouter sk-or-...');
  }
  if (!trimmedValue) {
    throw new Error('API key is required. Example: agora env set openrouter sk-or-...');
  }

  const input = looksLikeEnvVar(trimmedTarget) && !trimmedValue.includes('=')
    ? `${trimmedTarget}=${trimmedValue}`
    : trimmedValue;
  const credential = parseCredentialInput(input, trimmedTarget);

  await saveCredential(credential.envVar, credential.key);
  process.env[credential.envVar] = credential.key;

  return {
    provider: credential.provider,
    envVar: credential.envVar,
    credentialsPath: getCredentialsPath(),
  };
}

export function formatEnvironmentCredentials(statuses: EnvCredentialStatus[]): string {
  const lines: string[] = [];
  lines.push('CodeAgora env');
  lines.push('=============');
  lines.push('');
  lines.push(`${'Provider'.padEnd(14)} ${'ENV'.padEnd(22)} Status`);
  lines.push(`${'─'.repeat(14)} ${'─'.repeat(22)} ${'─'.repeat(10)}`);
  for (const status of statuses) {
    const marker = status.isSet ? statusColor.pass('✓ set') : statusColor.fail('✗ missing');
    lines.push(`${status.provider.padEnd(14)} ${status.envVar.padEnd(22)} ${marker}`);
  }
  lines.push('');
  lines.push(`Credential store: ${dim(getCredentialsPath())}`);
  lines.push('Set a key: agora env set openrouter <api-key>');
  lines.push('Then run: agora doctor --live');
  return lines.join('\n');
}

export function formatEnvSetResult(result: EnvSetResult): string {
  return [
    `${statusColor.pass('✓')} Saved ${result.envVar} for ${result.provider}`,
    `Credential store: ${dim(result.credentialsPath)}`,
    'Next: agora doctor --live',
  ].join('\n');
}
