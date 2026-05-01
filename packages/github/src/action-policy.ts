import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';
import { validateDiffPath } from '@codeagora/shared/utils/path-validation.js';

export interface ActionInputs {
  diff: string;
  pr: number;
  sha: string;
  repo: string;
  token: string;
  failOnReject: boolean;
  maxDiffLines: number;
  postResults: boolean;
  baseSha?: string;
  baseRepo?: string;
  headRepo?: string;
}

export interface ActionPolicy {
  shouldRunReview: boolean;
  shouldPostResults: boolean;
  degraded: boolean;
  degradedReason?: string;
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
  const baseSha = args['base-sha'];
  const baseRepo = args['base-repo'];
  const headRepo = args['head-repo'];

  if (!diff) throw new Error('--diff is required');
  if (isNaN(pr)) throw new Error('--pr must be a valid number');
  if (!sha) throw new Error('--sha is required');
  if (!repo || !repo.includes('/')) throw new Error('--repo must be in owner/repo format');
  if (isNaN(maxDiffLines)) throw new Error('--max-diff-lines must be a valid number');

  return { diff, pr, sha, repo, token, failOnReject, maxDiffLines, postResults, baseSha, baseRepo, headRepo };
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

export function validateActionDiffPath(
  diffPath: string,
  workspaceRoot: string = process.cwd(),
): string {
  const validation = validateDiffPath(diffPath, {
    allowedRoots: [workspaceRoot, '/tmp'],
  });
  if (!validation.success) {
    throw new Error(`Action diff path rejected: ${validation.error}`);
  }
  return validation.data;
}
