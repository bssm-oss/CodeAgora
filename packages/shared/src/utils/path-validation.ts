/**
 * Path Validation Utility
 */

import path from 'path';
import type { Result } from '@codeagora/core/types/core.js';
import { ok, err } from '@codeagora/core/types/core.js';

export function validateDiffPath(
  diffPath: string,
  options?: { allowedRoots?: string[] }
): Result<string, string> {
  // Rule: reject empty string
  if (diffPath === '') {
    return err('Path must not be empty');
  }

  // Rule: reject null bytes
  if (diffPath.includes('\x00')) {
    return err('Path must not contain null bytes');
  }

  // Rule 2: reject if the input contains '..' path segments (traversal attempt)
  const parts = diffPath.split(/[\\/]/);
  if (parts.includes('..')) {
    return err(`Path traversal detected: "${diffPath}" contains ".." segments`);
  }

  // Rule 1: resolve to absolute path
  const resolved = path.resolve(diffPath);

  // Rule 4: allowedRoots check
  if (options?.allowedRoots !== undefined) {
    const roots = options.allowedRoots;
    // Empty array means no roots are allowed
    if (roots.length === 0) {
      return err('No allowed roots configured; all paths are rejected');
    }
    const isUnderAllowedRoot = roots.some((root) => {
      const normalizedRoot = path.resolve(root);
      // Ensure the resolved path starts with the root followed by sep (or equals root)
      return (
        resolved === normalizedRoot ||
        resolved.startsWith(normalizedRoot + path.sep)
      );
    });
    if (!isUnderAllowedRoot) {
      return err(
        `Path "${resolved}" is not under any allowed root: ${roots.join(', ')}`
      );
    }
  }

  return ok(resolved);
}
