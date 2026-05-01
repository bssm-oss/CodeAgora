import { describe, expect, it } from 'vitest';
import { validateActionDiffPath } from '@codeagora/github/action-policy.js';

describe('github action diff path security', () => {
  const workspaceRoot = '/workspace/project';

  it('accepts a valid in-workspace diff file path', () => {
    const result = validateActionDiffPath('/workspace/project/.ca/pr.diff', workspaceRoot);

    expect(result).toBe('/workspace/project/.ca/pr.diff');
  });

  it('accepts the action-managed temporary diff path', () => {
    const result = validateActionDiffPath('/tmp/codeagora-pr.diff', workspaceRoot);

    expect(result).toBe('/tmp/codeagora-pr.diff');
  });

  it('rejects traversal diff paths before file IO', () => {
    expect(() => validateActionDiffPath('../../.env', workspaceRoot)).toThrow(/Action diff path rejected/);
  });

  it('rejects absolute paths outside the workspace and action temp root', () => {
    expect(() => validateActionDiffPath('/etc/passwd', workspaceRoot)).toThrow(/Action diff path rejected/);
  });
});
