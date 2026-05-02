import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateActionOutputPath } from '@codeagora/github/action-policy.js';

describe('SARIF output path validation', () => {
  let workspaceRoot: string;
  let outsideRoot: string;
  const tempRoots: string[] = [];

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-sarif-workspace-'));
    outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-sarif-outside-'));
    await fs.mkdir(path.join(workspaceRoot, '.ca'), { recursive: true });
    tempRoots.push(workspaceRoot, outsideRoot);
  });

  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('accepts default /tmp path', async () => {
    const result = await validateActionOutputPath('/tmp/codeagora-results.sarif', workspaceRoot);

    expect(result).toBe(path.resolve('/tmp/codeagora-results.sarif'));
  });

  it('accepts path under project root', async () => {
    const result = await validateActionOutputPath(path.join(workspaceRoot, '.ca', 'results.sarif'), workspaceRoot);

    expect(result).toBe(path.join(workspaceRoot, '.ca', 'results.sarif'));
  });

  it('rejects path outside allowed roots', async () => {
    await expect(validateActionOutputPath('/etc/evil.sarif', workspaceRoot)).rejects.toThrow(/Action output path rejected/);
  });

  it('rejects path with traversal segments', async () => {
    await expect(validateActionOutputPath('/tmp/../etc/passwd', workspaceRoot)).rejects.toThrow(/Action output path rejected/);
  });

  it('rejects path with null bytes', async () => {
    await expect(validateActionOutputPath('/tmp/safe.sarif\x00.evil', workspaceRoot)).rejects.toThrow(/Action output path rejected/);
  });

  it('rejects empty path', async () => {
    await expect(validateActionOutputPath('', workspaceRoot)).rejects.toThrow(/Action output path rejected/);
  });

  it('rejects existing symlink output targets', async () => {
    const outsideFile = path.join(outsideRoot, 'results.sarif');
    const linkPath = path.join(workspaceRoot, 'linked.sarif');
    await fs.writeFile(outsideFile, '{}');
    await fs.symlink(outsideFile, linkPath);

    await expect(validateActionOutputPath(linkPath, workspaceRoot)).rejects.toThrow(/Action output path rejected/);
  });
});
