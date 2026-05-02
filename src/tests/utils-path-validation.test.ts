/**
 * Path Validation Utility Tests
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { validateDiffPath, validatePathWithinRoot } from '@codeagora/shared/utils/path-validation.js';

describe('validateDiffPath', () => {
  it('accepts a normal absolute path /tmp/review.diff', () => {
    const result = validateDiffPath('/tmp/review.diff');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('/tmp/review.diff');
    }
  });

  it('accepts a normal absolute path /home/user/project/changes.diff', () => {
    const result = validateDiffPath('/home/user/project/changes.diff');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('/home/user/project/changes.diff');
    }
  });

  it('rejects path traversal ../../../etc/passwd', () => {
    const result = validateDiffPath('../../../etc/passwd');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  it('rejects path traversal foo/../../etc/shadow', () => {
    const result = validateDiffPath('foo/../../etc/shadow');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  it('rejects null byte injection /tmp/file\\x00.diff', () => {
    const result = validateDiffPath('/tmp/file\x00.diff');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  it('accepts path within allowedRoots', () => {
    const result = validateDiffPath('/tmp/review.diff', { allowedRoots: ['/tmp'] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('/tmp/review.diff');
    }
  });

  it('rejects path outside allowedRoots', () => {
    const result = validateDiffPath('/home/user/file.diff', { allowedRoots: ['/tmp'] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  it('resolves relative path and accepts it when valid', () => {
    const result = validateDiffPath('review.diff');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(path.isAbsolute(result.data)).toBe(true);
      expect(result.data.endsWith('review.diff')).toBe(true);
    }
  });

  it('rejects empty string', () => {
    const result = validateDiffPath('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  it('rejects all paths when allowedRoots is empty array', () => {
    const result = validateDiffPath('/tmp/review.diff', { allowedRoots: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });
});

describe('validatePathWithinRoot', () => {
  it('accepts real files under the root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'path-root-'));
    try {
      await fs.writeFile(path.join(root, 'review.diff'), 'diff --git a/a b/a');

      const result = await validatePathWithinRoot('review.diff', root);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(await fs.realpath(path.join(root, 'review.diff')));
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('rejects traversal before resolving files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'path-root-'));
    try {
      const result = await validatePathWithinRoot('../../.env', root);

      expect(result.success).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('rejects symlinks that resolve outside the root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'path-root-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'path-outside-'));
    try {
      await fs.writeFile(path.join(outside, 'secret.diff'), 'secret');
      await fs.symlink(path.join(outside, 'secret.diff'), path.join(root, 'linked.diff'));

      const result = await validatePathWithinRoot('linked.diff', root);

      expect(result.success).toBe(false);
    } finally {
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(outside, { recursive: true, force: true }),
      ]);
    }
  });
});
