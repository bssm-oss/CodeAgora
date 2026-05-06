import fs from 'fs';
import { describe, it, expect } from 'vitest';

describe('package runtime data packaging', () => {
  it('verify-package-contents includes checks for shared model/pricing data', () => {
    const verifier = fs.readFileSync('scripts/verify-package-contents.mjs', 'utf-8');
    expect(verifier).toContain('packages/shared');
    expect(verifier).toContain('model-rankings.json');
    expect(verifier).toContain('groq-models.json');
    expect(verifier).toContain('pricing.json');
  });

  it('MCP package copies and publishes bundled runtime data', () => {
    const mcpManifest = JSON.parse(fs.readFileSync('packages/mcp/package.json', 'utf-8')) as {
      files: string[];
      scripts: Record<string, string>;
    };
    const verifier = fs.readFileSync('scripts/verify-package-contents.mjs', 'utf-8');

    expect(mcpManifest.scripts.build).toContain('cp ../shared/src/data/*.json dist/data/');
    expect(mcpManifest.files).toContain('dist/data/*.json');
    expect(verifier).toContain('dist/data/model-rankings.json');
    expect(verifier).toContain('dist/data/groq-models.json');
    expect(verifier).toContain('dist/data/pricing.json');
  });

  it('beta smoke installs packed tarballs and exercises postinstall plus MCP auto-review paths', () => {
    const smoke = fs.readFileSync('scripts/beta-smoke.mjs', 'utf-8');

    expect(smoke).toContain('--foreground-scripts');
    expect(smoke).toContain('smokeRootPostinstall');
    expect(smoke).toContain('Tarball-installed CLI dry-run');
    expect(smoke).toContain('smokeInstalledMcpAutoReview');
    expect(smoke).toContain('modelRouter');
    expect(smoke).toContain('provider/API failures');
    expect(smoke).toContain('estimatedCost');
    expect(smoke).toContain('totalEstimatedCost');
  });
});
