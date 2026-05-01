import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliEntry = path.join(repoRoot, 'packages/cli/dist/index.js');

const config = {
  reviewers: [
    {
      id: 'r1-groq',
      model: 'llama-3.3-70b-versatile',
      backend: 'api',
      provider: 'groq',
      enabled: true,
      timeout: 120,
    },
  ],
  supporters: {
    pool: [
      {
        id: 's1',
        model: 'llama-3.3-70b-versatile',
        backend: 'api',
        provider: 'groq',
        enabled: true,
        timeout: 120,
      },
    ],
    pickCount: 1,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 'da',
      model: 'llama-3.3-70b-versatile',
      backend: 'api',
      provider: 'groq',
      enabled: true,
      timeout: 120,
    },
    personaPool: ['skeptic'],
    personaAssignment: 'random',
  },
  moderator: {
    backend: 'api',
    model: 'llama-3.3-70b-versatile',
    provider: 'groq',
  },
  discussion: {
    maxRounds: 1,
    registrationThreshold: {
      HARSHLY_CRITICAL: 1,
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: null,
    },
    codeSnippetRange: 10,
  },
};

describe('packed CLI pricing lookup', () => {
  beforeAll(() => {
    execFileSync('pnpm', ['--filter', '@codeagora/cli', 'build'], {
      cwd: repoRoot,
      stdio: 'pipe',
      env: { ...process.env, CI: 'true' },
    });
  }, 30_000);

  it('loads pricing data from the packed root package layout during dry-run', () => {
    const projectDir = mkdtempSync(path.join(tmpdir(), 'codeagora-packed-pricing-'));
    mkdirSync(path.join(projectDir, '.ca'));
    writeFileSync(path.join(projectDir, '.ca/config.json'), JSON.stringify(config, null, 2));
    writeFileSync(
      path.join(projectDir, 'sample.diff'),
      [
        'diff --git a/a.ts b/a.ts',
        'new file mode 100644',
        'index 0000000..1111111',
        '--- /dev/null',
        '+++ b/a.ts',
        '@@ -0,0 +1 @@',
        '+const x = 1;',
        '',
      ].join('\n'),
    );

    const result = spawnSync(
      process.execPath,
      [cliEntry, 'review', 'sample.diff', '--dry-run', '--output', 'json', '--quiet'],
      {
        cwd: projectDir,
        encoding: 'utf-8',
        env: { ...process.env, CI: 'true', GROQ_API_KEY: 'test-key', NODE_ENV: 'production' },
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim(), result.stderr).not.toBe('');

    const report = JSON.parse(result.stdout) as {
      estimation: {
        estimatedL1Cost: string;
        totalEstimatedCost: string;
      };
    };

    expect(report.estimation.estimatedL1Cost).toMatch(/^\$[\d.]+$/);
    expect(report.estimation.totalEstimatedCost).toMatch(/^\$[\d.]+$/);
  }, 30_000);
});
