/**
 * Path Validation Utility Tests
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import { validateDiffPath } from '@codeagora/shared/utils/path-validation.js';

describe('validateDiffPath', () => {
  // 1. Normal absolute path — success
  it('accepts a normal absolute path /tmp/review.diff', () => {
    const result = validateDiffPath('/tmp/review.diff');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('/tmp/review.diff');
    }
  });

  // 2. Normal absolute path — success
  it('accepts a normal absolute path /home/user/project/changes.diff', () => {
    const result = validateDiffPath('/home/user/project/changes.diff');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('/home/user/project/changes.diff');
    }
  });

  // 3. Path traversal '../../../etc/passwd' — error
  it('rejects path traversal ../../../etc/passwd', () => {
    const result = validateDiffPath('../../../etc/passwd');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  // 4. Path traversal 'foo/../../etc/shadow' — error
  it('rejects path traversal foo/../../etc/shadow', () => {
    const result = validateDiffPath('foo/../../etc/shadow');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  // 5. Null byte injection — error
  it('rejects null byte injection /tmp/file\\x00.diff', () => {
    const result = validateDiffPath('/tmp/file\x00.diff');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  // 6. allowedRoots ['/tmp'] + '/tmp/review.diff' — success
  it('accepts path within allowedRoots', () => {
    const result = validateDiffPath('/tmp/review.diff', { allowedRoots: ['/tmp'] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('/tmp/review.diff');
    }
  });

  // 7. allowedRoots ['/tmp'] + '/home/user/file.diff' — error (outside allowed roots)
  it('rejects path outside allowedRoots', () => {
    const result = validateDiffPath('/home/user/file.diff', { allowedRoots: ['/tmp'] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  // 8. Relative path 'review.diff' → resolve succeeds
  it('resolves relative path and accepts it when valid', () => {
    const result = validateDiffPath('review.diff');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(path.isAbsolute(result.data)).toBe(true);
      expect(result.data.endsWith('review.diff')).toBe(true);
    }
  });

  // 9. Empty string — error
  it('rejects empty string', () => {
    const result = validateDiffPath('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  // 10. allowedRoots empty array [] — rejects all paths
  it('rejects all paths when allowedRoots is empty array', () => {
    const result = validateDiffPath('/tmp/review.diff', { allowedRoots: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });
});
