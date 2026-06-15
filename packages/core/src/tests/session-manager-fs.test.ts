/**
 * SessionManager — real filesystem tests
 *
 * Files land in process.cwd()/.ca/ (relative paths in shared/utils/fs.ts).
 * We clean up after each test using the resolved absolute paths.
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { rm, readFile, access, mkdtemp } from 'fs/promises';
import os from 'os';
import path from 'path';
import { SessionManager } from '../session/manager.js';
import { SESSION_ARTIFACT_SCHEMA_VERSION } from '@codeagora/shared/contracts/stable.js';

describe('SessionManager (real fs)', () => {
  const previousCaRoot = process.env['CODEAGORA_CA_ROOT'];
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'codeagora-session-fs-'));
    process.env['CODEAGORA_CA_ROOT'] = path.join(tmpRoot, '.ca');
  });

  afterEach(async () => {
    if (previousCaRoot === undefined) {
      delete process.env['CODEAGORA_CA_ROOT'];
    } else {
      process.env['CODEAGORA_CA_ROOT'] = previousCaRoot;
    }
    await rm(tmpRoot, { recursive: true, force: true });
  });

  function artifactPath(relativeOrAbsolutePath: string): string {
    return path.isAbsolute(relativeOrAbsolutePath)
      ? relativeOrAbsolutePath
      : path.join(process.cwd(), relativeOrAbsolutePath);
  }

  it('create() initialises the .ca session directory structure', async () => {
    const sm = await SessionManager.create('/tmp/diff.patch');

    const sessionDir = artifactPath(sm.getDir());
    await expect(access(sessionDir)).resolves.toBeUndefined();
    await expect(access(path.join(sessionDir, 'reviews'))).resolves.toBeUndefined();
    await expect(access(path.join(sessionDir, 'discussions'))).resolves.toBeUndefined();
  });

  it('create() writes metadata.json with correct fields', async () => {
    const diffPath = '/some/diff.patch';
    const before = Date.now();
    const sm = await SessionManager.create(diffPath);
    const after = Date.now();

    const metaPath = path.join(artifactPath(sm.getDir()), 'metadata.json');
    const meta = JSON.parse(await readFile(metaPath, 'utf-8'));

    expect(meta.schemaVersion).toBe(SESSION_ARTIFACT_SCHEMA_VERSION);
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

    const metaPath = path.join(artifactPath(sm.getDir()), 'metadata.json');
    const meta = JSON.parse(await readFile(metaPath, 'utf-8'));
    expect(meta.schemaVersion).toBe(SESSION_ARTIFACT_SCHEMA_VERSION);
    expect(meta.status).toBe('completed');
    expect(typeof meta.completedAt).toBe('number');
  });

  it('setStatus() updates status to failed', async () => {
    const sm = await SessionManager.create('/tmp/diff.patch');
    await sm.setStatus('failed');

    expect(sm.getMetadata().status).toBe('failed');
    const meta = JSON.parse(await readFile(path.join(artifactPath(sm.getDir()), 'metadata.json'), 'utf-8'));
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
