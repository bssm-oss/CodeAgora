/**
 * Shared MCP tool response helpers.
 */

import fs from 'fs/promises';
import path from 'path';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { validateDiffPath } from '@codeagora/shared/utils/path-validation.js';
import { redactDeep } from '@codeagora/shared/utils/redaction.js';

const execFile = promisify(execFileCb);

const REPO_PATH_NEXT_STEPS = [
  'Omit repo_path when the MCP server already runs in the target workspace.',
  'Pass the exact repository root directory only when it is inside the server cwd or detected git repository boundary.',
  'Keep repo_path inside the MCP server cwd or detected git repository root.',
];

export interface McpStructuredError {
  status: 'error';
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface McpToolResponse {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

type RepoPathValidationResult =
  | { ok: true; repoPath?: string }
  | { ok: false; error: McpStructuredError };

export function createStructuredError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): McpStructuredError {
  return {
    status: 'error',
    code,
    message,
    ...(details != null && { details }),
  };
}

export function mcpErrorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): McpToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(redactDeep(createStructuredError(code, message, details)), null, 2) }],
    isError: true,
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function repoPathErrorDetails(repoPath: string, details: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    repoPath,
    ...details,
    next_steps: REPO_PATH_NEXT_STEPS,
  };
}

async function getRepoRoot(): Promise<string | undefined> {
  try {
    const { stdout } = await execFile('git', ['rev-parse', '--show-toplevel']);
    const root = stdout.trim();
    return root.length > 0 ? root : undefined;
  } catch (error) {
    void error;
    return undefined;
  }
}

function isPathInsideRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function validateRepoPathOption(repoPath: string | undefined): Promise<RepoPathValidationResult> {
  if (repoPath == null || repoPath === '') {
    return { ok: true };
  }

  const cwd = process.cwd();
  const repoRoot = await getRepoRoot();
  const allowedRoots = repoRoot != null && repoRoot !== cwd ? [cwd, repoRoot] : [cwd];
  const validation = validateDiffPath(repoPath, { allowedRoots });

  if (!validation.success) {
    return {
      ok: false,
      error: createStructuredError('INVALID_REPO_PATH', 'repo_path is outside the allowed repository boundary', {
        ...repoPathErrorDetails(repoPath, { reason: validation.error }),
      }),
    };
  }

  try {
    const lstat = await fs.lstat(validation.data);
    if (lstat.isSymbolicLink()) {
      return {
        ok: false,
        error: createStructuredError('INVALID_REPO_PATH', 'repo_path must not be a symbolic link', {
          ...repoPathErrorDetails(repoPath, { resolvedPath: validation.data }),
        }),
      };
    }

    if (!lstat.isDirectory()) {
      return {
        ok: false,
        error: createStructuredError('INVALID_REPO_PATH', 'repo_path must reference an accessible directory', {
          ...repoPathErrorDetails(repoPath, { resolvedPath: validation.data }),
        }),
      };
    }

    const [realRepoPath, ...realAllowedRoots] = await Promise.all([
      fs.realpath(validation.data),
      ...allowedRoots.map((root) => fs.realpath(root)),
    ]);
    const insideAllowedRoot = realAllowedRoots.some((root) => isPathInsideRoot(realRepoPath, root));
    if (!insideAllowedRoot) {
      return {
        ok: false,
        error: createStructuredError('INVALID_REPO_PATH', 'repo_path is outside the allowed repository boundary', {
          ...repoPathErrorDetails(repoPath, { resolvedPath: validation.data, realPath: realRepoPath }),
        }),
      };
    }

    return { ok: true, repoPath: realRepoPath };
  } catch (error) {
    return {
      ok: false,
      error: createStructuredError('INVALID_REPO_PATH', 'repo_path must reference an accessible directory', {
        ...repoPathErrorDetails(repoPath, { resolvedPath: validation.data, reason: errorMessage(error) }),
      }),
    };
  }
}

export async function resolveRepoPathOrError(repoPath: string | undefined): Promise<RepoPathValidationResult> {
  return validateRepoPathOption(repoPath);
}
