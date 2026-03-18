/**
 * Credentials Manager
 * Stores and loads API keys from ~/.config/codeagora/credentials
 * Similar to gh CLI (~/.config/gh/) and aws CLI (~/.aws/credentials).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'codeagora');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials');

/**
 * Load all credentials from ~/.config/codeagora/credentials
 * and set them as environment variables (if not already set).
 */
export function loadCredentials(): void {
  if (!existsSync(CREDENTIALS_PATH)) return;

  // Verify file permissions are 0o600 (owner read/write only)
  if (!checkFilePermissions(CREDENTIALS_PATH, 0o600)) {
    return;
  }

  const content = readFileSync(CREDENTIALS_PATH, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    // Don't override existing env vars
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

/**
 * Save a credential to ~/.config/codeagora/credentials.
 * Updates existing key or appends new one.
 */
export function saveCredential(key: string, value: string): void {
  mkdirSync(CONFIG_DIR, { recursive: true });

  const sanitized = value.replace(/[\r\n]/g, '');
  let lines: string[] = [];

  if (existsSync(CREDENTIALS_PATH)) {
    lines = readFileSync(CREDENTIALS_PATH, 'utf-8').split('\n');
  }

  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (idx >= 0) {
    lines[idx] = `${key}=${sanitized}`;
  } else {
    lines.push(`${key}=${sanitized}`);
  }

  // Clean up trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  writeFileSync(CREDENTIALS_PATH, lines.join('\n') + '\n', { mode: 0o600 });
}

/**
 * Get the credentials file path.
 */
export function getCredentialsPath(): string {
  return CREDENTIALS_PATH;
}

/**
 * Check that a file has the expected permission mode.
 * On Windows this check is skipped (always returns true).
 * Warns and returns false if permissions are too loose.
 */
export function checkFilePermissions(filePath: string, expectedMode: number): boolean {
  // Skip permission checks on Windows (no Unix permission model)
  if (process.platform === 'win32') return true;

  try {
    const stat = statSync(filePath);
    const actualMode = stat.mode & 0o777;
    if (actualMode !== expectedMode) {
      const actual = `0o${actualMode.toString(8)}`;
      const expected = `0o${expectedMode.toString(8)}`;
      console.warn(
        `[Security] ${filePath} has permissions ${actual}, expected ${expected}. ` +
        `Fix with: chmod ${expectedMode.toString(8)} "${filePath}"`
      );
      return false;
    }
    return true;
  } catch {
    return true; // If stat fails, let the caller handle the read error
  }
}
