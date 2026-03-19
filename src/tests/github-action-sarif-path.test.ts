/**
 * Tests for SARIF output path validation in github-action.ts
 * Issue #107: validate sarifOutputPath to prevent path traversal
 */

import { describe, it, expect } from 'vitest';
import { validateDiffPath } from '@codeagora/shared/utils/path-validation.js';

describe('SARIF output path validation', () => {
  const allowedRoots = ['/workspace/project', '/tmp'];

  it('accepts default /tmp path', () => {
    const result = validateDiffPath('/tmp/codeagora-results.sarif', { allowedRoots });
    expect(result.success).toBe(true);
  });

  it('accepts path under project root', () => {
    const result = validateDiffPath('/workspace/project/.ca/results.sarif', { allowedRoots });
    expect(result.success).toBe(true);
  });

  it('rejects path outside allowed roots', () => {
    const result = validateDiffPath('/etc/evil.sarif', { allowedRoots });
    expect(result.success).toBe(false);
  });

  it('rejects path with traversal segments', () => {
    const result = validateDiffPath('/tmp/../etc/passwd', { allowedRoots });
    expect(result.success).toBe(false);
  });

  it('rejects path with null bytes', () => {
    const result = validateDiffPath('/tmp/safe.sarif\x00.evil', { allowedRoots });
    expect(result.success).toBe(false);
  });

  it('rejects empty path', () => {
    const result = validateDiffPath('', { allowedRoots });
    expect(result.success).toBe(false);
  });
});
