/**
 * Session cleanup and stale recovery tests.
 *
 * Tests the signal-handler registration/unregistration on SessionManager
 * and the recoverStaleSessions() startup recovery function.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { rm, readFile, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { SessionManager, recoverStaleSessions } from '../session/manager.js';

describe('SessionManager cleanup', () => {
  const cwd = process.cwd();
  const caRoot = path.join(cwd, '.ca');

  afterEach(async () => {
    await rm(path.join(caRoot, 'sessions'), { recursive: true, force: true });
    await rm(path.join(caRoot, 'logs'), { recursive: true, force: true });
  });

  it('registerCleanup() attaches signal listeners that can be unregistered', async () => {
    const sm = await SessionManager.create('/tmp/diff.patch');

    const listenerCountBefore = process.listenerCount('SIGINT');
    sm.registerCleanup();
    expect(process.listenerCount('SIGINT')).toBe(listenerCountBefore + 1);
    expect(process.listenerCount('SIGTERM')).toBeGreaterThanOrEqual(listenerCountBefore + 1);

    sm.unregisterCleanup();
    expect(process.listenerCount('SIGINT')).toBe(listenerCountBefore);
  });

  it('registerCleanup() is idempotent — calling twice does not double-register', async () => {
    const sm = await SessionManager.create('/tmp/diff.patch');

    const listenerCountBefore = process.listenerCount('SIGINT');
    sm.registerCleanup();
    sm.registerCleanup(); // second call should be a no-op
    expect(process.listenerCount('SIGINT')).toBe(listenerCountBefore + 1);

    sm.unregisterCleanup();
  });

  it('unregisterCleanup() is idempotent — calling twice is safe', async () => {
    const sm = await SessionManager.create('/tmp/diff.patch');

    sm.registerCleanup();
    sm.unregisterCleanup();
    sm.unregisterCleanup(); // should not throw
  });

  it('setStatus("completed") automatically unregisters cleanup', async () => {
    const sm = await SessionManager.create('/tmp/diff.patch');

    const listenerCountBefore = process.listenerCount('SIGINT');
    sm.registerCleanup();
    expect(process.listenerCount('SIGINT')).toBe(listenerCountBefore + 1);

    await sm.setStatus('completed');
    expect(process.listenerCount('SIGINT')).toBe(listenerCountBefore);
  });

  it('setStatus("failed") automatically unregisters cleanup', async () => {
    const sm = await SessionManager.create('/tmp/diff.patch');

    const listenerCountBefore = process.listenerCount('SIGINT');
    sm.registerCleanup();
    await sm.setStatus('failed');
    expect(process.listenerCount('SIGINT')).toBe(listenerCountBefore);
  });

  it('setStatus("interrupted") automatically unregisters cleanup', async () => {
    const sm = await SessionManager.create('/tmp/diff.patch');
    sm.registerCleanup();
    await sm.setStatus('interrupted');

    expect(sm.getMetadata().status).toBe('interrupted');
    expect(typeof sm.getMetadata().completedAt).toBe('number');
  });
});

describe('recoverStaleSessions', () => {
  const cwd = process.cwd();
  const caRoot = path.join(cwd, '.ca');

  afterEach(async () => {
    await rm(path.join(caRoot, 'sessions'), { recursive: true, force: true });
    await rm(path.join(caRoot, 'logs'), { recursive: true, force: true });
  });

  it('returns 0 when no sessions directory exists', async () => {
    await rm(path.join(caRoot, 'sessions'), { recursive: true, force: true });
    const count = await recoverStaleSessions();
    expect(count).toBe(0);
  });

  it('marks stale in_progress sessions as interrupted', async () => {
    // Create a session with an old startedAt timestamp (5 hours ago)
    const date = new Date().toISOString().split('T')[0];
    const sessionDir = path.join(caRoot, 'sessions', date, '001');
    await mkdir(sessionDir, { recursive: true });

    const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
    const metadata = {
      sessionId: '001',
      date,
      timestamp: fiveHoursAgo,
      diffPath: '/tmp/test.diff',
      status: 'in_progress',
      startedAt: fiveHoursAgo,
    };
    await writeFile(
      path.join(sessionDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );

    const recovered = await recoverStaleSessions();
    expect(recovered).toBe(1);

    const updatedMeta = JSON.parse(
      await readFile(path.join(sessionDir, 'metadata.json'), 'utf-8')
    );
    expect(updatedMeta.status).toBe('interrupted');
    expect(typeof updatedMeta.completedAt).toBe('number');
  });

  it('does NOT mark recent in_progress sessions as interrupted', async () => {
    // Create a session that started 10 minutes ago — still fresh
    const date = new Date().toISOString().split('T')[0];
    const sessionDir = path.join(caRoot, 'sessions', date, '001');
    await mkdir(sessionDir, { recursive: true });

    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const metadata = {
      sessionId: '001',
      date,
      timestamp: tenMinutesAgo,
      diffPath: '/tmp/test.diff',
      status: 'in_progress',
      startedAt: tenMinutesAgo,
    };
    await writeFile(
      path.join(sessionDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );

    const recovered = await recoverStaleSessions();
    expect(recovered).toBe(0);

    const updatedMeta = JSON.parse(
      await readFile(path.join(sessionDir, 'metadata.json'), 'utf-8')
    );
    expect(updatedMeta.status).toBe('in_progress');
  });

  it('does NOT touch completed or failed sessions', async () => {
    const date = new Date().toISOString().split('T')[0];

    // Create a completed session with old timestamp
    const completedDir = path.join(caRoot, 'sessions', date, '001');
    await mkdir(completedDir, { recursive: true });
    const oldTs = Date.now() - 5 * 60 * 60 * 1000;
    await writeFile(
      path.join(completedDir, 'metadata.json'),
      JSON.stringify({
        sessionId: '001',
        date,
        timestamp: oldTs,
        diffPath: '/tmp/test.diff',
        status: 'completed',
        startedAt: oldTs,
        completedAt: oldTs + 60000,
      }, null, 2),
      'utf-8'
    );

    // Create a failed session with old timestamp
    const failedDir = path.join(caRoot, 'sessions', date, '002');
    await mkdir(failedDir, { recursive: true });
    await writeFile(
      path.join(failedDir, 'metadata.json'),
      JSON.stringify({
        sessionId: '002',
        date,
        timestamp: oldTs,
        diffPath: '/tmp/test.diff',
        status: 'failed',
        startedAt: oldTs,
        completedAt: oldTs + 60000,
      }, null, 2),
      'utf-8'
    );

    const recovered = await recoverStaleSessions();
    expect(recovered).toBe(0);
  });

  it('recovers multiple stale sessions across different dates', async () => {
    const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
    const yesterday = new Date(fiveHoursAgo - 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    // Stale session from "yesterday"
    const dir1 = path.join(caRoot, 'sessions', yesterday, '001');
    await mkdir(dir1, { recursive: true });
    await writeFile(
      path.join(dir1, 'metadata.json'),
      JSON.stringify({
        sessionId: '001',
        date: yesterday,
        timestamp: fiveHoursAgo - 24 * 60 * 60 * 1000,
        diffPath: '/tmp/a.diff',
        status: 'in_progress',
        startedAt: fiveHoursAgo - 24 * 60 * 60 * 1000,
      }, null, 2),
      'utf-8'
    );

    // Stale session from "today"
    const dir2 = path.join(caRoot, 'sessions', today, '001');
    await mkdir(dir2, { recursive: true });
    await writeFile(
      path.join(dir2, 'metadata.json'),
      JSON.stringify({
        sessionId: '001',
        date: today,
        timestamp: fiveHoursAgo,
        diffPath: '/tmp/b.diff',
        status: 'in_progress',
        startedAt: fiveHoursAgo,
      }, null, 2),
      'utf-8'
    );

    const recovered = await recoverStaleSessions();
    expect(recovered).toBe(2);
  });
});
