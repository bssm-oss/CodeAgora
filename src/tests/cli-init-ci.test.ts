/**
 * CLI Init --ci Tests
 * Tests for writeGitHubWorkflow and runInit with ci flag.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

import { writeGitHubWorkflow, runInit } from '@codeagora/cli/commands/init.js';

// ============================================================================
// writeGitHubWorkflow
// ============================================================================

describe('writeGitHubWorkflow()', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-ci-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates .github/workflows/codeagora-review.yml in the correct location', async () => {
    const written = await writeGitHubWorkflow(tmpDir);
    expect(written).toBe(true);

    const expectedPath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    const stat = await fs.stat(expectedPath);
    expect(stat.isFile()).toBe(true);
  });

  it('creates .github/workflows/ directory when it does not exist', async () => {
    await writeGitHubWorkflow(tmpDir);

    const dirPath = path.join(tmpDir, '.github', 'workflows');
    const stat = await fs.stat(dirPath);
    expect(stat.isDirectory()).toBe(true);
  });

  it('written file contains pull_request trigger', async () => {
    await writeGitHubWorkflow(tmpDir);

    const filePath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('pull_request');
    expect(content).toContain('opened');
    expect(content).toContain('synchronize');
  });

  it('written file contains npx codeagora review step', async () => {
    await writeGitHubWorkflow(tmpDir);

    const filePath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('npx codeagora review');
  });

  it('written file contains codeagora-review marker', async () => {
    await writeGitHubWorkflow(tmpDir);

    const filePath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('<!-- codeagora-v3 -->');
  });

  it('written file contains actions/checkout and actions/setup-node steps', async () => {
    await writeGitHubWorkflow(tmpDir);

    const filePath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('actions/checkout@v4');
    expect(content).toContain('actions/setup-node@v4');
  });

  it('does not overwrite existing workflow when force is false', async () => {
    const workflowPath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    await fs.mkdir(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(workflowPath, 'existing content', 'utf-8');

    const written = await writeGitHubWorkflow(tmpDir, false);
    expect(written).toBe(false);

    const content = await fs.readFile(workflowPath, 'utf-8');
    expect(content).toBe('existing content');
  });

  it('overwrites existing workflow when force is true', async () => {
    const workflowPath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    await fs.mkdir(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(workflowPath, 'existing content', 'utf-8');

    const written = await writeGitHubWorkflow(tmpDir, true);
    expect(written).toBe(true);

    const content = await fs.readFile(workflowPath, 'utf-8');
    expect(content).not.toBe('existing content');
    expect(content).toContain('npx codeagora review');
  });
});

// ============================================================================
// runInit with --ci flag
// ============================================================================

describe('runInit() with ci: true', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-ci-init-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates workflow file alongside config when ci is true', async () => {
    const result = await runInit({ format: 'json', force: false, baseDir: tmpDir, ci: true });

    const workflowPath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    const stat = await fs.stat(workflowPath);
    expect(stat.isFile()).toBe(true);
    expect(result.created).toContain(workflowPath);
  });

  it('does not create workflow file when ci is false', async () => {
    await runInit({ format: 'json', force: false, baseDir: tmpDir, ci: false });

    const workflowPath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    let exists = false;
    try {
      await fs.access(workflowPath);
      exists = true;
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  it('does not create workflow file when ci is omitted', async () => {
    await runInit({ format: 'json', force: false, baseDir: tmpDir });

    const workflowPath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    let exists = false;
    try {
      await fs.access(workflowPath);
      exists = true;
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  it('skips existing workflow and adds to skipped list when force is false', async () => {
    const workflowPath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    await fs.mkdir(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(workflowPath, 'existing', 'utf-8');

    const result = await runInit({ format: 'json', force: false, baseDir: tmpDir, ci: true });

    expect(result.skipped).toContain(workflowPath);
    expect(result.created).not.toContain(workflowPath);
  });

  it('overwrites existing workflow when force is true', async () => {
    const workflowPath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    await fs.mkdir(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(workflowPath, 'existing', 'utf-8');

    const result = await runInit({ format: 'json', force: true, baseDir: tmpDir, ci: true });

    expect(result.created).toContain(workflowPath);
    const content = await fs.readFile(workflowPath, 'utf-8');
    expect(content).toContain('npx codeagora review');
  });
});
