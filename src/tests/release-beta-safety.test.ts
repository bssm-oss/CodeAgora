import fs from 'fs';
import { describe, expect, it } from 'vitest';

function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function readPackageVersion(filePath: string): string {
  const manifest = JSON.parse(readText(filePath)) as { version: string };
  return manifest.version;
}

describe('beta release safety', () => {
  it('publishes prerelease packages with an explicit beta dist-tag', () => {
    const workflow = readText('.github/workflows/release.yml');

    expect(workflow).toContain('PUBLISH_TAG=$(node -e');
    expect(workflow).toContain("version.includes('-') ? 'beta' : 'latest'");
    expect(workflow).toContain('npm publish --access public --tag "$PUBLISH_TAG"');
    expect(workflow).toContain('cd packages/mcp && npm publish --access public --tag "$PUBLISH_TAG"');
  });

  it('allows manual beta dist-tagging but blocks prereleases from latest', () => {
    const workflow = readText('.github/workflows/npm-dist-tags.yml');

    expect(workflow).toContain('          - beta');
    expect(workflow).toContain('Prerelease versions must not be assigned the latest dist-tag');
    expect(workflow).toContain('if [ "$TAG" = "latest" ] && [[ "$VERSION" == *-* ]]; then');
  });

  it('keeps public package versions aligned for beta', () => {
    const rootVersion = readPackageVersion('package.json');
    const mcpVersion = readPackageVersion('packages/mcp/package.json');

    expect(rootVersion).toBe('0.1.0-beta.0');
    expect(mcpVersion).toBe(rootVersion);
  });
});
