/**
 * Path Validation Utility Tests
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { validateDiffPath, validatePathWithinRoot } from '@codeagora/shared/utils/path-validation.js';

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('rejects encoded traversal segments', () => {
    const result = validateDiffPath('patches/%2e%2e/secret.diff');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Path traversal detected');
    }
  });

  it('rejects separator-variant traversal segments', () => {
    const result = validateDiffPath('patches\\..\\secret.diff');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Path traversal detected');
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

  it('rejects traversal inputs before filesystem access', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'path-root-'));
    const realpathSpy = vi.spyOn(fs, 'realpath');
    try {
      const cases = [
        '../secret.diff',
        'patches/../../secret.diff',
        'patches/%2e%2e/secret.diff',
        'patches%2f%2e%2e%2fsecret.diff',
        'patches\\..\\secret.diff',
        'patches%5c..%5csecret.diff',
      ];

      for (const inputPath of cases) {
        const result = await validatePathWithinRoot(inputPath, root);
        expect(result.success, inputPath).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('Path traversal detected');
        }
      }

      expect(realpathSpy).not.toHaveBeenCalled();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('rejects relative paths that resolve outside the root', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'path-parent-'));
    const root = path.join(parent, 'workspace');
    const outside = path.join(parent, 'outside');
    try {
      await fs.mkdir(root);
      await fs.mkdir(outside);
      await fs.writeFile(path.join(outside, 'secret.diff'), 'secret');

      const result = await validatePathWithinRoot('../outside/secret.diff', root);

      expect(result.success).toBe(false);
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects absolute paths that resolve outside the root', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'path-parent-'));
    const root = path.join(parent, 'workspace');
    const outside = path.join(parent, 'outside');
    try {
      await fs.mkdir(root);
      await fs.mkdir(outside);
      const outsidePath = path.join(outside, 'secret.diff');
      await fs.writeFile(outsidePath, 'secret');

      const result = await validatePathWithinRoot(outsidePath, root);

      expect(result.success).toBe(false);
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
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

  it('rejects symlinked directories that resolve outside the root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'path-root-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'path-outside-'));
    try {
      await fs.writeFile(path.join(outside, 'secret.diff'), 'secret');
      await fs.symlink(outside, path.join(root, 'linked-dir'));

      const result = await validatePathWithinRoot('linked-dir/secret.diff', root);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Path resolves outside the repository root');
      }
    } finally {
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(outside, { recursive: true, force: true }),
      ]);
    }
  });

  it('allows symlinks that resolve inside the root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'path-root-'));
    try {
      const targetDir = path.join(root, 'patches');
      const targetPath = path.join(targetDir, 'review.diff');
      const linkPath = path.join(root, 'linked-review.diff');
      await fs.mkdir(targetDir);
      await fs.writeFile(targetPath, 'diff --git a/a b/a');
      await fs.symlink(targetPath, linkPath);

      const result = await validatePathWithinRoot('linked-review.diff', root);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(await fs.realpath(targetPath));
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
