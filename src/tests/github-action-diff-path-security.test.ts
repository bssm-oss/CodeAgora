import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateActionDiffPath } from '@codeagora/github/action-policy.js';

describe('github action diff path security', () => {
  let workspaceRoot: string;
  let outsideRoot: string;
  const tempRoots: string[] = [];

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-workspace-'));
    outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-outside-'));
    tempRoots.push(workspaceRoot, outsideRoot);
  });

  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('accepts a valid in-workspace diff file path', async () => {
    const diffPath = path.join(workspaceRoot, '.ca', 'pr.diff');
    await fs.mkdir(path.dirname(diffPath), { recursive: true });
    await fs.writeFile(diffPath, 'diff --git a/a b/a');

    const result = await validateActionDiffPath(diffPath, workspaceRoot);

    expect(result).toBe(await fs.realpath(diffPath));
  });

  it('accepts the action-managed temporary diff path', async () => {
    const tempDir = await fs.mkdtemp('/tmp/codeagora-action-');
    tempRoots.push(tempDir);
    const diffPath = path.join(tempDir, 'review.diff');
    await fs.writeFile(diffPath, 'diff --git a/a b/a');

    const result = await validateActionDiffPath(diffPath, workspaceRoot);

    expect(result).toBe(await fs.realpath(diffPath));
  });

  it('rejects traversal diff paths before file IO', async () => {
    await expect(validateActionDiffPath('../../.env', workspaceRoot)).rejects.toThrow(/Action diff path rejected/);
  });

  it('rejects absolute paths outside the workspace and action temp root', async () => {
    await expect(validateActionDiffPath('/etc/passwd', workspaceRoot)).rejects.toThrow(/Action diff path rejected/);
  });

  it('rejects symlinks that resolve outside allowed roots', async () => {
    const outsideDiff = path.join(outsideRoot, 'secret.diff');
    const linkedDiff = path.join(workspaceRoot, 'linked.diff');
    await fs.writeFile(outsideDiff, 'secret');
    await fs.symlink(outsideDiff, linkedDiff);

    await expect(validateActionDiffPath(linkedDiff, workspaceRoot)).rejects.toThrow(/Action diff path rejected/);
  });
});
