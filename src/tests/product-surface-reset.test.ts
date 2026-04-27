import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

const retiredSurfacePatterns = [
  /@codeagora\/(?:web|tui|notifications)\b/,
  /packages\/(?:web|tui|notifications)\b/,
  /\bagora (?:dashboard|tui|notify)\b/,
  /review --notify\b/,
  /--notify\b/,
];

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function listFiles(dir: string, predicate: (file: string) => boolean): string[] {
  const absoluteDir = path.join(repoRoot, dir);
  if (!fs.existsSync(absoluteDir)) return [];

  const files: string[] = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const absoluteEntry = path.join(absoluteDir, entry.name);
    const relativeEntry = path.relative(repoRoot, absoluteEntry);

    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === 'node_modules') continue;
      files.push(...listFiles(relativeEntry, predicate));
      continue;
    }

    if (entry.isFile() && predicate(relativeEntry)) {
      files.push(relativeEntry);
    }
  }

  return files;
}

function expectNoRetiredSurfaceReferences(relativePath: string): void {
  const text = readText(relativePath);
  for (const pattern of retiredSurfacePatterns) {
    expect(text, `${relativePath} contains retired surface reference ${pattern}`).not.toMatch(pattern);
  }
}

describe('product surface reset', () => {
  it('does not keep retired workspace package directories', () => {
    for (const dir of ['packages/web', 'packages/tui', 'packages/notifications']) {
      expect(fs.existsSync(path.join(repoRoot, dir)), `${dir} should stay retired`).toBe(false);
    }
  });

  it('does not advertise retired packages in active manifests and release config', () => {
    const manifestFiles = [
      'package.json',
      'pnpm-workspace.yaml',
      'tsconfig.json',
      'vitest.config.ts',
      'eslint.config.js',
      'action.yml',
      '.github/workflows/release.yml',
      ...listFiles('packages', (file) => file.endsWith('package.json')),
    ];

    for (const file of manifestFiles) {
      expectNoRetiredSurfaceReferences(file);
    }
  });

  it('does not expose retired CLI commands or notification flags in active source', () => {
    const sourceFiles = ['packages/cli/src', 'packages/core/src', 'packages/github/src', 'packages/mcp/src', 'packages/shared/src']
      .flatMap((dir) => listFiles(dir, (file) => file.endsWith('.ts')));

    for (const file of sourceFiles) {
      expectNoRetiredSurfaceReferences(file);
    }
  });
});
