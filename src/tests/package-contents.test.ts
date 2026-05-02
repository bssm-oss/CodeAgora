import fs from 'fs';
import { describe, expect, it } from 'vitest';

describe('release package content verification', () => {
  it('has package-content verification wired into beta smoke', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8')) as { scripts: Record<string, string> };
    const smoke = fs.readFileSync('scripts/beta-smoke.mjs', 'utf-8');

    expect(pkg.scripts['release:beta-smoke']).toBe('node scripts/beta-smoke.mjs');
    expect(smoke).toContain('scripts/verify-package-contents.mjs');
  });

  it('asserts root and MCP package include/exclude rules', () => {
    const verifier = fs.readFileSync('scripts/verify-package-contents.mjs', 'utf-8');

    expect(verifier).toContain('packages/cli/dist/index.js');
    expect(verifier).toContain('scripts/postinstall.cjs');
    expect(verifier).toContain('dist/index.js');
    expect(verifier).toContain('README.md');
    expect(verifier).toContain('bench-out');
    expect(verifier).toContain('.sisyphus');
    expect(verifier).toContain('.test');
  });
});
