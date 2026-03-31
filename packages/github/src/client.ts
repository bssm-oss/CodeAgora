/**
 * GitHub Client Utilities
 * Pure functions for parsing GitHub URLs and creating config objects.
 * Supports both PAT and GitHub App authentication.
 */

import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { readFileSync } from 'fs';
import { validateDiffPath } from '@codeagora/shared/utils/path-validation.js';

/**
 * Create a reusable Octokit instance from a GitHubConfig.
 */
export function createOctokit(config: GitHubConfig): Octokit {
  return new Octokit({ auth: config.token });
}

/**
 * Create an Octokit instance authenticated as a GitHub App installation.
 * Requires CODEAGORA_APP_ID and CODEAGORA_APP_PRIVATE_KEY (or _PATH) env vars.
 * Returns null if App credentials are not configured.
 */
export async function createAppOctokit(owner: string, repo: string): Promise<Octokit | null> {
  const appId = process.env['CODEAGORA_APP_ID'];
  const privateKeyRaw = process.env['CODEAGORA_APP_PRIVATE_KEY'];
  const privateKeyPath = process.env['CODEAGORA_APP_PRIVATE_KEY_PATH'];

  if (!appId) return null;

  let privateKey: string;
  if (privateKeyRaw) {
    privateKey = privateKeyRaw;
  } else if (privateKeyPath) {
    try {
      const expandedPath = privateKeyPath.replace(/^~/, process.env['HOME'] ?? '');
      const allowedRoots = [process.env['HOME'] ?? '', process.cwd()].filter(Boolean);
      const validation = validateDiffPath(expandedPath, { allowedRoots });
      if (!validation.success) {
        console.warn('[GitHub App] Private key path is outside allowed directories');
        return null;
      }
      privateKey = readFileSync(validation.data, 'utf-8');
    } catch {
      console.warn('[GitHub App] Failed to read private key from path');
      return null;
    }
  } else {
    return null;
  }

  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: Number(appId), privateKey },
  });

  // Find installation for the owner
  try {
    const { data: installation } = await appOctokit.apps.getRepoInstallation({ owner, repo });
    return new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: Number(appId), privateKey, installationId: installation.id },
    });
  } catch {
    console.warn(`[GitHub App] No installation found for ${owner}/${repo}`);
    return null;
  }
}

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  baseBranch: string;
  headBranch: string;
  diff: string;
  /** True when diff size exceeds GitHub's ~300KB truncation threshold (#288) */
  truncated?: boolean;
}

// ============================================================================
// URL Parsers
// ============================================================================

/**
 * Parse a GitHub PR URL into owner, repo, and PR number.
 * Accepts: https://github.com/owner/repo/pull/123
 * Returns null for invalid or non-PR URLs.
 */
export function parsePrUrl(
  url: string
): { owner: string; repo: string; number: number } | null {
  const match = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/.exec(url);
  if (!match) return null;
  const [, owner, repo, numStr] = match;
  const number = parseInt(numStr, 10);
  if (isNaN(number)) return null;
  return { owner, repo, number };
}

/**
 * Parse a git remote URL into owner and repo.
 * Accepts:
 *   git@github.com:owner/repo.git
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo
 * Returns null for unrecognized formats.
 */
export function parseGitRemote(
  remoteUrl: string
): { owner: string; repo: string } | null {
  // SSH format: git@github.com:owner/repo.git
  const sshMatch = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(remoteUrl);
  if (sshMatch) {
    const [, owner, repo] = sshMatch;
    return { owner, repo };
  }

  // HTTPS format: https://github.com/owner/repo[.git]
  const httpsMatch = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remoteUrl);
  if (httpsMatch) {
    const [, owner, repo] = httpsMatch;
    return { owner, repo };
  }

  return null;
}

// ============================================================================
// Config Factory
// ============================================================================

/**
 * Create a GitHubConfig with PR number from the provided options.
 *
 * Resolution order:
 * - token: options.token ?? process.env.GITHUB_TOKEN
 * - owner/repo/prNumber: parsed from prUrl if provided, else remoteUrl + prNumber
 *
 * Throws if token is missing or if required fields cannot be resolved.
 */
export function createGitHubConfig(options: {
  token?: string;
  prUrl?: string;
  remoteUrl?: string;
  prNumber?: number;
}): GitHubConfig & { prNumber: number } {
  const token = options.token ?? process.env['GITHUB_TOKEN'];
  if (!token) {
    throw new Error(
      'GitHub token is required. Pass --token or set the GITHUB_TOKEN environment variable.'
    );
  }

  if (options.prUrl) {
    const parsed = parsePrUrl(options.prUrl);
    if (!parsed) {
      throw new Error(`Invalid GitHub PR URL: ${options.prUrl}`);
    }
    return { token, owner: parsed.owner, repo: parsed.repo, prNumber: parsed.number };
  }

  if (options.remoteUrl && options.prNumber !== undefined) {
    const parsed = parseGitRemote(options.remoteUrl);
    if (!parsed) {
      throw new Error(`Could not parse git remote URL: ${options.remoteUrl}`);
    }
    return { token, owner: parsed.owner, repo: parsed.repo, prNumber: options.prNumber };
  }

  throw new Error(
    'Either prUrl or both remoteUrl and prNumber must be provided.'
  );
}
