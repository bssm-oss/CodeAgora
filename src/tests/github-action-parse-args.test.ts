/**
 * GitHub Action input and policy tests.
 */

import fs from 'fs';
import { describe, it, expect } from 'vitest';
import { ACTION_DEGRADED_REASONS } from '@codeagora/shared/contracts/stable.js';
import {
  formatActionWarning,
  determineActionPolicy,
  hasProviderCredentials,
  isForkContext,
  isStaleHead,
  parseActionInputs,
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
  });

  it('parses production-path metadata and posting controls', () => {
    const result = parseActionInputs([
      ...validArgv,
      '--fail-on-reject', 'true',
      '--max-diff-lines', '1000',
      '--post-results', 'false',
      '--base-sha', 'base123',
      '--base-repo', 'owner/repo',
      '--head-repo', 'fork/repo',
    ], env({ GITHUB_TOKEN: TOKEN }));

    expect(result.failOnReject).toBe(true);
    expect(result.maxDiffLines).toBe(1000);
    expect(result.postResults).toBe(false);
    expect(result.baseSha).toBe('base123');
    expect(result.baseRepo).toBe('owner/repo');
    expect(result.headRepo).toBe('fork/repo');
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

  it('formats actionable action warnings with reason, context, and next step', () => {
    const warning = formatActionWarning('missing-provider-secrets', 'Add the required provider secret(s) or switch the config to GitHub Models.', 'No provider secret was available.');

    expect(warning).toContain('::warning::CodeAgora missing-provider-secrets');
    expect(warning).toContain('Context: No provider secret was available.');
    expect(warning).toContain('Next step: Add the required provider secret(s) or switch the config to GitHub Models.');
  });

  it('escapes workflow command control characters in action warnings', () => {
    const warning = formatActionWarning('github-post-failed', 'Retry after fixing permissions.', 'line one\nline two with 100% value');

    expect(warning).toContain('line one%0Aline two with 100%25 value');
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

  it('runs same-repository PRs with only GITHUB_TOKEN for GitHub Models', () => {
    expect(determineActionPolicy(baseInputs, env({ GITHUB_TOKEN: TOKEN }))).toEqual({
      shouldRunReview: true,
      shouldPostResults: true,
      degraded: false,
    });
  });

  it('skips fork PRs without provider credentials to avoid secret-dependent failures', () => {
    const inputs = { ...baseInputs, baseRepo: 'owner/repo', headRepo: 'fork/repo' };
    expect(isForkContext(inputs)).toBe(true);
    expect(determineActionPolicy(inputs, env({ GITHUB_TOKEN: TOKEN }))).toEqual({
      shouldRunReview: false,
      shouldPostResults: false,
      degraded: true,
      degradedReason: 'fork-missing-provider-secrets',
      verdictOverride: 'SKIPPED',
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

  it('detects provider credentials while allowing callers to exclude GITHUB_TOKEN', () => {
    expect(hasProviderCredentials(env({ GITHUB_TOKEN: TOKEN }))).toBe(true);
    expect(hasProviderCredentials(env({ GITHUB_TOKEN: TOKEN }), { allowGitHubTokenAsProvider: false })).toBe(false);
    expect(hasProviderCredentials(env({ GITHUB_TOKEN: TOKEN, OPENAI_API_KEY: 'sk-test' }))).toBe(true);
  });

  it('detects stale head SHAs before posting', () => {
    expect(isStaleHead('head123', 'head123')).toBe(false);
    expect(isStaleHead('head123', 'head456')).toBe(true);
  });

  it('registers every degraded reason emitted by the Action runtime', () => {
    expect(ACTION_DEGRADED_REASONS).toEqual(expect.arrayContaining([
      'missing-github-token',
      'missing-provider-secrets',
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
});
