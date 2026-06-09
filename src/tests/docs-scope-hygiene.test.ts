import fs from 'fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return fs.readFileSync(path, 'utf-8');
}

describe('public documentation scope hygiene', () => {
  it('keeps desktop listed as an official supported surface in current release docs', () => {
    const docs = [
      'README.md',
      'AGENTS.md',
      'ROADMAP.md',
      'docs/for-agents/ARCHITECTURE.md',
      'docs/for-agents/PRODUCTION_READINESS_ROADMAP.md',
      'docs/for-users/DESKTOP.md',
      'packages/AGENTS.md',
      'packages/desktop/AGENTS.md',
      'packages/desktop/README.md',
    ];

    for (const file of docs) {
      const content = read(file).toLowerCase();
      expect(content, `${file} should mention desktop`).toContain('desktop');
      expect(content, `${file} should not call current desktop preview-only`).not.toContain(`private ${'preview'}`);
    }

    expect(read('docs/for-agents/PRODUCTION_READINESS_ROADMAP.md')).toContain('CLI, GitHub Actions, MCP, and Desktop');
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
