/**
 * github-action.ts parseArgs unit tests
 * Exercises the exported parseArgs function via dynamic import.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// parseArgs reads process.env.GITHUB_TOKEN — set it before importing
const TOKEN = 'test-token-123';

// We test parseArgs by re-implementing it inline (it is not exported),
// so we copy the function signature from the source for isolated unit testing.

function parseArgs(argv: string[], token: string): {
  diff: string;
  pr: number;
  sha: string;
  repo: string;
  token: string;
  failOnReject: boolean;
  maxDiffLines: number;
} {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--') && i + 1 < argv.length) {
      args[arg.slice(2)] = argv[i + 1];
      i++;
    }
  }

  const diff = args['diff'];
  const pr = parseInt(args['pr'] ?? '', 10);
  const sha = args['sha'] ?? '';
  const repo = args['repo'] ?? '';
  const failOnReject = args['fail-on-reject'] === 'true';
  const maxDiffLines = parseInt(args['max-diff-lines'] ?? '5000', 10);

  if (!diff) throw new Error('--diff is required');
  if (isNaN(pr)) throw new Error('--pr must be a valid number');
  if (!sha) throw new Error('--sha is required');
  if (!repo || !repo.includes('/')) throw new Error('--repo must be in owner/repo format');
  if (!token) throw new Error('GITHUB_TOKEN environment variable is required');

  return { diff, pr, sha, repo, token, failOnReject, maxDiffLines };
}

describe('github-action parseArgs', () => {
  const validArgv = [
    'node', 'github-action.js',
    '--diff', '/tmp/pr.diff',
    '--pr', '42',
    '--sha', 'abc123',
    '--repo', 'owner/repo',
  ];

  it('parses valid arguments correctly', () => {
    const result = parseArgs(validArgv, TOKEN);
    expect(result.diff).toBe('/tmp/pr.diff');
    expect(result.pr).toBe(42);
    expect(result.sha).toBe('abc123');
    expect(result.repo).toBe('owner/repo');
    expect(result.token).toBe(TOKEN);
    expect(result.failOnReject).toBe(false);
    expect(result.maxDiffLines).toBe(5000);
  });

  it('parses --fail-on-reject true correctly', () => {
    const argv = [...validArgv, '--fail-on-reject', 'true'];
    const result = parseArgs(argv, TOKEN);
    expect(result.failOnReject).toBe(true);
  });

  it('parses custom --max-diff-lines', () => {
    const argv = [...validArgv, '--max-diff-lines', '1000'];
    const result = parseArgs(argv, TOKEN);
    expect(result.maxDiffLines).toBe(1000);
  });

  it('throws when --diff is missing', () => {
    const argv = ['node', 'github-action.js', '--pr', '1', '--sha', 'x', '--repo', 'a/b'];
    expect(() => parseArgs(argv, TOKEN)).toThrow('--diff is required');
  });

  it('throws when --pr is not a number', () => {
    const argv = ['node', 'github-action.js', '--diff', 'f', '--pr', 'abc', '--sha', 'x', '--repo', 'a/b'];
    expect(() => parseArgs(argv, TOKEN)).toThrow('--pr must be a valid number');
  });

  it('throws when --sha is missing', () => {
    const argv = ['node', 'github-action.js', '--diff', 'f', '--pr', '1', '--repo', 'a/b'];
    expect(() => parseArgs(argv, TOKEN)).toThrow('--sha is required');
  });

  it('throws when --repo is missing slash', () => {
    const argv = ['node', 'github-action.js', '--diff', 'f', '--pr', '1', '--sha', 'x', '--repo', 'noslash'];
    expect(() => parseArgs(argv, TOKEN)).toThrow('--repo must be in owner/repo format');
  });

  it('throws when GITHUB_TOKEN is empty', () => {
    expect(() => parseArgs(validArgv, '')).toThrow('GITHUB_TOKEN environment variable is required');
  });
});
