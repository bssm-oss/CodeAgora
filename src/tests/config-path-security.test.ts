import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfigFile } from '@codeagora/core/config/loader.js';

const configJson = JSON.stringify({
  mode: 'pragmatic',
  reviewers: [
    { id: 'r1', model: 'llama', backend: 'api', provider: 'groq', timeout: 120, enabled: true },
  ],
  supporters: {
    pool: [
      { id: 's1', model: 'llama', backend: 'api', provider: 'groq', timeout: 60, enabled: true },
    ],
    pickCount: 1,
    pickStrategy: 'random',
    devilsAdvocate: { id: 'da', model: 'llama', backend: 'api', provider: 'groq', timeout: 60, enabled: false },
    personaPool: ['.ca/personas/strict.md'],
    personaAssignment: 'random',
  },
  moderator: { provider: 'groq', model: 'llama', backend: 'api' },
  discussion: {
    maxRounds: 2,
    registrationThreshold: { HARSHLY_CRITICAL: 1, CRITICAL: 1, WARNING: 2, SUGGESTION: null },
    codeSnippetRange: 10,
  },
  head: { provider: 'groq', model: 'auto', backend: 'api', enabled: true },
  errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
});

describe('explicit configPath security', () => {
  let repoRoot: string;
  let outsideRoot: string;

  beforeEach(async () => {
    repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-config-root-'));
    outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagora-config-outside-'));
    await fs.mkdir(path.join(repoRoot, '.ca'), { recursive: true });
    await fs.writeFile(path.join(repoRoot, '.ca', 'config.json'), configJson);
    await fs.writeFile(path.join(outsideRoot, 'secret-config.json'), configJson);
  });

  afterEach(async () => {
    await Promise.all([
      fs.rm(repoRoot, { recursive: true, force: true }),
      fs.rm(outsideRoot, { recursive: true, force: true }),
    ]);
  });

  it('loads safe in-root config paths', async () => {
    const config = await loadConfigFile('.ca/config.json', { rootDir: repoRoot });

    expect(config.errorHandling.maxRetries).toBe(2);
  });

  it('rejects traversal before loading config content', async () => {
    await expect(loadConfigFile('../../.env', { rootDir: repoRoot })).rejects.toThrow(/Config path rejected/);
  });

  it('rejects absolute paths outside the repository root', async () => {
    await expect(loadConfigFile('/etc/passwd', { rootDir: repoRoot })).rejects.toThrow(/Config path rejected/);
  });

  it('rejects symlink escapes outside the repository root', async () => {
    const linkPath = path.join(repoRoot, '.ca', 'linked-config.json');
    await fs.symlink(path.join(outsideRoot, 'secret-config.json'), linkPath);

    await expect(loadConfigFile('.ca/linked-config.json', { rootDir: repoRoot })).rejects.toThrow(/Config path rejected/);
  });
});
