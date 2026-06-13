import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { resolveReviewedPrCommitSha } from '../action-event.js';

const HEAD_SHA = '0123456789abcdef0123456789abcdef01234567';
const WORKFLOW_SHA = 'fedcba9876543210fedcba9876543210fedcba98';

async function writeEventPayload(payload: unknown): Promise<{ dir: string; path: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'codeagora-action-event-'));
  const eventPath = path.join(dir, 'event.json');
  await writeFile(eventPath, typeof payload === 'string' ? payload : JSON.stringify(payload));
  return { dir, path: eventPath };
}

describe('GitHub Action event payload SHA resolution', () => {
  it('selects pull_request.head.sha instead of the workflow SHA', async () => {
    const event = await writeEventPayload({
      pull_request: {
        head: { sha: HEAD_SHA },
      },
    });

    try {
      expect(resolveReviewedPrCommitSha({
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: event.path,
        GITHUB_SHA: WORKFLOW_SHA,
      })).toBe(HEAD_SHA);
    } finally {
      await rm(event.dir, { recursive: true, force: true });
    }
  });

  it('rejects missing event paths', () => {
    expect(() => resolveReviewedPrCommitSha({ GITHUB_EVENT_NAME: 'pull_request' })).toThrow(
      'GITHUB_EVENT_PATH is required',
    );
  });

  it('rejects invalid JSON payloads', async () => {
    const event = await writeEventPayload('{not json');

    try {
      expect(() => resolveReviewedPrCommitSha({
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: event.path,
      })).toThrow('Unable to read valid GitHub pull_request event payload');
    } finally {
      await rm(event.dir, { recursive: true, force: true });
    }
  });

  it('rejects payloads missing pull_request.head.sha', async () => {
    const event = await writeEventPayload({ pull_request: { head: {} } });

    try {
      expect(() => resolveReviewedPrCommitSha({
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: event.path,
      })).toThrow('missing pull_request.head.sha');
    } finally {
      await rm(event.dir, { recursive: true, force: true });
    }
  });

  it('rejects non-commit SHA payload values', async () => {
    const event = await writeEventPayload({
      pull_request: {
        head: { sha: 'merge-ref-or-short-sha' },
      },
    });

    try {
      expect(() => resolveReviewedPrCommitSha({
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: event.path,
      })).toThrow('40-character commit SHA');
    } finally {
      await rm(event.dir, { recursive: true, force: true });
    }
  });
});
