import { describe, expect, it } from 'vitest';
import fs from 'fs';
import { readMcpPackageVersion } from '@codeagora/mcp/version.js';

describe('MCP package metadata', () => {
  it('uses packages/mcp/package.json as the server version source', () => {
    const pkg = JSON.parse(fs.readFileSync('packages/mcp/package.json', 'utf-8')) as { version: string };

    expect(readMcpPackageVersion()).toBe(pkg.version);
  });

  it('ships package-local onboarding in the MCP package', () => {
    const pkg = JSON.parse(fs.readFileSync('packages/mcp/package.json', 'utf-8')) as { files: string[] };
    const readme = fs.readFileSync('packages/mcp/README.md', 'utf-8');
    const rootReadme = fs.readFileSync('README.md', 'utf-8');

    expect(pkg.files).toContain('README.md');
    expect(readme).toContain('Environment Variables');
    expect(readme).toContain('review_quick');
    expect(readme).toContain('Troubleshooting');
    expect(rootReadme).toContain('packages/mcp/README.md');
  });
});
