/**
 * Error classification and formatting for CLI output.
 */

import { statusColor, dim } from './colors.js';
import { t } from '@codeagora/shared/i18n/index.js';

export interface CliError {
  message: string;
  hint?: string;
  exitCode: number; // 2=config/setup, 3=runtime
}

export function classifyError(error: Error): CliError {
  const msg = error.message;

  // Config not found
  if (msg.includes('Config file not found') || msg.includes('config.json')) {
    return { message: msg, hint: t('error.configHint'), exitCode: 2 };
  }
  // API key issues
  if ((msg.includes('API') || msg.includes('api')) && (msg.includes('key') || msg.includes('KEY'))) {
    return { message: msg, hint: t('error.apiKeyHint'), exitCode: 2 };
  }
  // Reviewer failures
  if (msg.includes('forfeited') || msg.includes('Too many reviewers')) {
    return { message: msg, hint: t('error.doctorHint'), exitCode: 3 };
  }
  // File not found
  if (msg.includes('ENOENT') || msg.includes('no such file') || msg.includes('not found')) {
    return { message: msg, hint: t('error.pathHint'), exitCode: 3 };
  }
  // YAML/JSON parse errors
  if (msg.includes('parse error') || msg.includes('JSON') || msg.includes('YAML')) {
    return { message: msg, hint: t('error.syntaxHint'), exitCode: 2 };
  }
  // Default
  return { message: msg, exitCode: 3 };
}

export function formatError(error: Error, verbose: boolean): string {
  const classified = classifyError(error);
  const lines: string[] = [];
  lines.push(statusColor.fail(`Error: ${classified.message}`));
  if (classified.hint) {
    lines.push(dim(`Hint: ${classified.hint}`));
  }
  if (verbose) {
    lines.push('');
    lines.push(dim(error.stack ?? ''));
  }
  return lines.join('\n');
}
