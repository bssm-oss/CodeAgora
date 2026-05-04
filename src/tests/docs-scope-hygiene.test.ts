import fs from 'fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return fs.readFileSync(path, 'utf-8');
}

describe('public documentation scope hygiene', () => {
  it('keeps desktop scoped as private preview in public release docs and install messaging', () => {
    const docs = [
      'README.md',
      'CHANGELOG.md',
      'docs/ARCHITECTURE.md',
      'docs/BETA_READINESS_P4_P6.md',
      'docs/EXTENSIONS.md',
      'docs/PRODUCT_SURFACE_AND_LIGHTWEIGHT_PLAN.md',
      'docs/PRODUCTION_READINESS_ROADMAP.md',
      'scripts/postinstall.cjs',
    ];

    for (const file of docs) {
      const content = read(file).toLowerCase();
      expect(content, `${file} should mention private preview desktop scope`).toContain('private preview');
    }

    expect(read('CHANGELOG.md')).not.toContain('supported surfaces focused on CLI, MCP, GitHub Actions, and Desktop App');
    expect(read('docs/RELEASE_CHECKLIST.md')).not.toContain('desktop metadata, and');
  });

  it('does not leave TODO/FIXME placeholders in release-facing docs', () => {
    const releaseDocs = [
      'README.md',
      'CHANGELOG.md',
      'docs/RELEASE_CHECKLIST.md',
      'docs/BETA_READINESS_P4_P6.md',
      'docs/PRODUCTION_READINESS_ROADMAP.md',
      'docs/ARCHITECTURE.md',
      'docs/EXTENSIONS.md',
    ];

    for (const file of releaseDocs) {
      const content = read(file);
      expect(content, `${file} should not contain unresolved TODO/FIXME markers`).not.toMatch(/\b(?:TODO|FIXME)\b/);
    }
  });
});
