/**
 * GitHub Integration Tests
 * Tests for PR URL parsing, git remote parsing, config creation,
 * and mocked Octokit API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePrUrl, parseGitRemote, createGitHubConfig } from '@codeagora/github/client.js';
import type { GitHubConfig } from '@codeagora/github/client.js';

// ============================================================================
// Mock @octokit/rest
// ============================================================================

const mockCreateComment = vi.fn();
const mockListComments = vi.fn();
const mockUpdateComment = vi.fn();
const mockPullsGet = vi.fn();
const mockPaginate = vi.fn();

vi.mock('@octokit/rest', () => {
  return {
    Octokit: vi.fn().mockImplementation(() => ({
      pulls: {
        get: mockPullsGet,
      },
      issues: {
        createComment: mockCreateComment,
        listComments: mockListComments,
        updateComment: mockUpdateComment,
      },
      paginate: mockPaginate,
    })),
  };
});

// ============================================================================
// parsePrUrl
// ============================================================================

describe('parsePrUrl', () => {
  it('parses a valid PR URL', () => {
    const result = parsePrUrl('https://github.com/owner/repo/pull/123');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', number: 123 });
  });

  it('parses a valid PR URL with trailing slash', () => {
    const result = parsePrUrl('https://github.com/owner/repo/pull/456/');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', number: 456 });
  });

  it('returns null for a completely invalid URL', () => {
    expect(parsePrUrl('not-a-url')).toBeNull();
  });

  it('returns null for a GitHub URL that is not a PR', () => {
    expect(parsePrUrl('https://github.com/owner/repo/issues/42')).toBeNull();
  });

  it('returns null for a GitHub repo root URL', () => {
    expect(parsePrUrl('https://github.com/owner/repo')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parsePrUrl('')).toBeNull();
  });
});

// ============================================================================
// parseGitRemote
// ============================================================================

describe('parseGitRemote', () => {
  it('parses an SSH remote URL', () => {
    const result = parseGitRemote('git@github.com:owner/repo.git');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('parses an SSH remote URL without .git suffix', () => {
    const result = parseGitRemote('git@github.com:owner/repo');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('parses an HTTPS remote URL with .git suffix', () => {
    const result = parseGitRemote('https://github.com/owner/repo.git');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('parses an HTTPS remote URL without .git suffix', () => {
    const result = parseGitRemote('https://github.com/owner/repo');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('returns null for a non-GitHub remote', () => {
    expect(parseGitRemote('https://gitlab.com/owner/repo.git')).toBeNull();
  });

  it('returns null for a completely invalid remote URL', () => {
    expect(parseGitRemote('not-a-remote')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseGitRemote('')).toBeNull();
  });
});

// ============================================================================
// createGitHubConfig
// ============================================================================

describe('createGitHubConfig', () => {
  beforeEach(() => {
    delete process.env['GITHUB_TOKEN'];
  });

  it('creates config from token + prUrl', () => {
    const config = createGitHubConfig({
      token: 'ghp_test',
      prUrl: 'https://github.com/acme/api/pull/99',
    });
    expect(config).toEqual({ token: 'ghp_test', owner: 'acme', repo: 'api', prNumber: 99 });
  });

  it('creates config from token + remoteUrl + prNumber', () => {
    const config = createGitHubConfig({
      token: 'ghp_test',
      remoteUrl: 'git@github.com:acme/api.git',
      prNumber: 7,
    });
    expect(config).toEqual({ token: 'ghp_test', owner: 'acme', repo: 'api', prNumber: 7 });
  });

  it('reads token from GITHUB_TOKEN env variable', () => {
    process.env['GITHUB_TOKEN'] = 'env_token';
    const config = createGitHubConfig({
      prUrl: 'https://github.com/acme/api/pull/1',
    });
    expect(config.token).toBe('env_token');
  });

  it('throws when no token is available', () => {
    expect(() =>
      createGitHubConfig({ prUrl: 'https://github.com/acme/api/pull/1' })
    ).toThrow(/token/i);
  });

  it('throws when prUrl is invalid', () => {
    expect(() =>
      createGitHubConfig({ token: 'ghp_test', prUrl: 'https://github.com/acme/api' })
    ).toThrow(/Invalid GitHub PR URL/);
  });

  it('throws when neither prUrl nor remoteUrl+prNumber are provided', () => {
    expect(() =>
      createGitHubConfig({ token: 'ghp_test' })
    ).toThrow();
  });
});

// ============================================================================
// fetchPrDiff (mocked Octokit)
// ============================================================================

describe('fetchPrDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns PullRequestInfo with diff from mocked Octokit', async () => {
    const { fetchPrDiff } = await import('@codeagora/github/pr-diff.js');

    const prMeta = {
      number: 42,
      title: 'Add feature X',
      base: { ref: 'main' },
      head: { ref: 'feature/x' },
    };
    const fakeDiff = 'diff --git a/foo.ts b/foo.ts\n+added line';

    // First call returns JSON metadata, second returns raw diff
    mockPullsGet
      .mockResolvedValueOnce({ data: prMeta })
      .mockResolvedValueOnce({ data: fakeDiff });

    const config: GitHubConfig = { token: 'tok', owner: 'o', repo: 'r' };
    const result = await fetchPrDiff(config, 42);

    expect(result).toEqual({
      number: 42,
      title: 'Add feature X',
      baseBranch: 'main',
      headBranch: 'feature/x',
      diff: fakeDiff,
    });
  });
});

// ============================================================================
// postPrComment (mocked Octokit)
// ============================================================================

describe('postPrComment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns id and url from mocked createComment', async () => {
    const { postPrComment } = await import('@codeagora/github/comment.js');

    mockCreateComment.mockResolvedValue({
      data: { id: 101, html_url: 'https://github.com/o/r/issues/1#issuecomment-101' },
    });

    const config: GitHubConfig = { token: 'tok', owner: 'o', repo: 'r' };
    const result = await postPrComment(config, 1, 'Review body');

    expect(result).toEqual({
      id: 101,
      url: 'https://github.com/o/r/issues/1#issuecomment-101',
    });
    expect(mockCreateComment).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      issue_number: 1,
      body: 'Review body',
    });
  });
});

// ============================================================================
// findExistingComment (mocked Octokit)
// ============================================================================

describe('findExistingComment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns id when a comment containing the marker is found', async () => {
    const { findExistingComment } = await import('@codeagora/github/comment.js');

    mockPaginate.mockResolvedValue([
      { id: 200, body: 'Some other comment' },
      { id: 201, body: '<!-- CodeAgora --> Review results here' },
    ]);

    const config: GitHubConfig = { token: 'tok', owner: 'o', repo: 'r' };
    const result = await findExistingComment(config, 5, '<!-- CodeAgora -->');

    expect(result).toEqual({ id: 201 });
  });

  it('returns null when no comment contains the marker', async () => {
    const { findExistingComment } = await import('@codeagora/github/comment.js');

    mockPaginate.mockResolvedValue([
      { id: 300, body: 'Unrelated comment' },
    ]);

    const config: GitHubConfig = { token: 'tok', owner: 'o', repo: 'r' };
    const result = await findExistingComment(config, 5, '<!-- CodeAgora -->');

    expect(result).toBeNull();
  });

  it('returns null when there are no comments', async () => {
    const { findExistingComment } = await import('@codeagora/github/comment.js');

    mockPaginate.mockResolvedValue([]);

    const config: GitHubConfig = { token: 'tok', owner: 'o', repo: 'r' };
    const result = await findExistingComment(config, 5, '<!-- CodeAgora -->');

    expect(result).toBeNull();
  });
});
