/**
 * Session Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '@codeagora/core/session/manager.js';
import { readSessionMetadata, getSessionDir } from '@codeagora/shared/utils/fs.js';
import fs from 'fs/promises';

describe('SessionManager', () => {
  const testDiffPath = '/tmp/test-diff.txt';

  beforeEach(async () => {
    // Cleanup before each test
    try {
      await fs.rm('.ca', { recursive: true, force: true });
    } catch {}
  });

  afterEach(async () => {
    // Cleanup test sessions
    try {
      await fs.rm('.ca', { recursive: true, force: true });
    } catch {}
  });

  it('should create a new session', async () => {
    const session = await SessionManager.create(testDiffPath);

    expect(session.getSessionId()).toBe('001');
    expect(session.getDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const metadata = session.getMetadata();
    expect(metadata.status).toBe('in_progress');
    expect(metadata.diffPath).toBe(testDiffPath);
  });

  it('should create session directories', async () => {
    const session = await SessionManager.create(testDiffPath);
    const sessionDir = session.getDir();

    const reviewsDir = `${sessionDir}/reviews`;
    const discussionsDir = `${sessionDir}/discussions`;
    const unconfirmedDir = `${sessionDir}/unconfirmed`;

    const [reviews, discussions, unconfirmed] = await Promise.all([
      fs.stat(reviewsDir),
      fs.stat(discussionsDir),
      fs.stat(unconfirmedDir),
    ]);

    expect(reviews.isDirectory()).toBe(true);
    expect(discussions.isDirectory()).toBe(true);
    expect(unconfirmed.isDirectory()).toBe(true);
  });

  it('should increment session ID', async () => {
    const session1 = await SessionManager.create(testDiffPath);
    const session2 = await SessionManager.create(testDiffPath);

    expect(session1.getSessionId()).toBe('001');
    expect(session2.getSessionId()).toBe('002');
  });

  it('should update session status', async () => {
    const session = await SessionManager.create(testDiffPath);

    await session.setStatus('completed');

    const metadata = await readSessionMetadata(
      session.getDate(),
      session.getSessionId()
    );

    expect(metadata.status).toBe('completed');
    expect(metadata.completedAt).toBeDefined();
  });
});
