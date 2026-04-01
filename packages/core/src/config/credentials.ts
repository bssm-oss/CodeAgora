/**
 * Credentials Manager
 * Stores and loads API keys from ~/.config/codeagora/credentials
 * Similar to gh CLI (~/.config/gh/) and aws CLI (~/.aws/credentials).
 */

import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'codeagora');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials');

/**
 * Load all credentials from ~/.config/codeagora/credentials
 * and set them as environment variables (if not already set).
 */
export async function loadCredentials(): Promise<void> {
  let content: string;
  try {
    // Verify file permissions are 0o600 (owner read/write only)
    if (!(await checkFilePermissions(CREDENTIALS_PATH, 0o600))) {
      return;
    }
    content = await readFile(CREDENTIALS_PATH, 'utf-8');
  } catch {
    return;
  }

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
export async function saveCredential(key: string, value: string): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });

  const sanitized = value.replace(/[\r\n]/g, '');
  let lines: string[] = [];

  try {
    const existing = await readFile(CREDENTIALS_PATH, 'utf-8');
    lines = existing.split('\n');
  } catch {
    // File doesn't exist yet — start with empty lines
  }

  const idx = lines.findIndex((l) => {
    const eqIdx = l.indexOf('=');
    return eqIdx >= 0 && l.slice(0, eqIdx).trim() === key;
  });
  if (idx >= 0) {
    lines[idx] = `${key}=${sanitized}`;
  } else {
    lines.push(`${key}=${sanitized}`);
  }

  // Clean up trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  await writeFile(CREDENTIALS_PATH, lines.join('\n') + '\n', { mode: 0o600 });
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
export async function checkFilePermissions(filePath: string, expectedMode: number): Promise<boolean> {
  // Skip permission checks on Windows (no Unix permission model)
  if (process.platform === 'win32') return true;

  try {
    const s = await stat(filePath);
    const actualMode = s.mode & 0o777;
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
    return false; // Fail closed: if stat fails, deny access (#393)
  }
}
