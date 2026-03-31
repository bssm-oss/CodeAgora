/**
 * Error classification and formatting for CLI output.
 */

import { statusColor, dim } from './colors.js';
import { t } from '@codeagora/shared/i18n/index.js';

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
  lines.push(statusColor.fail(`Error: ${error.message}`));
  if (hint) {
    lines.push(dim(`Hint: ${hint}`));
  }
  if (verbose) {
    lines.push('');
    lines.push(dim(error.stack ?? ''));
  }
  return lines.join('\n');
}
