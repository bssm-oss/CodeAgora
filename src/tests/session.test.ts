/**
 * Session Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '@codeagora/core/session/manager.js';
import { readSessionMetadata, getSessionDir } from '@codeagora/shared/utils/fs.js';
import { SESSION_ARTIFACT_SCHEMA_VERSION } from '@codeagora/shared/contracts/stable.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

describe('SessionManager', () => {
  const testDiffPath = '/tmp/test-diff.txt';
  const previousCaRoot = process.env['CODEAGORA_CA_ROOT'];
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-session-test-'));
    process.env['CODEAGORA_CA_ROOT'] = path.join(tmpRoot, '.ca');
  });

  afterEach(async () => {
    if (previousCaRoot === undefined) {
      delete process.env['CODEAGORA_CA_ROOT'];
    } else {
      process.env['CODEAGORA_CA_ROOT'] = previousCaRoot;
    }
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('should create a new session', async () => {
    const session = await SessionManager.create(testDiffPath);

    expect(session.getSessionId()).toBe('001');
    expect(session.getDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const metadata = session.getMetadata();
    expect(metadata.schemaVersion).toBe(SESSION_ARTIFACT_SCHEMA_VERSION);
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

    expect(metadata.schemaVersion).toBe(SESSION_ARTIFACT_SCHEMA_VERSION);
    expect(metadata.status).toBe('completed');
    expect(metadata.completedAt).toBeDefined();
  });
});
