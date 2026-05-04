/**
 * GitHub Action input and policy tests.
 */

import { describe, it, expect } from 'vitest';
import {
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

  it('skips same-repository PRs without provider credentials with a clear reason', () => {
    expect(determineActionPolicy(baseInputs, env({ GITHUB_TOKEN: TOKEN }))).toEqual({
      shouldRunReview: false,
      shouldPostResults: false,
      degraded: true,
      degradedReason: 'missing-provider-secrets',
      verdictOverride: 'SKIPPED',
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

  it('detects provider credentials without treating GITHUB_TOKEN as an LLM secret', () => {
    expect(hasProviderCredentials(env({ GITHUB_TOKEN: TOKEN }))).toBe(false);
    expect(hasProviderCredentials(env({ GITHUB_TOKEN: TOKEN, OPENAI_API_KEY: 'sk-test' }))).toBe(true);
  });

  it('detects stale head SHAs before posting', () => {
    expect(isStaleHead('head123', 'head123')).toBe(false);
    expect(isStaleHead('head123', 'head456')).toBe(true);
  });
});
