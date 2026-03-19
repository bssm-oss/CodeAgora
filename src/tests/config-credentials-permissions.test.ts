/**
 * Tests for credentials file permission check
 * Issue #83: validate credentials file permissions (0o600)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkFilePermissions } from '@codeagora/core/config/credentials.js';
import { statSync } from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    statSync: vi.fn(),
  };
});

const mockStatSync = vi.mocked(statSync);

describe('checkFilePermissions', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('returns true when permissions match expected mode', () => {
    mockStatSync.mockReturnValue({ mode: 0o100600 } as ReturnType<typeof statSync>);
    expect(checkFilePermissions('/path/to/creds', 0o600)).toBe(true);
  });

  it('returns false and warns when permissions are too loose', () => {
    mockStatSync.mockReturnValue({ mode: 0o100644 } as ReturnType<typeof statSync>);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(checkFilePermissions('/path/to/creds', 0o600)).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('permissions 0o644, expected 0o600')
    );
  });

  it('returns false when file is world-readable', () => {
    mockStatSync.mockReturnValue({ mode: 0o100666 } as ReturnType<typeof statSync>);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(checkFilePermissions('/path/to/creds', 0o600)).toBe(false);
  });

  it('returns true on Windows (skip check)', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    // statSync should NOT be called on Windows
    expect(checkFilePermissions('/path/to/creds', 0o600)).toBe(true);
    expect(mockStatSync).not.toHaveBeenCalled();
  });

  it('returns true when stat throws (let caller handle)', () => {
    mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });
    expect(checkFilePermissions('/nonexistent', 0o600)).toBe(true);
  });
});
