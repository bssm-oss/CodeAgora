import fs from 'fs';
import path from 'path';
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
    const docs = readText('docs/5_GITHUB_INTEGRATION.md');

    expect(docs).toContain('it does not upload that file to');
    expect(docs).toContain('github/codeql-action/upload-sarif@v4');
    expect(docs).not.toContain('uploadSarif()');
    expect(docs).not.toContain('POST /code-scanning/sarifs');
  });
});
