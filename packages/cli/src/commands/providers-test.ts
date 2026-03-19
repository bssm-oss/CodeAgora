/**
 * Providers Test Command
 * Verify API key status for all known providers.
 */

import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';
import { bold, statusColor, dim } from '../utils/colors.js';
import { t } from '@codeagora/shared/i18n/index.js';

// ============================================================================
// Types
// ============================================================================

export interface ProviderTestResult {
  name: string;
  envVar: string;
  status: 'set' | 'missing' | 'unusual';
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Basic format validation for common API key patterns.
 * Returns true if the key looks like a plausible API key.
 */
function looksLikeApiKey(value: string): boolean {
  // Most API keys are at least 20 chars and alphanumeric with dashes/underscores
  if (value.length < 10) return false;
  if (/\s/.test(value)) return false;
  return true;
}

// ============================================================================
// Public API
// ============================================================================

export function testProviders(): ProviderTestResult[] {
  const results: ProviderTestResult[] = [];

  for (const [name, envVar] of Object.entries(PROVIDER_ENV_VARS)) {
    const value = process.env[envVar];
    if (!value) {
      results.push({ name, envVar, status: 'missing' });
    } else if (!looksLikeApiKey(value)) {
      results.push({ name, envVar, status: 'unusual' });
    } else {
      results.push({ name, envVar, status: 'set' });
    }
  }

  return results;
}

export function formatProviderTestResults(results: ProviderTestResult[]): string {
  const COL_PROVIDER = 18;
  const COL_KEY = 24;

  const lines: string[] = [];
  lines.push(bold(t('cli.providers.test.title')));
  lines.push('\u2500'.repeat(COL_PROVIDER + COL_KEY + 12));

  for (const r of results) {
    const nameCol = r.name.padEnd(COL_PROVIDER);
    const envCol = r.envVar.padEnd(COL_KEY);

    if (r.status === 'set') {
      lines.push(`  ${statusColor.pass('\u2713')} ${bold(nameCol)} ${dim(envCol)} ${statusColor.pass('key set')}`);
    } else if (r.status === 'unusual') {
      lines.push(`  ${statusColor.warn('?')} ${bold(nameCol)} ${dim(envCol)} ${statusColor.warn('key format unusual')}`);
    } else {
      lines.push(`  ${statusColor.fail('\u2717')} ${bold(nameCol)} ${dim(envCol)} ${statusColor.fail('key missing')}`);
    }
  }

  const setCount = results.filter((r) => r.status === 'set').length;
  const unusualCount = results.filter((r) => r.status === 'unusual').length;
  const missingCount = results.filter((r) => r.status === 'missing').length;

  lines.push('');
  lines.push(
    `${statusColor.pass(String(setCount))} set, ` +
    `${statusColor.warn(String(unusualCount))} unusual, ` +
    `${statusColor.fail(String(missingCount))} missing`,
  );

  return lines.join('\n');
}
