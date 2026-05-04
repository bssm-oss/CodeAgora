import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

function packFiles(cwd: string): string[] {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, npm_config_ignore_scripts: 'true' },
  }).toString();

  const parsed = JSON.parse(out.trim());
  if (!Array.isArray(parsed) || parsed.length === 0 || !Array.isArray(parsed[0].files)) {
    throw new Error('unexpected npm pack output');
  }
  return parsed[0].files.map((f: { path: string }) => f.path.replace(/\\/g, '/')).sort();
}

describe('packaged runtime data smoke', () => {
  it('packages/shared tarball should include runtime data in dist/data', () => {
    const shared = path.join(process.cwd(), 'packages/shared');
    const files = packFiles(shared);

    // These must be present in packaged artifact for runtime cost/model lookups
    expect(files).toContain('dist/data/pricing.json');
    expect(files).toContain('dist/data/model-rankings.json');
    expect(files).toContain('dist/data/groq-models.json');
  });
});
