/**
 * GitHub Action input and policy tests.
 */

import fs from 'fs';
import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { ACTION_DEGRADED_REASONS } from '@codeagora/shared/contracts/stable.js';
import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';
import {
  determineActionPolicy,
  evaluatePrivilegedGitHubOperation,
  getActionGuidance,
  getRequiredGitHubTokenPermissions,
  hasProviderCredentials,
  isForkContext,
  isStaleHead,
  parseActionInputs,
  validateGitHubTokenPermissions,
} from '@codeagora/github/action-policy.js';

const TOKEN = 'test-token-123';

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...overrides };
}

describe('github-action parseActionInputs', () => {
  const validArgv = [
    'node', 'github-action.js',
    '--diff', '/tmp/pr.diff',
    '--pr', '42',
    '--sha', 'abc123',
    '--repo', 'owner/repo',
  ];

  it('parses valid arguments correctly', () => {
    const result = parseActionInputs(validArgv, env({ GITHUB_TOKEN: TOKEN }));
    expect(result.diff).toBe('/tmp/pr.diff');
    expect(result.pr).toBe(42);
    expect(result.sha).toBe('abc123');
    expect(result.repo).toBe('owner/repo');
    expect(result.token).toBe(TOKEN);
    expect(result.failOnReject).toBe(false);
    expect(result.maxDiffLines).toBe(5000);
    expect(result.postResults).toBe(true);
    expect(result.reporterMode).toBe('check-run');
    expect(result.checkRunName).toBe('CodeAgora Review');
  });

  it('parses production-path metadata and posting controls', () => {
    const result = parseActionInputs([
      ...validArgv,
      '--fail-on-reject', 'true',
      '--max-diff-lines', '1000',
      '--post-results', 'false',
      '--reporter-mode', 'commit-status',
      '--base-sha', 'base123',
      '--base-repo', 'owner/repo',
      '--head-repo', 'fork/repo',
      '--check-run-name', 'CodeAgora RC Gate',
    ], env({ GITHUB_TOKEN: TOKEN }));

    expect(result.failOnReject).toBe(true);
    expect(result.maxDiffLines).toBe(1000);
    expect(result.postResults).toBe(false);
    expect(result.reporterMode).toBe('commit-status');
    expect(result.baseSha).toBe('base123');
    expect(result.baseRepo).toBe('owner/repo');
    expect(result.headRepo).toBe('fork/repo');
    expect(result.checkRunName).toBe('CodeAgora RC Gate');
  });

  it('uses CODEAGORA_CHECK_RUN_NAME when CLI flag is not present', () => {
    const result = parseActionInputs(validArgv, env({
      GITHUB_TOKEN: TOKEN,
      CODEAGORA_CHECK_RUN_NAME: 'CodeAgora configured check',
    }));
    expect(result.checkRunName).toBe('CodeAgora configured check');
  });

  it('uses CODEAGORA_REPORTER_MODE when CLI flag is not present', () => {
    const result = parseActionInputs(validArgv, env({
      GITHUB_TOKEN: TOKEN,
      CODEAGORA_REPORTER_MODE: 'commit-status',
    }));
    expect(result.reporterMode).toBe('commit-status');
  });

  it('throws when reporter mode is invalid', () => {
    const argv = [...validArgv, '--reporter-mode', 'both'];
    expect(() => parseActionInputs(argv, env({ GITHUB_TOKEN: TOKEN }))).toThrow(
      '--reporter-mode must be either commit-status or check-run',
    );
  });

  it('throws when --diff is missing', () => {
    const argv = ['node', 'github-action.js', '--pr', '1', '--sha', 'x', '--repo', 'a/b'];
    expect(() => parseActionInputs(argv, env({ GITHUB_TOKEN: TOKEN }))).toThrow('--diff is required');
  });

  it('throws when --pr is not a number', () => {
    const argv = ['node', 'github-action.js', '--diff', 'f', '--pr', 'abc', '--sha', 'x', '--repo', 'a/b'];
    expect(() => parseActionInputs(argv, env({ GITHUB_TOKEN: TOKEN }))).toThrow('--pr must be a valid number');
  });

  it('throws when --sha is missing', () => {
    const argv = ['node', 'github-action.js', '--diff', 'f', '--pr', '1', '--repo', 'a/b'];
    expect(() => parseActionInputs(argv, env({ GITHUB_TOKEN: TOKEN }))).toThrow('--sha is required');
  });

  it('throws when --repo is missing slash', () => {
    const argv = ['node', 'github-action.js', '--diff', 'f', '--pr', '1', '--sha', 'x', '--repo', 'noslash'];
    expect(() => parseActionInputs(argv, env({ GITHUB_TOKEN: TOKEN }))).toThrow('--repo must be in owner/repo format');
  });

  it('allows missing GITHUB_TOKEN so runtime can return degraded outputs', () => {
    const result = parseActionInputs(validArgv, env());
    expect(result.token).toBe('');
  });

  it('CLI --config-path overrides env and default', () => {
    const argv = [...validArgv, '--config-path', 'custom.json'];
    const result = parseActionInputs(argv, env({ GITHUB_TOKEN: TOKEN, CONFIG_PATH: 'fromenv.json' }));
    expect(result.configPath).toBe('custom.json');
  });

  it('CONFIG_PATH env is used when CLI flag not present', () => {
    const result = parseActionInputs(validArgv, env({ GITHUB_TOKEN: TOKEN, CONFIG_PATH: 'fromenv.json' }));
    expect(result.configPath).toBe('fromenv.json');
  });

  it('defaults configPath to .ca/config.json if neither CLI arg nor env present', () => {
    const result = parseActionInputs(validArgv, env({ GITHUB_TOKEN: TOKEN }));
    expect(result.configPath).toBe('.ca/config.json');
  });
});

describe('github-action production policy', () => {
  const baseInputs = parseActionInputs([
    'node', 'github-action.js',
    '--diff', '/tmp/pr.diff',
    '--pr', '42',
    '--sha', 'head123',
    '--repo', 'owner/repo',
    '--base-repo', 'owner/repo',
    '--head-repo', 'owner/repo',
  ], env({ GITHUB_TOKEN: TOKEN }));

  it('runs and posts for normal same-repository PRs', () => {
    expect(determineActionPolicy(baseInputs, env({ GITHUB_TOKEN: TOKEN, GROQ_API_KEY: 'key' }))).toEqual({
      shouldRunReview: true,
      shouldPostResults: true,
      degraded: false,
    });
  });

  it('skips clearly when GitHub posting is enabled but token is missing', () => {
    const inputs = { ...baseInputs, token: '' };
    expect(determineActionPolicy(inputs, env())).toEqual({
      shouldRunReview: false,
      shouldPostResults: false,
      degraded: true,
      degradedReason: 'missing-github-token',
      verdictOverride: 'SKIPPED',
    });
  });

  it('skips same-repository PRs when no provider secret is configured', () => {
    expect(determineActionPolicy(baseInputs, env({ GITHUB_TOKEN: TOKEN }))).toEqual({
      shouldRunReview: false,
      shouldPostResults: false,
      degraded: true,
      degradedReason: 'missing-provider-secrets',
      verdictOverride: 'SKIPPED',
    });
  });

  it('runs same-repository PRs when a retained provider secret is configured', () => {
    expect(determineActionPolicy(baseInputs, env({ GITHUB_TOKEN: TOKEN, OPENROUTER_API_KEY: 'test' }))).toEqual({
      shouldRunReview: true,
      shouldPostResults: true,
      degraded: false,
    });
  });

  it('skips fork PRs as untrusted before checking provider credentials', () => {
    const inputs = { ...baseInputs, baseRepo: 'owner/repo', headRepo: 'fork/repo' };
    expect(isForkContext(inputs)).toBe(true);
    expect(determineActionPolicy(inputs, env({ GITHUB_TOKEN: TOKEN, OPENROUTER_API_KEY: 'test' }))).toEqual({
      shouldRunReview: false,
      shouldPostResults: false,
      degraded: true,
      degradedReason: 'untrusted-fork-pr',
      verdictOverride: 'SKIPPED',
    });
  });

  it('prioritizes untrusted fork hard-stop over token, provider, and posting controls', () => {
    const forkInputs = {
      ...baseInputs,
      token: '',
      postResults: false,
      baseRepo: 'owner/repo',
      headRepo: 'contributor/repo',
    };

    expect(isForkContext(forkInputs)).toBe(true);
    expect(determineActionPolicy(forkInputs, env())).toEqual({
      shouldRunReview: false,
      shouldPostResults: false,
      degraded: true,
      degradedReason: 'untrusted-fork-pr',
      verdictOverride: 'SKIPPED',
    });
  });

  it('uses parsed base/head repository metadata to detect untrusted fork PRs', () => {
    const parsed = parseActionInputs([
      'node', 'github-action.js',
      '--diff', '/tmp/pr.diff',
      '--pr', '42',
      '--sha', 'head123',
      '--repo', 'owner/repo',
      '--base-repo', 'owner/repo',
      '--head-repo', 'contributor/repo',
      '--post-results', 'false',
    ], env({ GITHUB_TOKEN: TOKEN, OPENROUTER_API_KEY: 'test' }));

    expect(parsed.postResults).toBe(false);
    expect(isForkContext(parsed)).toBe(true);
    expect(determineActionPolicy(parsed, env({ GITHUB_TOKEN: TOKEN, OPENROUTER_API_KEY: 'test' }))).toMatchObject({
      shouldRunReview: false,
      shouldPostResults: false,
      degradedReason: 'untrusted-fork-pr',
    });
  });

  it('keeps review execution but disables posting when requested', () => {
    const inputs = { ...baseInputs, postResults: false };
    expect(determineActionPolicy(inputs, env({ GITHUB_TOKEN: TOKEN, GROQ_API_KEY: 'key' }))).toEqual({
      shouldRunReview: true,
      shouldPostResults: false,
      degraded: true,
      degradedReason: 'posting-disabled',
    });
  });

  it('skips PR contexts without trusted base/head repository metadata before provider-backed work', () => {
    const inputs = { ...baseInputs, baseRepo: undefined, headRepo: undefined };
    expect(determineActionPolicy(inputs, env({ GITHUB_TOKEN: TOKEN, GROQ_API_KEY: 'key' }))).toEqual({
      shouldRunReview: false,
      shouldPostResults: false,
      degraded: true,
      degradedReason: 'untrusted-github-context',
      verdictOverride: 'SKIPPED',
    });
  });

  it('denies privileged PR GitHub operations when token or PR context is not trusted', () => {
    const trustedContext = {
      token: TOKEN,
      repository: 'owner/repo',
      baseRepo: 'owner/repo',
      headRepo: 'owner/repo',
      eventName: 'pull_request',
    };
    const prOperations = [
      'review-comment',
      'issue-comment',
      'commit-status',
      'check-run',
      'reviewer-mutation',
      'label-mutation',
    ] as const;

    for (const operation of prOperations) {
      expect(evaluatePrivilegedGitHubOperation(operation, trustedContext)).toEqual({
        allowed: true,
        operation,
      });

      expect(evaluatePrivilegedGitHubOperation(operation, {
        ...trustedContext,
        token: '',
      })).toMatchObject({
        allowed: false,
        operation,
        degradedReason: 'missing-github-token',
      });

      expect(evaluatePrivilegedGitHubOperation(operation, {
        ...trustedContext,
        headRepo: 'contributor/repo',
      })).toMatchObject({
        allowed: false,
        operation,
        degradedReason: 'untrusted-fork-pr',
      });

      expect(evaluatePrivilegedGitHubOperation(operation, {
        ...trustedContext,
        headRepo: undefined,
      })).toMatchObject({
        allowed: false,
        operation,
        degradedReason: 'untrusted-github-context',
      });
    }
  });

  it('denies privileged release publication outside a trusted version-tag push context', () => {
    expect(evaluatePrivilegedGitHubOperation('release', {
      token: TOKEN,
      eventName: 'push',
      ref: 'refs/tags/v0.1.0-rc.7',
      repository: 'owner/repo',
    })).toEqual({
      allowed: true,
      operation: 'release',
    });

    expect(evaluatePrivilegedGitHubOperation('release', {
      token: '',
      eventName: 'push',
      ref: 'refs/tags/v0.1.0-rc.7',
      repository: 'owner/repo',
    })).toMatchObject({
      allowed: false,
      operation: 'release',
      degradedReason: 'missing-github-token',
    });

    expect(evaluatePrivilegedGitHubOperation('release', {
      token: TOKEN,
      eventName: 'pull_request',
      ref: 'refs/pull/42/merge',
      repository: 'owner/repo',
      baseRepo: 'owner/repo',
      headRepo: 'contributor/repo',
    })).toMatchObject({
      allowed: false,
      operation: 'release',
      degradedReason: 'untrusted-github-context',
    });
  });

  it('detects only retained provider credentials, not GITHUB_TOKEN', () => {
    expect(hasProviderCredentials(env({ GITHUB_TOKEN: TOKEN }))).toBe(false);
    expect(hasProviderCredentials(env({ GITHUB_TOKEN: TOKEN, OPENAI_API_KEY: 'sk-test' }))).toBe(true);
  });

  it('detects stale head SHAs before posting', () => {
    expect(isStaleHead('head123', 'head123')).toBe(false);
    expect(isStaleHead('head123', 'head456')).toBe(true);
  });

  it('accepts least-privilege permissions for the default check-run reporter', () => {
    expect(getRequiredGitHubTokenPermissions()).toEqual({
      contents: 'read',
      'pull-requests': 'write',
      checks: 'write',
    });

    expect(validateGitHubTokenPermissions({
      contents: 'read',
      'pull-requests': 'write',
      checks: 'write',
    })).toEqual({
      valid: true,
      required: {
        contents: 'read',
        'pull-requests': 'write',
        checks: 'write',
      },
      missing: [],
      excessive: [],
    });
  });

  it('accepts least-privilege permissions for commit-status and SARIF variants', () => {
    expect(validateGitHubTokenPermissions({
      contents: 'read',
      'pull-requests': 'write',
      statuses: 'write',
    }, { reporterMode: 'commit-status' })).toMatchObject({ valid: true });

    expect(validateGitHubTokenPermissions({
      contents: 'read',
      'pull-requests': 'write',
      checks: 'write',
      'security-events': 'write',
    }, { reporterMode: 'check-run', uploadSarif: true })).toMatchObject({ valid: true });
  });

  it('rejects missing or underpowered GitHub token permissions', () => {
    expect(validateGitHubTokenPermissions(undefined)).toMatchObject({
      valid: false,
      missing: ['contents: read', 'pull-requests: write', 'checks: write'],
      excessive: [],
    });

    expect(validateGitHubTokenPermissions({
      contents: 'read',
      'pull-requests': 'read',
    })).toMatchObject({
      valid: false,
      missing: ['pull-requests: write', 'checks: write'],
      excessive: [],
    });
  });

  it('rejects excessive GitHub token permissions', () => {
    expect(validateGitHubTokenPermissions('write-all')).toMatchObject({
      valid: false,
      missing: [],
      excessive: ['write-all'],
    });

    expect(validateGitHubTokenPermissions({
      contents: 'write',
      'pull-requests': 'write',
      checks: 'write',
      statuses: 'write',
      issues: 'write',
    })).toMatchObject({
      valid: false,
      missing: [],
      excessive: ['contents: write', 'statuses: write', 'issues: write'],
    });
  });

  it('keeps documented and repository CodeAgora workflows least-privileged', () => {
    const template = parseYaml(fs.readFileSync('packages/shared/src/data/github-actions-template.yml', 'utf-8'));
    const reviewWorkflow = parseYaml(fs.readFileSync('.github/workflows/review.yml', 'utf-8'));

    expect(validateGitHubTokenPermissions(template.permissions, {
      reporterMode: 'check-run',
      uploadSarif: true,
    })).toMatchObject({ valid: true });

    expect(validateGitHubTokenPermissions(reviewWorkflow.permissions, {
      reporterMode: 'check-run',
    })).toMatchObject({ valid: true });
  });

  it('registers every degraded reason emitted by the Action runtime', () => {
    expect(ACTION_DEGRADED_REASONS).toEqual(expect.arrayContaining([
      'missing-github-token',
      'untrusted-github-context',
      'missing-provider-secrets',
      'untrusted-fork-pr',
      'fork-missing-provider-secrets',
      'posting-disabled',
      'diff-too-large',
      'config-load-failed',
      'stale-head-sha',
      'github-post-failed',
      'sarif-write-failed',
    ]));
  });

  it('does not emit degraded reasons outside the shared registry', () => {
    const registry = new Set<string>(ACTION_DEGRADED_REASONS);
    const sourceFiles = [
      'packages/github/src/action-policy.ts',
      'packages/github/src/action.ts',
    ];

    for (const file of sourceFiles) {
      const source = fs.readFileSync(file, 'utf-8');
      const emittedReasons = [
        ...source.matchAll(/degradedReason:\s*'([^']+)'/g),
        ...source.matchAll(/setActionDegraded\('([^']+)'\)/g),
      ].map((match) => match[1]);

      for (const reason of emittedReasons) {
        expect(registry.has(reason), `${file} emits unregistered degraded reason: ${reason}`).toBe(true);
      }
    }
  });

  it('maps degraded reasons to actionable next steps', () => {
    const missingSecrets = getActionGuidance('missing-provider-secrets');
    expect(missingSecrets.why).toContain('provider credential');
    const missingSecretText = missingSecrets.nextSteps.join('\n');
    for (const envVar of new Set(Object.values(PROVIDER_ENV_VARS))) {
      expect(missingSecretText).toContain(envVar);
    }
    expect(missingSecrets.nextSteps).toEqual(expect.arrayContaining([
      expect.stringContaining('agora env set openrouter <api-key>'),
      expect.stringContaining('agora review --dry-run'),
      expect.stringContaining('MCP `dry_run`'),
    ]));

    const untrustedContext = getActionGuidance('untrusted-github-context');
    expect(untrustedContext.why).toContain('workflow context');
    expect(untrustedContext.nextSteps).toEqual(expect.arrayContaining([
      expect.stringContaining('pull_request event'),
      expect.stringContaining('version-tag release workflow'),
    ]));

    const forkSecrets = getActionGuidance('fork-missing-provider-secrets');
    expect(forkSecrets.nextSteps).toEqual(expect.arrayContaining([
      expect.stringContaining('trusted branch'),
      expect.stringContaining('agora doctor --live'),
    ]));

    const untrustedFork = getActionGuidance('untrusted-fork-pr');
    expect(untrustedFork.why).toContain('fork');
    expect(untrustedFork.nextSteps).toEqual(expect.arrayContaining([
      expect.stringContaining('trusted branch'),
      expect.stringContaining('provider-backed review disabled'),
    ]));

    const staleHead = getActionGuidance('stale-head-sha');
    expect(staleHead.why).toContain('PR head changed');
    expect(staleHead.nextSteps).toEqual(expect.arrayContaining([
      expect.stringContaining('Rerun the workflow'),
      expect.stringContaining('branch head'),
    ]));
  });
});
