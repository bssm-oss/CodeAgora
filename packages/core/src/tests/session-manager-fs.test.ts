/**
 * SessionManager — real filesystem tests
 *
 * Files land in process.cwd()/.ca/ (relative paths in shared/utils/fs.ts).
 * We clean up after each test using the resolved absolute paths.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { rm, readFile, access } from 'fs/promises';
import path from 'path';
import { SessionManager } from '../session/manager.js';

describe('SessionManager (real fs)', () => {
  const cwd = process.cwd();
  const caRoot = path.join(cwd, '.ca');

  afterEach(async () => {
    // Best-effort cleanup of .ca/ sessions created during tests
    await rm(path.join(caRoot, 'sessions'), { recursive: true, force: true });
    await rm(path.join(caRoot, 'logs'), { recursive: true, force: true });
  });

  it('create() initialises the .ca session directory structure', async () => {
    const sm = await SessionManager.create('/tmp/diff.patch');

    const sessionDir = path.join(cwd, sm.getDir());
    await expect(access(sessionDir)).resolves.toBeUndefined();
    await expect(access(path.join(sessionDir, 'reviews'))).resolves.toBeUndefined();
    await expect(access(path.join(sessionDir, 'discussions'))).resolves.toBeUndefined();
  });

  it('create() writes metadata.json with correct fields', async () => {
    const diffPath = '/some/diff.patch';
    const before = Date.now();
    const sm = await SessionManager.create(diffPath);
    const after = Date.now();

    const metaPath = path.join(cwd, sm.getDir(), 'metadata.json');
    const meta = JSON.parse(await readFile(metaPath, 'utf-8'));

    expect(meta.diffPath).toBe(diffPath);
    expect(meta.status).toBe('in_progress');
    expect(meta.startedAt).toBeGreaterThanOrEqual(before);
    expect(meta.startedAt).toBeLessThanOrEqual(after);
    expect(typeof meta.sessionId).toBe('string');
  });

  it('getMetadata() returns the stored metadata', async () => {
    const sm = await SessionManager.create('/tmp/test.diff');
    const meta = sm.getMetadata();

    expect(meta.status).toBe('in_progress');
    expect(meta.diffPath).toBe('/tmp/test.diff');
    expect(meta.sessionId).toBeTruthy();
    expect(meta.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('setStatus() updates status to completed and writes to disk', async () => {
    const sm = await SessionManager.create('/tmp/diff.patch');
    await sm.setStatus('completed');

    expect(sm.getMetadata().status).toBe('completed');

    const metaPath = path.join(cwd, sm.getDir(), 'metadata.json');
    const meta = JSON.parse(await readFile(metaPath, 'utf-8'));
    expect(meta.status).toBe('completed');
    expect(typeof meta.completedAt).toBe('number');
  });

  it('setStatus() updates status to failed', async () => {
    const sm = await SessionManager.create('/tmp/diff.patch');
    await sm.setStatus('failed');

    expect(sm.getMetadata().status).toBe('failed');
    const meta = JSON.parse(await readFile(path.join(cwd, sm.getDir(), 'metadata.json'), 'utf-8'));
    expect(meta.status).toBe('failed');
    expect(typeof meta.completedAt).toBe('number');
  });

  it('getDir() returns a relative .ca/sessions/... path', async () => {
    const sm = await SessionManager.create('/tmp/diff.patch');
    expect(sm.getDir()).toMatch(/\.ca[/\\]sessions/);
  });

  it('getSessionId() returns a zero-padded numeric string', async () => {
    const sm = await SessionManager.create('/tmp/diff.patch');
    expect(sm.getSessionId()).toMatch(/^\d{3}$/);
  });
});
