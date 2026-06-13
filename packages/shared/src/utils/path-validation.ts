/**
 * Path Validation Utility
 */

import fs from 'fs/promises';
import path from 'path';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';

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

  // Rule 2: reject if the input contains traversal path segments.
  // Decode URL-escaped inputs first so `%2e%2e`, `%2f`, and `%5c` variants
  // cannot reach path resolution as ordinary filenames.
  if (hasTraversalSegment(diffPath)) {
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

export async function validatePathWithinRoot(
  inputPath: string,
  rootDir: string,
): Promise<Result<string, string>> {
  if (inputPath === '') {
    return err('Path must not be empty');
  }

  if (inputPath.includes('\x00')) {
    return err('Path must not contain null bytes');
  }

  if (hasTraversalSegment(inputPath)) {
    return err(`Path traversal detected: "${inputPath}" contains ".." segments`);
  }

  const root = path.resolve(rootDir);
  const resolved = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(root, inputPath);

  if (!isPathWithinRoot(resolved, root)) {
    return err('Path is outside the repository root');
  }

  let realRoot: string;
  let realTarget: string;
  try {
    [realRoot, realTarget] = await Promise.all([
      fs.realpath(root),
      fs.realpath(resolved),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(`Path could not be resolved safely: ${message}`);
  }

  if (!isPathWithinRoot(realTarget, realRoot)) {
    return err('Path resolves outside the repository root');
  }

  return ok(realTarget);
}

function isPathWithinRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function hasTraversalSegment(inputPath: string): boolean {
  return decodedPathViews(inputPath).some((candidate) => candidate.split(/[\\/]/).includes('..'));
}

function decodedPathViews(inputPath: string): string[] {
  const views = [inputPath];
  let current = inputPath;

  for (let i = 0; i < 3; i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      break;
    }

    if (decoded === current) {
      break;
    }

    views.push(decoded);
    current = decoded;
  }

  return views;
}
