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

export interface McpStructuredError {
  status: 'error';
  code: string;
  message: string;
  details?: Record<string, unknown>;
  guidance?: string[];
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
  guidance?: string[],
): McpStructuredError {
  return {
    status: 'error',
    code,
    message,
    ...(details != null && { details }),
    ...(guidance != null && guidance.length > 0 && { guidance }),
  };
}

export function mcpErrorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): McpToolResponse {
  const error = createStructuredError(code, message, details, getGuidance(code, message, details));
  return {
    content: [{ type: 'text', text: JSON.stringify(redactDeep(error), null, 2) }],
    isError: true,
  };
}

function getGuidance(code: string, message: string, details?: Record<string, unknown>): string[] | undefined {
  const guidance: string[] = [];
  const lowerMessage = message.toLowerCase();

  if (code === 'INVALID_REPO_PATH') {
    guidance.push('Omit `repo_path` when you are already inside the workspace.');
    guidance.push('If you need a path, pass the exact workspace root and keep it inside the server boundary.');
  }

  if (code === 'INVALID_INPUT') {
    if (lowerMessage.includes('staged') || lowerMessage.includes('diff')) {
      guidance.push('Pass a unified diff or set `staged=true` for staged changes.');
      guidance.push('If the diff is empty, stage files with `git add` first.');
    } else {
      guidance.push('Check the tool schema and resend the required input fields.');
    }
  }

  if (code === 'REVIEW_FAILED' || code === 'REVIEW_PR_FAILED') {
    guidance.push('Run `agora doctor --live` or check provider keys before retrying.');
    guidance.push('If you are already in the repo, omit `repo_path` and try again.');
  }

  if (code === 'DRY_RUN_FAILED') {
    guidance.push('Check the diff format and rerun after the input is a valid unified diff.');
    guidance.push('If you were trying to inspect staged changes, use `staged=true` with `review_quick` or `review_full`.');
  }

  if (code === 'LEADERBOARD_FAILED') {
    guidance.push('Retry after session data and metrics files are available.');
    guidance.push('If the workspace is fresh, run a review first so leaderboard data exists.');
  }

  if (code === 'CONFIG_GET_FAILED' || code === 'CONFIG_SET_FAILED' || code === 'STATS_FAILED' || code === 'EXPLAIN_SESSION_FAILED') {
    guidance.push('Omit `repo_path` when the server is already running inside the target workspace.');
    guidance.push('Otherwise pass the exact workspace root, not a nested subdirectory or symlink.');
  }

  if (guidance.length === 0 && details?.repoPath != null) {
    guidance.push('If this is the right repo, retry with `repo_path` omitted or pass the workspace root exactly.');
  }

  return guidance.length > 0 ? guidance : undefined;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
      error: createStructuredError(
        'INVALID_REPO_PATH',
        'repo_path is outside the allowed repository boundary',
        {
          repoPath,
          reason: validation.error,
        },
        [
          'Omit `repo_path` when you are already inside the workspace.',
          'If you need an explicit path, pass the exact workspace root and keep it inside the server boundary.',
        ],
      ),
    };
  }

  try {
    const lstat = await fs.lstat(validation.data);
    if (lstat.isSymbolicLink()) {
      return {
        ok: false,
        error: createStructuredError(
          'INVALID_REPO_PATH',
          'repo_path must not be a symbolic link',
          {
            repoPath,
            resolvedPath: validation.data,
          },
          [
            'Use the real workspace directory rather than a symlink.',
            'If you are already in the repo, omit `repo_path` and retry.',
          ],
        ),
      };
    }

    if (!lstat.isDirectory()) {
      return {
        ok: false,
        error: createStructuredError(
          'INVALID_REPO_PATH',
          'repo_path must reference an accessible directory',
          {
            repoPath,
            resolvedPath: validation.data,
          },
          [
            'Pass a directory that exists and is readable by the MCP server.',
            'If the server is already in the target repo, omit `repo_path` entirely.',
          ],
        ),
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
        error: createStructuredError(
          'INVALID_REPO_PATH',
          'repo_path is outside the allowed repository boundary',
          {
            repoPath,
            resolvedPath: validation.data,
            realPath: realRepoPath,
          },
          [
            'Use the exact workspace root, not a parent folder or nested subdirectory.',
            'If you are already in the workspace, omit `repo_path` and retry.',
          ],
        ),
      };
    }

    return { ok: true, repoPath: realRepoPath };
  } catch (error) {
    return {
      ok: false,
      error: createStructuredError(
        'INVALID_REPO_PATH',
        'repo_path must reference an accessible directory',
        {
          repoPath,
          resolvedPath: validation.data,
          reason: errorMessage(error),
        },
        [
          'Make sure the path exists and points to a directory inside the current workspace boundary.',
          'Omit `repo_path` if the server is already running inside the desired repo.',
        ],
      ),
    };
  }
}

export async function resolveRepoPathOrError(repoPath: string | undefined): Promise<RepoPathValidationResult> {
  return validateRepoPathOption(repoPath);
}
