/**
 * Tests for .ca/ directory permission enforcement
 * Issue #75: validate .ca/ directory permissions (0o700)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import { ensureCaRoot } from '@codeagora/shared/utils/fs.js';

describe('ensureCaRoot', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ca-perm-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates .ca/ directory if it does not exist', async () => {
    await ensureCaRoot(tmpDir);
    const stat = await fs.stat(path.join(tmpDir, '.ca'));
    expect(stat.isDirectory()).toBe(true);
  });

  if (process.platform !== 'win32') {
    it('sets .ca/ directory to 0o700 on creation', async () => {
      await ensureCaRoot(tmpDir);
      const stat = await fs.stat(path.join(tmpDir, '.ca'));
      const mode = stat.mode & 0o777;
      expect(mode).toBe(0o700);
    });

    it('fixes permissions if .ca/ exists with wrong mode', async () => {
      const caDir = path.join(tmpDir, '.ca');
      await fs.mkdir(caDir, { mode: 0o755 });

      // Verify initial wrong permissions
      const before = await fs.stat(caDir);
      expect(before.mode & 0o777).toBe(0o755);

      // ensureCaRoot should fix them
      await ensureCaRoot(tmpDir);

      const after = await fs.stat(caDir);
      expect(after.mode & 0o777).toBe(0o700);
    });

    it('leaves correct permissions unchanged', async () => {
      const caDir = path.join(tmpDir, '.ca');
      await fs.mkdir(caDir, { mode: 0o700 });

      await ensureCaRoot(tmpDir);

      const stat = await fs.stat(caDir);
      expect(stat.mode & 0o777).toBe(0o700);
    });
  }
});
