import fs from 'fs/promises';
import path from 'path';
import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';
import type { ActionDegradedReason } from '@codeagora/shared/contracts/stable.js';
import { validatePathWithinRoot } from '@codeagora/shared/utils/path-validation.js';

export interface ActionInputs {
  diff: string;
  pr: number;
  sha: string;
  repo: string;
  token: string;
  failOnReject: boolean;
  maxDiffLines: number;
  postResults: boolean;
  configPath: string;
  baseSha?: string;
  baseRepo?: string;
  headRepo?: string;
}

export interface ActionPolicy {
  shouldRunReview: boolean;
  shouldPostResults: boolean;
  degraded: boolean;
  degradedReason?: ActionDegradedReason;
  verdictOverride?: 'SKIPPED';
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true';
}

export function parseActionInputs(argv: string[], env: NodeJS.ProcessEnv = process.env): ActionInputs {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--') && i + 1 < argv.length) {
      args[arg.slice(2)] = argv[i + 1]!;
      i++;
    }
  }

  const diff = args['diff'];
  const pr = parseInt(args['pr'] ?? '', 10);
  const sha = args['sha'] ?? '';
  const repo = args['repo'] ?? '';
  const token = env['GITHUB_TOKEN'] ?? '';
  const failOnReject = parseBoolean(args['fail-on-reject'], false);
  const maxDiffLines = parseInt(args['max-diff-lines'] ?? '5000', 10);
  const postResults = parseBoolean(args['post-results'], true);

  // configPath normalization: CLI > env > default
  let configPath = args['config-path'];
  if (!configPath || configPath.trim() === '') {
    configPath = env['CONFIG_PATH'] ?? '';
  }
  if (!configPath || configPath.trim() === '') {
    configPath = '.ca/config.json';
  }

  const baseSha = args['base-sha'];
  const baseRepo = args['base-repo'];
  const headRepo = args['head-repo'];

  if (!diff) throw new Error('--diff is required');
  if (isNaN(pr)) throw new Error('--pr must be a valid number');
  if (!sha) throw new Error('--sha is required');
  if (!repo || !repo.includes('/')) throw new Error('--repo must be in owner/repo format');
  if (isNaN(maxDiffLines)) throw new Error('--max-diff-lines must be a valid number');

  return { diff, pr, sha, repo, token, failOnReject, maxDiffLines, postResults, configPath, baseSha, baseRepo, headRepo };
}

export function hasProviderCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Object.values(PROVIDER_ENV_VARS).some((envVar) => {
    if (envVar === 'GITHUB_TOKEN' || envVar === 'GITHUB_COPILOT_TOKEN') return false;
    return Boolean(env[envVar]);
  });
}

export function isForkContext(inputs: Pick<ActionInputs, 'baseRepo' | 'headRepo'>): boolean {
  return Boolean(inputs.baseRepo && inputs.headRepo && inputs.baseRepo !== inputs.headRepo);
}

export function determineActionPolicy(
  inputs: ActionInputs,
  env: NodeJS.ProcessEnv = process.env,
): ActionPolicy {
  if (!inputs.token && inputs.postResults) {
    return {
      shouldRunReview: false,
      shouldPostResults: false,
      degraded: true,
      degradedReason: 'missing-github-token',
      verdictOverride: 'SKIPPED',
    };
  }

  if (!hasProviderCredentials(env)) {
    return {
      shouldRunReview: false,
      shouldPostResults: false,
      degraded: true,
      degradedReason: isForkContext(inputs) ? 'fork-missing-provider-secrets' : 'missing-provider-secrets',
      verdictOverride: 'SKIPPED',
    };
  }

  // configPath is normalized by the input parser (CLI > env > default).
  // Any failures loading the file are handled at load time by the caller
  // (action.ts) and surfaced via degraded outputs. Therefore we do not
  // treat a missing configPath as an actionable policy decision here.

  if (!inputs.postResults) {
    return {
      shouldRunReview: true,
      shouldPostResults: false,
      degraded: true,
      degradedReason: 'posting-disabled',
    };
  }

  return {
    shouldRunReview: true,
    shouldPostResults: true,
    degraded: false,
  };
}

export function isStaleHead(expectedHeadSha: string, currentHeadSha: string | undefined): boolean {
  return Boolean(currentHeadSha && currentHeadSha !== expectedHeadSha);
}

export async function validateActionDiffPath(
  diffPath: string,
  workspaceRoot: string = process.cwd(),
): Promise<string> {
  const allowedRoots = [workspaceRoot, '/tmp'];
  let lastError = 'Path is outside allowed roots';

  for (const root of allowedRoots) {
    if (!isInputPathUnderRoot(diffPath, root)) {
      continue;
    }

    const validation = await validatePathWithinRoot(diffPath, root);
    if (validation.success) {
      return validation.data;
    }
    lastError = validation.error;
    break;
  }

  throw new Error(`Action diff path rejected: ${lastError}`);
}

export async function validateActionOutputPath(
  outputPath: string,
  workspaceRoot: string = process.cwd(),
): Promise<string> {
  if (outputPath === '') {
    throw new Error('Action output path rejected: Path must not be empty');
  }
  if (outputPath.includes('\x00')) {
    throw new Error('Action output path rejected: Path must not contain null bytes');
  }
  if (outputPath.split(/[\\/]/).includes('..')) {
    throw new Error('Action output path rejected: Path traversal detected: path contains ".." segments');
  }

  const allowedRoots = [workspaceRoot, '/tmp'];
  let lastError = 'Path is outside allowed roots';

  for (const root of allowedRoots) {
    if (!isInputPathUnderRoot(outputPath, root)) {
      continue;
    }

    const resolved = path.isAbsolute(outputPath)
      ? path.resolve(outputPath)
      : path.resolve(root, outputPath);
    const parent = path.dirname(resolved);

    try {
      const [realRoot, realParent] = await Promise.all([
        fs.realpath(path.resolve(root)),
        fs.realpath(parent),
      ]);
      if (!isResolvedPathUnderRoot(realParent, realRoot)) {
        lastError = 'Path resolves outside allowed roots';
        break;
      }

      const existing = await fs.lstat(resolved).catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return null;
        }
        throw error;
      });
      if (existing?.isSymbolicLink()) {
        throw new Error('Path must not be a symlink');
      }

      return resolved;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = `Path could not be resolved safely: ${message}`;
      break;
    }
  }

  throw new Error(`Action output path rejected: ${lastError}`);
}

function isInputPathUnderRoot(inputPath: string, rootDir: string): boolean {
  const root = path.resolve(rootDir);
  const resolved = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(root, inputPath);
  return isResolvedPathUnderRoot(resolved, root);
}

function isResolvedPathUnderRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
