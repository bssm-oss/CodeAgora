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
  reporterMode: ActionReporterMode;
  checkRunName: string;
  baseSha?: string;
  baseRepo?: string;
  headRepo?: string;
}

export type ActionReporterMode = 'commit-status' | 'check-run';

export interface ActionPolicy {
  shouldRunReview: boolean;
  shouldPostResults: boolean;
  degraded: boolean;
  degradedReason?: ActionDegradedReason;
  verdictOverride?: 'SKIPPED';
}

export interface ActionGuidance {
  why: string;
  nextSteps: string[];
}

export type PrivilegedGitHubOperation =
  | 'review-comment'
  | 'issue-comment'
  | 'commit-status'
  | 'check-run'
  | 'reviewer-mutation'
  | 'label-mutation'
  | 'release';

export interface PrivilegedGitHubOperationContext {
  token?: string;
  baseRepo?: string;
  headRepo?: string;
  repository?: string;
  eventName?: string;
  ref?: string;
}

export interface PrivilegedGitHubOperationDecision {
  allowed: boolean;
  operation: PrivilegedGitHubOperation;
  degradedReason?: ActionDegradedReason;
  message?: string;
}

export type GitHubTokenPermissionLevel = 'none' | 'read' | 'write';

export type GitHubTokenPermissionMap = Record<string, GitHubTokenPermissionLevel | undefined>;

export interface GitHubTokenPermissionRequirements {
  postResults?: boolean;
  reporterMode?: ActionReporterMode;
  uploadSarif?: boolean;
}

export interface GitHubTokenPermissionValidation {
  valid: boolean;
  required: GitHubTokenPermissionMap;
  missing: string[];
  excessive: string[];
}

const providerSecretList = [...new Set(Object.values(PROVIDER_ENV_VARS))].join(', ');

const permissionRank: Record<GitHubTokenPermissionLevel, number> = {
  none: 0,
  read: 1,
  write: 2,
};

function formatPermission(name: string, level: GitHubTokenPermissionLevel): string {
  return `${name}: ${level}`;
}

function normalizePermissionLevel(value: unknown): GitHubTokenPermissionLevel | undefined {
  if (value === 'none' || value === 'read' || value === 'write') {
    return value;
  }
  return undefined;
}

export function getRequiredGitHubTokenPermissions(
  requirements: GitHubTokenPermissionRequirements = {},
): GitHubTokenPermissionMap {
  const postResults = requirements.postResults ?? true;
  const reporterMode = requirements.reporterMode ?? 'check-run';
  const required: GitHubTokenPermissionMap = {
    contents: 'read',
    'pull-requests': postResults ? 'write' : 'read',
  };

  if (postResults && reporterMode === 'check-run') {
    required.checks = 'write';
  }
  if (postResults && reporterMode === 'commit-status') {
    required.statuses = 'write';
  }
  if (requirements.uploadSarif) {
    required['security-events'] = 'write';
  }

  return required;
}

export function validateGitHubTokenPermissions(
  permissions: GitHubTokenPermissionMap | 'read-all' | 'write-all' | undefined,
  requirements: GitHubTokenPermissionRequirements = {},
): GitHubTokenPermissionValidation {
  const required = getRequiredGitHubTokenPermissions(requirements);
  const missing: string[] = [];
  const excessive: string[] = [];

  if (!permissions) {
    return {
      valid: false,
      required,
      missing: Object.entries(required).map(([name, level]) => formatPermission(name, level ?? 'none')),
      excessive,
    };
  }

  if (permissions === 'read-all' || permissions === 'write-all') {
    return {
      valid: false,
      required,
      missing: permissions === 'read-all'
        ? Object.entries(required)
          .filter(([, level]) => level === 'write')
          .map(([name, level]) => formatPermission(name, level ?? 'none'))
        : [],
      excessive: [permissions],
    };
  }

  for (const [name, requiredLevel] of Object.entries(required)) {
    const actualLevel = normalizePermissionLevel(permissions[name]);
    if (!actualLevel || permissionRank[actualLevel] < permissionRank[requiredLevel ?? 'none']) {
      missing.push(formatPermission(name, requiredLevel ?? 'none'));
      continue;
    }
    if (permissionRank[actualLevel] > permissionRank[requiredLevel ?? 'none']) {
      excessive.push(formatPermission(name, actualLevel));
    }
  }

  for (const [name, value] of Object.entries(permissions)) {
    const actualLevel = normalizePermissionLevel(value);
    if (!actualLevel || actualLevel === 'none' || required[name]) {
      continue;
    }
    excessive.push(formatPermission(name, actualLevel));
  }

  return {
    valid: missing.length === 0 && excessive.length === 0,
    required,
    missing,
    excessive,
  };
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true';
}

function parseReporterMode(value: string | undefined): ActionReporterMode {
  const normalized = value?.trim();
  if (!normalized || normalized === 'check-run' || normalized === 'commit-status') {
    return (normalized || 'check-run') as ActionReporterMode;
  }

  throw new Error('--reporter-mode must be either commit-status or check-run');
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
  const reporterMode = parseReporterMode(args['reporter-mode'] ?? env['CODEAGORA_REPORTER_MODE']);

  // configPath normalization: CLI > env > default
  let configPath = args['config-path'];
  if (!configPath || configPath.trim() === '') {
    configPath = env['CONFIG_PATH'] ?? '';
  }
  if (!configPath || configPath.trim() === '') {
    configPath = '.ca/config.json';
  }

  const checkRunName = args['check-run-name']?.trim() || env['CODEAGORA_CHECK_RUN_NAME']?.trim() || 'CodeAgora Review';
  const baseSha = args['base-sha'];
  const baseRepo = args['base-repo'];
  const headRepo = args['head-repo'];

  if (!diff) throw new Error('--diff is required');
  if (isNaN(pr)) throw new Error('--pr must be a valid number');
  if (!sha) throw new Error('--sha is required');
  if (!repo || !repo.includes('/')) throw new Error('--repo must be in owner/repo format');
  if (isNaN(maxDiffLines)) throw new Error('--max-diff-lines must be a valid number');

  return {
    diff,
    pr,
    sha,
    repo,
    token,
    failOnReject,
    maxDiffLines,
    postResults,
    configPath,
    reporterMode,
    checkRunName,
    baseSha,
    baseRepo,
    headRepo,
  };
}

export function hasProviderCredentials(
  env: NodeJS.ProcessEnv = process.env,
  _options: { allowGitHubTokenAsProvider?: boolean } = {},
): boolean {
  return Object.values(PROVIDER_ENV_VARS).some((envVar) => {
    return Boolean(env[envVar]);
  });
}

export function isForkContext(inputs: Pick<ActionInputs, 'baseRepo' | 'headRepo'>): boolean {
  return Boolean(inputs.baseRepo && inputs.headRepo && inputs.baseRepo !== inputs.headRepo);
}

function hasTrustedPrContext(inputs: Pick<ActionInputs, 'baseRepo' | 'headRepo' | 'repo'>): boolean {
  return Boolean(inputs.baseRepo && inputs.headRepo && inputs.baseRepo === inputs.headRepo && inputs.baseRepo === inputs.repo);
}

export function evaluatePrivilegedGitHubOperation(
  operation: PrivilegedGitHubOperation,
  context: PrivilegedGitHubOperationContext,
): PrivilegedGitHubOperationDecision {
  if (!context.token?.trim()) {
    return {
      allowed: false,
      operation,
      degradedReason: 'missing-github-token',
      message: `Blocked privileged GitHub ${operation} because no GitHub token is available.`,
    };
  }

  if (operation === 'release') {
    const trustedReleaseRef = context.eventName === 'push' && Boolean(context.ref?.startsWith('refs/tags/v'));
    if (!trustedReleaseRef) {
      return {
        allowed: false,
        operation,
        degradedReason: 'untrusted-github-context',
        message: `Blocked privileged GitHub ${operation} outside a trusted version-tag push context.`,
      };
    }
    return { allowed: true, operation };
  }

  if (!context.baseRepo || !context.headRepo || !context.repository) {
    return {
      allowed: false,
      operation,
      degradedReason: 'untrusted-github-context',
      message: `Blocked privileged GitHub ${operation} because PR base/head repository metadata is incomplete.`,
    };
  }

  if (context.baseRepo !== context.headRepo || context.baseRepo !== context.repository) {
    return {
      allowed: false,
      operation,
      degradedReason: context.baseRepo !== context.headRepo ? 'untrusted-fork-pr' : 'untrusted-github-context',
      message: `Blocked privileged GitHub ${operation} because the PR repository context is not trusted.`,
    };
  }

  return { allowed: true, operation };
}

export function determineActionPolicy(
  inputs: ActionInputs,
  env: NodeJS.ProcessEnv = process.env,
): ActionPolicy {
  const fork = isForkContext(inputs);

  if (fork) {
    return {
      shouldRunReview: false,
      shouldPostResults: false,
      degraded: true,
      degradedReason: 'untrusted-fork-pr',
      verdictOverride: 'SKIPPED',
    };
  }

  if (!hasTrustedPrContext(inputs)) {
    return {
      shouldRunReview: false,
      shouldPostResults: false,
      degraded: true,
      degradedReason: 'untrusted-github-context',
      verdictOverride: 'SKIPPED',
    };
  }

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
      degradedReason: fork ? 'fork-missing-provider-secrets' : 'missing-provider-secrets',
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

export function getActionGuidance(reason: ActionDegradedReason): ActionGuidance {
  switch (reason) {
    case 'missing-github-token':
      return {
        why: 'The action needs a GitHub token to post the review and set the status check.',
        nextSteps: [
          'Provide the `github-token` input or disable posting with `post-results: false`.',
          'If you only need a dry run, switch to the CLI or MCP dry-run path instead of the Action.',
        ],
      };
    case 'untrusted-github-context':
      return {
        why: 'The workflow context is not trusted enough for provider-backed review or GitHub write operations.',
        nextSteps: [
          'Run CodeAgora from a pull_request event where base, head, and repository metadata all point to the same repository.',
          'For release publication, use the protected version-tag release workflow rather than a pull request workflow.',
          'Keep comment, status, reviewer, label, SARIF, and release writes disabled until the trusted context is restored.',
        ],
      };
    case 'missing-provider-secrets':
      return {
        why: 'The review pipeline cannot start because no provider credential is available.',
        nextSteps: [
          `Add one retained provider secret to the workflow environment: ${providerSecretList}.`,
          'For local setup, run `agora env set openrouter <api-key>` or `agora env set groq <api-key>`, then `agora doctor --live`.',
          'Use `agora review --dry-run` locally or the MCP `dry_run` tool when you need config/diff inspection without a live review.',
        ],
      };
    case 'untrusted-fork-pr':
      return {
        why: 'The pull request comes from a fork, so CodeAgora will not run provider-backed reviewers against untrusted code in this workflow context.',
        nextSteps: [
          'Review the fork PR manually first, then rerun CodeAgora from a trusted branch or maintainer-controlled workflow.',
          'Keep automatic provider-backed review disabled for untrusted fork PR events.',
          `Confirm the trusted workflow has one retained provider secret available: ${providerSecretList}.`,
        ],
      };
    case 'fork-missing-provider-secrets':
      return {
        why: 'Fork PRs cannot read repository secrets, so the review would fail before it starts.',
        nextSteps: [
          'Skip automatic review on untrusted fork PRs, or rerun from a trusted branch after maintainer review.',
          `Confirm the trusted workflow has one retained provider secret available: ${providerSecretList}.`,
          'For local reproduction, run `agora env set openrouter <api-key>` or `agora env set groq <api-key>`, then `agora doctor --live`.',
        ],
      };
    case 'posting-disabled':
      return {
        why: 'The review still ran, but GitHub posting was disabled by the caller.',
        nextSteps: [
          'Re-enable `post-results` if you want CodeAgora to comment on the PR and set the status.',
          'Keep posting disabled if you only want a local review run.',
        ],
      };
    case 'diff-too-large':
      return {
        why: 'The diff exceeded the configured safety limit and the review was skipped.',
        nextSteps: [
          'Raise `max-diff-lines` if the change is intentionally large.',
          'Otherwise split the PR into smaller chunks and rerun the review.',
        ],
      };
    case 'config-load-failed':
      return {
        why: 'The action could not load the repository config file.',
        nextSteps: [
          'Check `config-path` and confirm the file exists at the expected location.',
          'Fix the config file and rerun the workflow after the file is readable and valid.',
        ],
      };
    case 'provider-runtime-failed':
      return {
        why: 'The review pipeline started, but provider-backed reviewers could not produce a usable result because credentials, quota, rate limits, network connectivity, or provider availability failed.',
        nextSteps: [
          'Run `agora doctor --live` with the same provider credentials to confirm whether the key is valid and within quota.',
          'Rotate or top up the provider key when the provider reports quota, weekly limit, billing, or authentication failures.',
          'Rerun the workflow after provider health is restored; this state does not mean CodeAgora found code defects.',
        ],
      };
    case 'stale-head-sha':
      return {
        why: 'The PR head changed before CodeAgora could post the review, so the result was skipped.',
        nextSteps: [
          'Rerun the workflow after the branch head is up to date.',
          'If the PR keeps moving, post only after the branch is stable.',
        ],
      };
    case 'github-post-failed':
      return {
        why: 'The review ran, but GitHub rejected one of the posting operations.',
        nextSteps: [
          'Check repository permissions, comment limits, and GitHub API availability.',
          'Rerun after the posting issue is resolved, or disable posting if you only need local review output.',
        ],
      };
    case 'sarif-write-failed':
      return {
        why: 'CodeAgora could not safely write the SARIF artifact path.',
        nextSteps: [
          'Check the configured SARIF output path and filesystem permissions.',
          'Rerun after fixing the path or point SARIF output at a writable location.',
        ],
      };
  }

  return {
    why: 'CodeAgora encountered a degraded action state.',
    nextSteps: [
      'Review the workflow logs and rerun after the underlying issue is resolved.',
    ],
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
