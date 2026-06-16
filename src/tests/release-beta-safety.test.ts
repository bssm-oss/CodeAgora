import fs from 'fs';
import { describe, expect, it } from 'vitest';

function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function readPackageVersion(filePath: string): string {
  const manifest = JSON.parse(readText(filePath)) as { version: string };
  return manifest.version;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readText(filePath)) as T;
}

describe('prerelease safety', () => {
  it('publishes prerelease packages with explicit prerelease dist-tags', () => {
    const workflow = readText('.github/workflows/release.yml');

    expect(workflow).toContain('PUBLISH_TAG=$(node -e');
    expect(workflow).toContain("version.includes('-rc.') ? 'rc' : version.includes('-') ? 'beta' : 'latest'");
    expect(workflow).toContain("version.includes('-rc.') ? 'rc' : version.includes('-') ? 'beta' : 'stable'");
    expect(workflow).toContain('npm publish --provenance --access public --tag "$PUBLISH_TAG"');
    expect(workflow).toContain('cd packages/mcp && npm publish --provenance --access public --tag "$PUBLISH_TAG"');
    expect(workflow).toContain("contains(github.ref_name, '-rc.') && 'desktop-rc-distribution' || 'npm-publish'");
    expect(workflow).toContain('pnpm rc:desktop-distribution-gate');
    expect(workflow).toContain('CODEAGORA_DESKTOP_RC_UPDATER_CHANNEL=desktop-${parsed.releaseLine}-rc');
    expect(workflow).toContain('tag_name: ${{ env.CODEAGORA_DESKTOP_RC_UPDATER_CHANNEL }}');
    expect(workflow).toContain('verify-rc-github-release-assets.mjs');
    expect(workflow).toContain("fail_on_unmatched_files: ${{ contains(github.ref_name, '-rc.') && 'true' || 'false' }}");
  });

  it('allows manual prerelease dist-tagging but blocks prereleases from latest', () => {
    const workflow = readText('.github/workflows/npm-dist-tags.yml');

    expect(workflow).toContain('          - beta');
    expect(workflow).toContain('          - rc');
    expect(workflow).toContain('Prerelease versions must not be assigned the latest dist-tag');
    expect(workflow).toContain('if [ "$TAG" = "latest" ] && [[ "$VERSION" == *-* ]]; then');
  });

  it('keeps public package versions aligned for prerelease', () => {
    const rootVersion = readPackageVersion('package.json');
    const mcpVersion = readPackageVersion('packages/mcp/package.json');
    const desktopVersion = readPackageVersion('packages/desktop/package.json');
    const tauriConfig = readJson<{ version: string }>('packages/desktop/src-tauri/tauri.conf.json');
    const cargoToml = readText('packages/desktop/src-tauri/Cargo.toml');

    expect(rootVersion).toBe('0.1.0-rc.6');
    expect(mcpVersion).toBe(rootVersion);
    expect(desktopVersion).toBe(rootVersion);
    expect(tauriConfig.version).toBe(rootVersion);
    expect(cargoToml).toContain(`version = "${rootVersion}"`);
  });

  it('keeps public and generated Action examples on the prerelease ref, not legacy v2', () => {
    const rootVersion = readPackageVersion('package.json');
    const actionRef = `bssm-oss/CodeAgora@v${rootVersion}`;
    const files = [
      'README.md',
      'packages/shared/src/action-preset.ts',
      'packages/shared/src/data/github-actions-template.yml',
      'docs/for-users/GITHUB_ACTIONS_SETUP.md',
    ];

    for (const file of files) {
      const content = readText(file);
      expect(content, `${file} should mention the prerelease Action ref`).toContain(actionRef);
      expect(content, `${file} should not use the legacy v2 Action ref`).not.toContain('uses: bssm-oss/CodeAgora@v2');
    }
  });

  it('keeps prerelease install examples on the rc dist-tag', () => {
    const readme = readText('README.md');
    const mcpReadme = readText('packages/mcp/README.md');
    const extensions = readText('docs/for-users/EXTENSIONS.md');
    const troubleshooting = readText('docs/for-users/TROUBLESHOOTING.md');
    const mcpConfig = readText('.mcp.json');
    const checkUpdate = readText('packages/cli/src/commands/check-update.ts');

    expect(readme).toContain('npm i -g @codeagora/review@rc');
    expect(readme).toContain('"@codeagora/mcp@rc"');
    expect(mcpReadme).toContain('npx -y @codeagora/mcp@rc');
    expect(mcpReadme).toContain('"@codeagora/mcp@rc"');
    expect(extensions).toContain('npm i -g @codeagora/mcp@rc');
    expect(extensions).toContain('"@codeagora/mcp@rc"');
    expect(troubleshooting).toContain('"@codeagora/mcp@rc"');
    expect(mcpConfig).toContain('"@codeagora/mcp@rc"');
    expect(checkUpdate).toContain("current.includes('-') ? 'rc' : 'latest'");
    expect(checkUpdate).toContain('@codeagora/review@${distTag}');
  });
});
