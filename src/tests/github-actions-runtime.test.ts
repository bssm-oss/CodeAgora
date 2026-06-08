import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

const checkedFiles = [
  'action.yml',
  'packages/shared/src/data/github-actions-template.yml',
  ...fs
    .readdirSync(path.join(repoRoot, '.github', 'workflows'))
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map((file) => path.join('.github', 'workflows', file)),
];

const deprecatedNode20ActionPins = [
  'actions/checkout@v4',
  'actions/setup-node@v4',
  'pnpm/action-setup@v4',
  'actions/github-script@v7',
  'actions/upload-artifact@v4',
  'softprops/action-gh-release@v2',
];

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8');
}

describe('GitHub Actions runtime readiness', () => {
  it('does not pin workflows or generated templates to Node 20 JavaScript action majors', () => {
    for (const file of checkedFiles) {
      const content = readText(file);
      for (const pin of deprecatedNode20ActionPins) {
        expect(content, `${file} should not contain deprecated action pin ${pin}`).not.toContain(pin);
      }
    }
  });

  it('documents SARIF as generated output with caller-owned upload', () => {
    const docs = readText('docs/for-users/5_GITHUB_INTEGRATION.md');

    expect(docs).toContain('it does not upload that file to');
    expect(docs).toContain('github/codeql-action/upload-sarif@v4');
    expect(docs).not.toContain('uploadSarif()');
    expect(docs).not.toContain('POST /code-scanning/sarifs');
  });

  it('keeps the generated Action bundle syntactically valid on Node 20', () => {
    const bundlePath = path.join(repoRoot, 'dist/action.js');
    const bundle = readText('dist/action.js');

    expect(bundle).toContain('__codeagoraCreateRequire');
    expect(bundle).not.toContain('import { createRequire } from "module"; const require = createRequire(import.meta.url);');
    execFileSync(process.execPath, ['--check', bundlePath], { stdio: 'pipe' });
  });

  it('uses retained API providers for live PR and benchmark smoke paths', () => {
    const review = readText('.github/workflows/review.yml');
    const bench = readText('.github/workflows/bench-fn.yml');

    expect(review).not.toContain('models: read');
    expect(review).toContain('OPENROUTER_API_KEY');
    expect(review).toContain('GROQ_API_KEY');
    expect(review).toContain('provider=openrouter');
    expect(review).toContain('provider=groq');
    expect(bench).not.toContain('models: read');
    expect(bench).toContain('config.openrouter-low-cost-5x2.json');
    expect(bench).toContain('OPENROUTER_API_KEY');
    expect(bench).toContain('BENCH_DELAY_MS');
    expect(bench).toContain('--delay-ms "$BENCH_DELAY_MS"');
  });

  it('rebuilds the action bundle when the action contract changes', () => {
    const buildAction = readText('.github/workflows/build-action.yml');

    expect(buildAction).toContain("- 'action.yml'");
    expect(buildAction).toContain('scripts/build-action.mjs');
    expect(buildAction).toContain('dist/action.js');
  });
});
