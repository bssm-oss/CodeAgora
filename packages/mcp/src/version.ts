import { readFileSync } from 'fs';

export function readMcpPackageVersion(): string {
  const packageJsonUrl = new URL('../package.json', import.meta.url);
  const parsed = JSON.parse(readFileSync(packageJsonUrl, 'utf-8')) as { version?: unknown };
  if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
    throw new Error('packages/mcp/package.json must define a version string');
  }
  return parsed.version;
}
