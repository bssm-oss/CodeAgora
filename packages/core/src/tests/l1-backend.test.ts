/**
 * L1 Backend — sanitizeShellArg security boundary tests
 */

import { describe, it, expect } from 'vitest';
import { sanitizeShellArg } from '../l1/backend.js';

describe('sanitizeShellArg', () => {
  it('rejects an empty string', () => {
    expect(() => sanitizeShellArg('', 'model')).toThrow();
  });

  it('rejects strings with backslash (path traversal variant)', () => {
    expect(() => sanitizeShellArg('..\\..\\etc\\passwd', 'model')).toThrow(/unsafe/i);
  });

  it('rejects strings containing null bytes', () => {
    // \x00 is not in SAFE_ARG charset
    expect(() => sanitizeShellArg('model\x00name', 'model')).toThrow(/unsafe/i);
  });

  it('accepts forward-slash path separators used in provider/model combos', () => {
    // Note: ../../../etc/passwd passes the regex since dots and slashes are allowed.
    // Security is enforced at the OS level via spawn() (no shell interpretation).
    expect(() => sanitizeShellArg('openrouter/xiaomi/mimo-v2.5', 'model')).not.toThrow();
  });

  it('rejects strings with shell metacharacters', () => {
    expect(() => sanitizeShellArg('model;rm -rf /', 'model')).toThrow(/unsafe/i);
    expect(() => sanitizeShellArg('model$(evil)', 'model')).toThrow(/unsafe/i);
    expect(() => sanitizeShellArg('model`cmd`', 'model')).toThrow(/unsafe/i);
  });

  it('rejects strings with spaces', () => {
    expect(() => sanitizeShellArg('model name', 'model')).toThrow(/unsafe/i);
  });

  it('accepts a simple model id', () => {
    expect(sanitizeShellArg('gpt-5.3-codex', 'model')).toBe('gpt-5.3-codex');
  });

  it('accepts a provider/model composite', () => {
    expect(sanitizeShellArg('groq/llama3', 'model')).toBe('groq/llama3');
  });

  it('accepts model ids with dots and colons', () => {
    expect(sanitizeShellArg('gpt-4o:2024-05-13', 'model')).toBe('gpt-4o:2024-05-13');
    expect(sanitizeShellArg('gemini-2.5-flash', 'model')).toBe('gemini-2.5-flash');
  });

  it('returns the arg unchanged on success', () => {
    const arg = 'openrouter/qwen/qwen3.7-max';
    expect(sanitizeShellArg(arg, 'provider')).toBe(arg);
  });
});
