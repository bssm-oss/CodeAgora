/**
 * CLI Init --ci Tests
 * Tests for writeGitHubWorkflow and runInit with ci flag.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { parse as parseYaml } from 'yaml';

import { writeGitHubWorkflow, runInit, buildPresetConfig } from '@codeagora/cli/commands/init.js';
import { validateConfig } from '@codeagora/core/types/config.js';
import {
  buildActionPresetConfig,
  renderCodeAgoraWorkflowTemplate,
} from '@codeagora/shared/action-preset.js';

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

  it('written file uses the stable CodeAgora Action ref', async () => {
    await writeGitHubWorkflow(tmpDir);

    const filePath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('uses: bssm-oss/CodeAgora@v0.1.1');
    expect(content).not.toContain('bssm-oss/CodeAgora@v2');
    expect(content).not.toContain('npx codeagora');
  });

  it('written file contains caller-owned review:skip label guard', async () => {
    await writeGitHubWorkflow(tmpDir);

    const filePath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain("!contains(github.event.pull_request.labels.*.name, 'review:skip')");
  });

  it('written file checks out the repo and lets the composite Action own Node setup', async () => {
    await writeGitHubWorkflow(tmpDir);

    const filePath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('actions/checkout@v6');
    expect(content).not.toContain('actions/setup-node@v6');
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
    expect(content).toContain('uses: bssm-oss/CodeAgora@v0.1.1');
  });

  it('writes the shared Action workflow template', async () => {
    await writeGitHubWorkflow(tmpDir);

    const filePath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    const content = await fs.readFile(filePath, 'utf-8');

    expect(content).toBe(renderCodeAgoraWorkflowTemplate());
    expect(extractConfigFromWorkflow(content)).toEqual(buildActionPresetConfig({ language: 'en' }));
  });

  it('writes the shared Action workflow template with the requested language', async () => {
    await writeGitHubWorkflow(tmpDir, false, 'ko');

    const filePath = path.join(tmpDir, '.github', 'workflows', 'codeagora-review.yml');
    const content = await fs.readFile(filePath, 'utf-8');

    expect(content).toBe(renderCodeAgoraWorkflowTemplate({ language: 'ko' }));
    expect(extractConfigFromWorkflow(content)).toEqual(buildActionPresetConfig({ language: 'ko' }));
  });

  it('builds the action preset config with the requested language', async () => {
    await expect(buildPresetConfig('action', { language: 'ko' })).resolves.toEqual(
      buildActionPresetConfig({ language: 'ko' }),
    );
  });
});

function extractConfigFromWorkflow(content: string): unknown {
  const match = content.match(/cat > \.ca\/config\.json << 'CONF'\n([\s\S]*?)\n\s*CONF/);
  if (!match) {
    throw new Error('workflow config heredoc not found');
  }
  const json = match[1]!
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
  return JSON.parse(json);
}

// ============================================================================
// runInit with --ci flag
// ============================================================================

describe('runInit() config artifacts', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-init-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes parseable JSON config that validates against the real schema', async () => {
    const result = await runInit({ format: 'json', force: false, baseDir: tmpDir });

    const configPath = path.join(tmpDir, '.ca', 'config.json');
    expect(result.created).toContain(configPath);

    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    const config = validateConfig(parsed);

    expect(config.reviewers.length).toBeGreaterThan(0);
    expect(config.supporters.pool).toBeDefined();
  });

  it('writes parseable YAML config that validates against the real schema', async () => {
    const result = await runInit({ format: 'yaml', force: false, baseDir: tmpDir });

    const configPath = path.join(tmpDir, '.ca', 'config.yaml');
    expect(result.created).toContain(configPath);

    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = parseYaml(raw) as unknown;
    const config = validateConfig(parsed);

    expect(config.reviewers.length).toBeGreaterThan(0);
    expect(config.discussion.maxRounds).toBeGreaterThan(0);
  });

  it('preserves existing .ca/config.json when force is false', async () => {
    const configPath = path.join(tmpDir, '.ca', 'config.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, '{"sentinel":true}', 'utf-8');

    const result = await runInit({ format: 'json', force: false, baseDir: tmpDir });

    expect(await fs.readFile(configPath, 'utf-8')).toBe('{"sentinel":true}');
    expect(result.skipped).toContain(configPath);
    expect(result.created).not.toContain(configPath);
  });

  it('overwrites existing .ca/config.json when force is true', async () => {
    const configPath = path.join(tmpDir, '.ca', 'config.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, '{"sentinel":true}', 'utf-8');

    const result = await runInit({ format: 'json', force: true, baseDir: tmpDir });

    const raw = await fs.readFile(configPath, 'utf-8');
    expect(raw).not.toBe('{"sentinel":true}');
    expect(result.created).toContain(configPath);
    expect(() => validateConfig(JSON.parse(raw) as unknown)).not.toThrow();
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
    expect(content).toContain('uses: bssm-oss/CodeAgora@v0.1.1');
  });
});
