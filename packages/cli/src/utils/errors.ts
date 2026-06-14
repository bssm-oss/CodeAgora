/**
 * Error classification and formatting for CLI output.
 */

import { statusColor, dim } from './colors.js';
import { t } from '@codeagora/shared/i18n/index.js';
import { redactSecrets } from '@codeagora/shared/utils/redaction.js';

export type CliExitCode = 1 | 2 | 3;

/**
 * Match an error message to a user-friendly hint.
 */
function getErrorHint(msg: string): string | undefined {
  if (msg.includes('Config file not found') || msg.includes('config.json')) {
    return t('error.configHint');
  }
  if ((msg.includes('API') || msg.includes('api')) && (msg.includes('key') || msg.includes('KEY'))) {
    return t('error.apiKeyHint');
  }
  if (msg.includes('forfeited') || msg.includes('Too many reviewers')) {
    return t('error.doctorHint');
  }
  if (msg.includes('ENOENT') || msg.includes('no such file') || msg.includes('not found')) {
    return t('error.pathHint');
  }
  if (msg.includes('parse error') || msg.includes('JSON') || msg.includes('YAML')) {
    return t('error.syntaxHint');
  }
  return undefined;
}

export function formatError(error: Error, verbose: boolean): string {
  const hint = getErrorHint(error.message);
  const lines: string[] = [];
  lines.push(statusColor.fail(`Error: ${redactSecrets(error.message)}`));
  if (hint) {
    lines.push(dim(`Hint: ${hint}`));
  }
  if (verbose) {
    lines.push('');
    lines.push(dim(redactSecrets(error.stack ?? '')));
  }
  return lines.join('\n');
}

/**
 * Deterministic CLI exit code classification for agent/CI consumers.
 *
 * 1: review completed but policy gate failed
 * 2: setup/input/config problem that requires user action
 * 3: runtime failure that may be transient
 */
export function classifyCliErrorExitCode(error: Error): CliExitCode {
  const msg = error.message.toLowerCase();
  if (
    msg.includes('provider/api failures') ||
    msg.includes('all reviewers failed') ||
    msg.includes('forfeited or errored') ||
    msg.includes('reviewer timed out') ||
    msg.includes('pipeline timed out')
  ) {
    return 3;
  }
  if (
    msg.includes('config') ||
    msg.includes('invalid output format') ||
    msg.includes('requires --pr') ||
    msg.includes('diff') ||
    msg.includes('path') ||
    msg.includes('not found') ||
    msg.includes('empty') ||
    msg.includes('syntax') ||
    msg.includes('json') ||
    msg.includes('yaml') ||
    msg.includes('api key') ||
    msg.includes('no-api-key') ||
    msg.includes('missing key') ||
    msg.includes('not set') ||
    msg.includes('credential') ||
    msg.includes('environment variable')
  ) {
    return 2;
  }
  return 3;
}
