/**
 * Tests for credentials file permission check
 * Issue #83: validate credentials file permissions (0o600)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkFilePermissions } from '@codeagora/core/config/credentials.js';
import { stat } from 'fs/promises';

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    stat: vi.fn(),
  };
});

const mockStat = vi.mocked(stat);

describe('checkFilePermissions', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('returns true when permissions match expected mode', async () => {
    mockStat.mockResolvedValue({ mode: 0o100600 } as ReturnType<typeof stat> extends Promise<infer T> ? T : never);
    expect(await checkFilePermissions('/path/to/creds', 0o600)).toBe(true);
  });

  it('returns false and warns when permissions are too loose', async () => {
    mockStat.mockResolvedValue({ mode: 0o100644 } as ReturnType<typeof stat> extends Promise<infer T> ? T : never);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await checkFilePermissions('/path/to/creds', 0o600)).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('permissions 0o644, expected 0o600')
    );
  });

  it('returns false when file is world-readable', async () => {
    mockStat.mockResolvedValue({ mode: 0o100666 } as ReturnType<typeof stat> extends Promise<infer T> ? T : never);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await checkFilePermissions('/path/to/creds', 0o600)).toBe(false);
  });

  it('returns true on Windows (skip check)', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    // stat should NOT be called on Windows
    expect(await checkFilePermissions('/path/to/creds', 0o600)).toBe(true);
    expect(mockStat).not.toHaveBeenCalled();
  });

  it('returns true when stat throws (let caller handle)', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));
    expect(await checkFilePermissions('/nonexistent', 0o600)).toBe(true);
  });
});
