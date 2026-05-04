import fs from 'fs';
import { describe, expect, it } from 'vitest';

describe('release package content verification', () => {
  it('has package-content verification wired into beta smoke', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8')) as { scripts: Record<string, string> };
    const smoke = fs.readFileSync('scripts/beta-smoke.mjs', 'utf-8');

    expect(pkg.scripts['release:beta-smoke']).toBe('node scripts/beta-smoke.mjs');
    expect(smoke).toContain('scripts/verify-package-contents.mjs');
    expect(smoke).toContain('init --yes');
    expect(smoke).toContain('.ca/config.json');
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

  it('keeps advertised root entrypoints aligned with actual source barrels', () => {
    const packages = [
      ['packages/core/package.json', 'packages/core/src/index.ts'],
      ['packages/shared/package.json', 'packages/shared/src/index.ts'],
      ['packages/github/package.json', 'packages/github/src/index.ts'],
    ] as const;

    for (const [manifestPath, sourceEntry] of packages) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { main?: string; types?: string; exports?: Record<string, unknown> };

      expect(manifest.main).toBe('./dist/index.js');
      if (manifest.types) {
        expect(manifest.types).toBe('./dist/index.d.ts');
      }
      expect(fs.existsSync(sourceEntry)).toBe(true);
    }
  });

  it('exposes the documented MCP version subpath export', () => {
    const manifest = JSON.parse(fs.readFileSync('packages/mcp/package.json', 'utf-8')) as { exports?: Record<string, unknown> };

    expect(manifest.exports?.['./version.js']).toBeDefined();
  });
});
