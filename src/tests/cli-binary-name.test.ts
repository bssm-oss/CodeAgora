/**
 * CLI Binary Name Detection Tests
 */

import { mkdtemp, realpath } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, it, expect } from 'vitest';
import { applyCwdOverride, detectBinaryName } from '@codeagora/cli/index.js';

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
});

describe('detectBinaryName()', () => {
  it('returns "agora" when argv1 basename is "agora"', () => {
    expect(detectBinaryName('/usr/local/bin/agora')).toBe('agora');
  });

  it('returns "agora" when argv1 is just "agora"', () => {
    expect(detectBinaryName('agora')).toBe('agora');
  });

  it('returns "codeagora" when argv1 basename is "codeagora"', () => {
    expect(detectBinaryName('/usr/local/bin/codeagora')).toBe('codeagora');
  });

  it('returns "codeagora" when argv1 is just "codeagora"', () => {
    expect(detectBinaryName('codeagora')).toBe('codeagora');
  });

  it('returns "codeagora" for unknown binary names', () => {
    expect(detectBinaryName('/some/path/unknown-binary')).toBe('codeagora');
  });

  it('returns "codeagora" when argv1 is undefined', () => {
    expect(detectBinaryName(undefined)).toBe('codeagora');
  });

  it('returns "codeagora" when argv1 is an empty string', () => {
    expect(detectBinaryName('')).toBe('codeagora');
  });

  it('handles paths with agora as a directory component but different basename', () => {
    expect(detectBinaryName('/agora/bin/codeagora')).toBe('codeagora');
  });

  it('handles paths where agora is a substring of the basename', () => {
    expect(detectBinaryName('/bin/codeagora-extra')).toBe('codeagora');
  });
});

describe('applyCwdOverride()', () => {
  it('switches CLI commands back to the repository selected by Desktop dev fallback', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'codeagora-cli-cwd-'));
    const canonicalRoot = await realpath(repoRoot);
    const returned = applyCwdOverride(repoRoot);

    expect(returned).toBe(canonicalRoot);
    expect(process.cwd()).toBe(canonicalRoot);
  });

  it('does nothing when no override is provided', () => {
    expect(applyCwdOverride(undefined)).toBeUndefined();
    expect(process.cwd()).toBe(originalCwd);
  });
});
