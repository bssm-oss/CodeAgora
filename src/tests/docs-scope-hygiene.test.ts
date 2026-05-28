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
      'docs/for-agents/ARCHITECTURE.md',
      'docs/archived/BETA_READINESS_P4_P6.md',
      'docs/for-users/EXTENSIONS.md',
      'docs/archived/PRODUCT_SURFACE_AND_LIGHTWEIGHT_PLAN.md',
      'docs/for-agents/PRODUCTION_READINESS_ROADMAP.md',
      'scripts/postinstall.cjs',
    ];

    for (const file of docs) {
      const content = read(file).toLowerCase();
      expect(content, `${file} should mention private preview desktop scope`).toContain('private preview');
    }

    expect(read('CHANGELOG.md')).not.toContain('supported surfaces focused on CLI, MCP, GitHub Actions, and Desktop App');
    expect(read('docs/archived/RELEASE_CHECKLIST.md')).not.toContain('desktop metadata, and');
  });

  it('does not leave TODO/FIXME placeholders in release-facing docs', () => {
    const releaseDocs = [
      'README.md',
      'CHANGELOG.md',
      'docs/archived/RELEASE_CHECKLIST.md',
      'docs/archived/BETA_READINESS_P4_P6.md',
      'docs/for-agents/PRODUCTION_READINESS_ROADMAP.md',
      'docs/for-agents/ARCHITECTURE.md',
      'docs/for-users/EXTENSIONS.md',
    ];

    for (const file of releaseDocs) {
      const content = read(file);
      expect(content, `${file} should not contain unresolved TODO/FIXME markers`).not.toMatch(/\b(?:TODO|FIXME)\b/);
    }
  });
});
