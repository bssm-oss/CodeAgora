/**
 * CLI Binary Name Detection Tests
 */

import { describe, it, expect } from 'vitest';
import { detectBinaryName } from '@codeagora/cli/index.js';

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
