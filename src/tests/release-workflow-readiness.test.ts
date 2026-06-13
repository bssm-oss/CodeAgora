import fs from 'fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return fs.readFileSync(path, 'utf-8');
}

describe('release workflow readiness gates', () => {
  it('keeps CI and release aligned on lint, build, tests, security, and benchmark gates', () => {
    const ci = read('.github/workflows/ci.yml');
    const release = read('.github/workflows/release.yml');

    for (const command of [
      'pnpm typecheck',
      'pnpm lint',
      'pnpm build',
      'pnpm test --no-file-parallelism',
      'pnpm test:security',
      'pnpm bench:ci',
    ]) {
      expect(ci, `CI should run ${command}`).toContain(command);
      expect(release, `release should run ${command}`).toContain(command);
    }

    expect(ci).toContain('node-version: [20, 22]');
    expect(release).toContain("node-version: '20'");
  });

  it('requires publish approval, provenance, preflight, and uploaded evidence artifacts', () => {
    const release = read('.github/workflows/release.yml');
    const rootPackage = JSON.parse(read('package.json'));

    expect(release).toContain('environment: npm-publish');
    expect(release).toContain('id-token: write');
    expect(release).toContain('npm view "$spec" version');
    expect(release).toContain('npm publish --provenance --access public --tag "$PUBLISH_TAG"');
    expect(release).toContain("version.includes('-') ? 'beta' : 'stable'");
    expect(release).toContain('pnpm evidence:manifest -- --require="$REQUIRED_TIER"');
    expect(release).toContain('actions/upload-artifact@v7');
    expect(release).toContain('release-evidence-${{ github.ref_name }}');
    expect(release).toContain('prerelease: ${{ contains(github.ref_name, \'-\') }}');
    expect(rootPackage.scripts['evidence:security-smoke']).toBe('node scripts/security-evidence-smoke.mjs');
    expect(rootPackage.scripts['evidence:redaction-path-safety']).toBe('node scripts/redaction-path-safety-evidence.mjs');
    expect(rootPackage.scripts['evidence:github-security']).toBe('node scripts/github-security-evidence.mjs');
  });
});
