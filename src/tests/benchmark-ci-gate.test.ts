import { describe, expect, it } from 'vitest';
import fs from 'fs';
import { execFileSync } from 'child_process';

function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

describe('deterministic benchmark CI gate', () => {
  it('defines bench:ci as offline schema then reference validation', () => {
    const manifest = JSON.parse(readText('package.json')) as { scripts?: Record<string, string> };

    expect(manifest.scripts?.['bench:ci']).toBe('pnpm bench:fn -- --validate-only && pnpm bench:reference -- --validate-only');
    expect(manifest.scripts?.['bench:ci']).not.toContain('bench:fn:run');
  });

  it('runs benchmark validation without provider keys', () => {
    const output = execFileSync('pnpm', ['bench:ci'], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        OPENAI_API_KEY: '',
        GROQ_API_KEY: '',
        OPENROUTER_API_KEY: '',
      },
    });

    expect(output).toContain('OK: 20 fixture(s) validated');
    expect(output).toContain('OK: reference');
  });

  it('runs in CI only on Node 20 matrix jobs', () => {
    const ciWorkflow = readText('.github/workflows/ci.yml');

    expect(ciWorkflow).toContain('run: pnpm bench:ci');
    expect(ciWorkflow).toContain('if: matrix.node-version == 20');
  });
});
