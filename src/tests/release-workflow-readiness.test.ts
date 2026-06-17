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

    expect(release).toContain("contains(github.ref_name, '-rc.') && 'desktop-rc-distribution' || 'npm-publish'");
    expect(release).toContain('id-token: write');
    expect(release).toContain('npm view "$spec" version');
    expect(release).toContain('npm publish --provenance --access public --tag "$PUBLISH_TAG"');
    expect(release).toContain("version.includes('-rc.') ? 'rc' : version.includes('-') ? 'beta' : 'latest'");
    expect(release).toContain('run: pnpm evidence:manifest');
    expect(release).toContain('actions/upload-artifact@v7');
    expect(release).toContain('release-evidence-${{ github.ref_name }}');
    expect(release).toContain('Create GitHub Stable Release');
    expect(release).toContain('prerelease: false');
    expect(release).toContain('capture-unsigned-dmg-evidence.mjs');
    expect(release).toContain('pnpm desktop:unsigned-dmg-gate');
    expect(release).toContain("- name: Desktop release evidence\n        if: contains(github.ref_name, '-rc.')\n        run: pnpm rc:desktop-gate");
    expect(release).toContain("- name: Install desktop automation tools\n        if: contains(github.ref_name, '-rc.')");
    expect(release).toContain('not Developer ID signed, not notarized, and does not enable the Tauri updater channel');
    expect(rootPackage.scripts['evidence:security-smoke']).toBe('node scripts/security-evidence-smoke.mjs');
    expect(rootPackage.scripts['evidence:redaction-path-safety']).toBe('node scripts/redaction-path-safety-evidence.mjs');
    expect(rootPackage.scripts['evidence:github-security']).toBe('node scripts/github-security-evidence.mjs');
    expect(rootPackage.scripts['evidence:desktop-security']).toBe('node scripts/desktop-security-evidence.mjs');
  });
});
