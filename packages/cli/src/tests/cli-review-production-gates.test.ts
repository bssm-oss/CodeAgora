import { spawn } from 'child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { generateFullTemplate } from '@codeagora/core/config/templates.js';
import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';

interface CliRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

const repoRoot = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');
const cliEntry = path.join(repoRoot, 'packages', 'cli', 'src', 'index.ts');
const providerEnvVars = Array.from(new Set(Object.values(PROVIDER_ENV_VARS)));
const testDirs: string[] = [];
const validTinyDiff = 'diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new\n';

async function createTempProject(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  testDirs.push(dir);
  return dir;
}

async function writeValidConfig(cwd: string): Promise<void> {
  await mkdir(path.join(cwd, '.ca'), { recursive: true });
  await writeFile(
    path.join(cwd, '.ca', 'config.json'),
    generateFullTemplate('json'),
    'utf-8',
  );
}

function makeCliEnv(homeDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    NODE_ENV: 'production',
    CODEAGORA_LANG: 'en',
    LANG: 'en_US.UTF-8',
    CI: '1',
  };

  for (const envVar of providerEnvVars) {
    delete env[envVar];
  }

  return env;
}

function runAgoraReview(cwd: string, args: string[], stdin?: string): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      tsxBin,
      ['--conditions', 'development', cliEntry, 'review', ...args],
      {
        cwd,
        env: makeCliEnv(cwd),
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    if (stdin !== undefined) {
      child.stdin.end(stdin);
    } else {
      child.stdin.end();
    }
  });
}

describe('review command production gates', () => {
  afterEach(async () => {
    const dirs = testDirs.splice(0);
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('rejects an empty patch file before dry-run reports success', async () => {
    const cwd = await createTempProject('ca-review-empty-file-');
    await writeValidConfig(cwd);
    await writeFile(path.join(cwd, 'change.patch'), '  \n\t\n', 'utf-8');

    const result = await runAgoraReview(cwd, ['change.patch', '--dry-run', '--quiet']);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Empty diff — nothing to review.');
    expect(result.stdout).not.toContain('Included files: 0');
  });

  it('surfaces malformed config JSON instead of running zero-config setup', async () => {
    const cwd = await createTempProject('ca-review-invalid-config-');
    await mkdir(path.join(cwd, '.ca'), { recursive: true });
    await writeFile(path.join(cwd, '.ca', 'config.json'), '{ invalid json', 'utf-8');
    await writeFile(
      path.join(cwd, 'change.patch'),
      'diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new\n',
      'utf-8',
    );

    const result = await runAgoraReview(cwd, ['change.patch', '--dry-run', '--quiet']);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Error: JSON parse error');
    expect(result.stderr).not.toContain('No config and no API keys found');
  });

  it('keeps stdin empty handling classified as an input error', async () => {
    const cwd = await createTempProject('ca-review-empty-stdin-');
    await writeValidConfig(cwd);

    const result = await runAgoraReview(cwd, ['-', '--dry-run', '--quiet'], ' \n');

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Empty diff — nothing to review.');
  });

  it('keeps patch-file dry-run working for non-empty diffs', async () => {
    const cwd = await createTempProject('ca-review-file-dry-run-');
    await writeValidConfig(cwd);
    await writeFile(path.join(cwd, 'change.patch'), validTinyDiff, 'utf-8');

    const result = await runAgoraReview(cwd, ['change.patch', '--dry-run', '--quiet']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Included files: 1');
  });

  it('keeps malformed non-empty diff dry-run diagnostics parseable without provider calls', async () => {
    const cwd = await createTempProject('ca-review-malformed-diff-');
    await writeValidConfig(cwd);
    await writeFile(path.join(cwd, 'change.patch'), 'this is not a unified diff\n', 'utf-8');

    const result = await runAgoraReview(cwd, ['change.patch', '--dry-run', '--quiet', '--output', 'json']);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(result.stdout.trimStart());
    expect(result.stdout.startsWith('{')).toBe(true);
    const parsed = JSON.parse(result.stdout) as {
      diffMetadata?: {
        includedFiles: string[];
        excludedFiles: string[];
      };
    };
    expect(parsed.diffMetadata?.includedFiles).toEqual([]);
    expect(parsed.diffMetadata?.excludedFiles).toEqual([]);
  });

  it('reports ignored files in dry-run diff filtering metadata', async () => {
    const cwd = await createTempProject('ca-review-ignored-files-');
    await writeValidConfig(cwd);
    await writeFile(path.join(cwd, '.reviewignore'), 'ignored.ts\n', 'utf-8');
    await writeFile(
      path.join(cwd, 'change.patch'),
      [
        'diff --git a/ignored.ts b/ignored.ts',
        '--- a/ignored.ts',
        '+++ b/ignored.ts',
        '@@ -1 +1 @@',
        '-old',
        '+new',
        'diff --git a/kept.ts b/kept.ts',
        '--- a/kept.ts',
        '+++ b/kept.ts',
        '@@ -1 +1 @@',
        '-old',
        '+new',
        '',
      ].join('\n'),
      'utf-8',
    );

    const result = await runAgoraReview(cwd, ['change.patch', '--dry-run', '--quiet']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Included files: 1');
    expect(result.stdout).toContain('- kept.ts');
    expect(result.stdout).toContain('Excluded files: 1');
    expect(result.stdout).toContain('- ignored.ts');
    expect(result.stdout).toContain('- .reviewignore: 1');
  });

  it('reports large-diff dry-run token budget metadata', async () => {
    const cwd = await createTempProject('ca-review-large-diff-');
    await writeValidConfig(cwd);
    const largeLines = Array.from({ length: 9000 }, (_value, index) => `+const value${index} = '${index}';`);
    await writeFile(
      path.join(cwd, 'change.patch'),
      [
        'diff --git a/large.ts b/large.ts',
        '--- a/large.ts',
        '+++ b/large.ts',
        '@@ -0,0 +1,9000 @@',
        ...largeLines,
        '',
      ].join('\n'),
      'utf-8',
    );

    const result = await runAgoraReview(cwd, ['change.patch', '--dry-run', '--quiet']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Included files: 1');
    expect(result.stdout).toContain('Oversized hunks retained: 1');
    expect(result.stdout).toContain('Token Budget Decisions:');
    expect(result.stdout).toContain('kept oversized normal hunk for large.ts');
  });

  it('keeps no-config and no-API-key setup guidance for first run', async () => {
    const cwd = await createTempProject('ca-review-no-config-');
    await writeFile(
      path.join(cwd, 'change.patch'),
      'diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new\n',
      'utf-8',
    );

    const result = await runAgoraReview(cwd, ['change.patch', '--dry-run', '--quiet']);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('No config and no API keys found. Run `agora init` to set up.');
  });

  it('does not mutate explicit diff file when using --scope', async () => {
    const cwd = await createTempProject('ca-review-scope-file-mutation-');
    await writeValidConfig(cwd);
    const diffContent = [
      'diff --git a/foo.ts b/foo.ts',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '',
      'diff --git a/bar.ts b/bar.ts',
      '--- a/bar.ts',
      '+++ b/bar.ts',
      '@@ -1 +1 @@',
      '-before',
      '+after',
      '',
    ].join('\n');
    const patchPath = path.join(cwd, 'change.patch');
    await writeFile(patchPath, diffContent, 'utf-8');

    const result = await runAgoraReview(cwd, ['change.patch', '--scope', 'foo.ts', '--dry-run', '--quiet']);
    const afterContent = await (await import('fs/promises')).readFile(patchPath, 'utf-8');
    expect(result.code).toBe(0);
    expect(afterContent).toBe(diffContent);
    expect(result.stdout).toContain('Included files: 1');
    expect(result.stdout).toContain('- foo.ts');
    expect(result.stdout).not.toContain('bar.ts');
  });

  it('does not mutate explicit diff file when --scope has no matching changes', async () => {
    const cwd = await createTempProject('ca-review-scope-missing-file-mutation-');
    await writeValidConfig(cwd);
    const diffContent = [
      'diff --git a/foo.ts b/foo.ts',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '',
    ].join('\n');
    const patchPath = path.join(cwd, 'change.patch');
    await writeFile(patchPath, diffContent, 'utf-8');

    const result = await runAgoraReview(cwd, ['change.patch', '--scope', 'missing.ts', '--dry-run', '--quiet']);
    const afterContent = await (await import('fs/promises')).readFile(patchPath, 'utf-8');
    expect(result.code).toBe(0);
    expect(afterContent).toBe(diffContent);
    expect(result.stderr).toContain('No changes found in scope: missing.ts');
  });
});
