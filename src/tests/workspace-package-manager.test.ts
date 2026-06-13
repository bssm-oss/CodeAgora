import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parse } from 'yaml';

import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

type PackageManifest = {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  workspaces?: unknown;
};

type CommandSource = {
  path: string;
  text: string;
};

const acceptedLockfiles = ['pnpm-lock.yaml'] as const;
const rejectedLockfiles = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock'] as const;
const policyLockfiles = [...acceptedLockfiles, ...rejectedLockfiles] as const;
const scriptFileExtensions = new Set(['.bash', '.cjs', '.js', '.mjs', '.sh', '.ts', '.yaml', '.yml', '.zsh']);
const documentationFileExtensions = new Set(['.md', '.mdx']);
const currentDocumentationRoots = ['README.md', 'docs/README.md', 'docs/for-users', 'docs/for-agents'] as const;
const forbiddenPackageManagerCommandPattern =
  /\b(?<manager>npm|yarn)\s+(?<command>install|run|workspace|workspaces)\b/g;
const forbiddenDocumentationWorkspaceCommandPattern =
  /\b(?<manager>npm|yarn)\s+(?<command>install|run|workspace|workspaces|test|build|typecheck|dev)\b/g;
const forbiddenNodeInvocationPattern =
  /\b(?:execFileSync|execFile|spawnSync|spawn|runCapture|run)\(\s*['"`](?<manager>npm|yarn)['"`]\s*,\s*\[\s*['"`](?<command>install|run|workspace|workspaces)['"`]/g;

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8')) as T;
}

function readWorkspacePackages(): string[] {
  const workspaceManifest = parse(readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8')) as {
    packages?: string[];
  };

  return workspaceManifest.packages ?? [];
}

function workspacePackageManifestPaths(): string[] {
  const rootManifestPath = 'package.json';
  const workspacePackagePaths = readWorkspacePackages().flatMap((pattern) => {
    if (!pattern.endsWith('/*')) {
      const manifestPath = join(pattern, 'package.json');
      return existsSync(join(repoRoot, manifestPath)) ? [manifestPath] : [];
    }

    const workspaceDirectory = pattern.slice(0, -2);
    return readdirSync(join(repoRoot, workspaceDirectory))
      .map((entry) => join(workspaceDirectory, entry))
      .filter((entryPath) => statSync(join(repoRoot, entryPath)).isDirectory())
      .map((entryPath) => join(entryPath, 'package.json'))
      .filter((manifestPath) => existsSync(join(repoRoot, manifestPath)));
  });

  return [rootManifestPath, ...workspacePackagePaths].sort();
}

function workspacePackageDirectories(): string[] {
  return workspacePackageManifestPaths()
    .filter((manifestPath) => manifestPath !== 'package.json')
    .map((manifestPath) => dirname(manifestPath));
}

function lockfilePolicyLocations(): string[] {
  return ['.', ...workspacePackageDirectories()].sort();
}

function extensionOf(relativePath: string): string {
  const fileName = basename(relativePath);
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex === -1 ? '' : fileName.slice(dotIndex);
}

function collectScriptFiles(directory: string): string[] {
  const absoluteDirectory = join(repoRoot, directory);
  if (!existsSync(absoluteDirectory)) {
    return [];
  }

  return readdirSync(absoluteDirectory)
    .flatMap((entry) => {
      const relativePath = join(directory, entry);
      const absolutePath = join(repoRoot, relativePath);
      if (statSync(absolutePath).isDirectory()) {
        return collectScriptFiles(relativePath);
      }

      return scriptFileExtensions.has(extensionOf(relativePath)) ? [relativePath] : [];
    })
    .sort();
}

function collectFilesByExtension(relativePath: string, extensions: Set<string>): string[] {
  const absolutePath = join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return [];
  }

  if (statSync(absolutePath).isDirectory()) {
    return readdirSync(absolutePath)
      .flatMap((entry) => collectFilesByExtension(join(relativePath, entry), extensions))
      .sort();
  }

  return extensions.has(extensionOf(relativePath)) ? [relativePath] : [];
}

function automationScriptSources(): CommandSource[] {
  const scriptDirectories = ['scripts', ...workspacePackageDirectories().map((directory) => join(directory, 'scripts'))];
  const scriptPaths = scriptDirectories
    .flatMap(collectScriptFiles)
    .concat(collectScriptFiles(join('.github', 'workflows')))
    .concat(existsSync(join(repoRoot, 'action.yml')) ? ['action.yml'] : [])
    .sort();

  return scriptPaths.map((path) => ({ path, text: readFileSync(join(repoRoot, path), 'utf8') }));
}

function documentationSources(): CommandSource[] {
  return currentDocumentationRoots
    .flatMap((root) => collectFilesByExtension(root, documentationFileExtensions))
    .sort()
    .map((path) => ({ path, text: readFileSync(join(repoRoot, path), 'utf8') }));
}

function packageScriptSources(): CommandSource[] {
  return workspacePackageManifestPaths().flatMap((manifestPath) => {
    const manifest = readJson<PackageManifest>(manifestPath);
    return Object.entries(manifest.scripts ?? {}).map(([name, command]) => ({
      path: `${manifestPath}#scripts.${name}`,
      text: command,
    }));
  });
}

function lineNumberForIndex(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function forbiddenCommandsMatching(source: CommandSource, patterns: RegExp[]): string[] {
  const findings: string[] = [];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of source.text.matchAll(pattern)) {
      const manager = match.groups?.manager;
      const command = match.groups?.command;
      if (!manager || !command || match.index === undefined) {
        continue;
      }

      findings.push(`${source.path}:${lineNumberForIndex(source.text, match.index)} uses ${manager} ${command}`);
    }
  }

  return [...new Set(findings)].sort();
}

function forbiddenPackageManagerCommands(source: CommandSource): string[] {
  return forbiddenCommandsMatching(source, [forbiddenPackageManagerCommandPattern, forbiddenNodeInvocationPattern]);
}

function forbiddenDocumentationWorkspaceCommands(source: CommandSource): string[] {
  return forbiddenCommandsMatching(source, [forbiddenDocumentationWorkspaceCommandPattern]);
}

function classifyLockfile(relativePath: string): 'accepted' | 'rejected' | 'ignored' {
  const fileName = basename(relativePath);

  if (acceptedLockfiles.includes(fileName as (typeof acceptedLockfiles)[number])) {
    return 'accepted';
  }

  if (rejectedLockfiles.includes(fileName as (typeof rejectedLockfiles)[number])) {
    return 'rejected';
  }

  return 'ignored';
}

function existingRejectedLockfiles(): string[] {
  return lockfilePolicyLocations().flatMap((location) =>
    rejectedLockfiles
      .map((lockfile) => join(location, lockfile))
      .filter((relativePath) => existsSync(join(repoRoot, relativePath))),
  );
}

describe('workspace package manager contract', () => {
  it('declares pnpm as the only package manager for the workspace', () => {
    const rootManifest = readJson<PackageManifest>('package.json');
    const workspacePackages = readWorkspacePackages();

    expect(rootManifest.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    expect(workspacePackages).toEqual(['packages/*']);
    expect(existsSync(join(repoRoot, 'pnpm-workspace.yaml'))).toBe(true);
    expect(existsSync(join(repoRoot, 'pnpm-lock.yaml'))).toBe(true);
    expect(existsSync(join(repoRoot, 'package-lock.json'))).toBe(false);
    expect(existsSync(join(repoRoot, 'npm-shrinkwrap.json'))).toBe(false);
    expect(existsSync(join(repoRoot, 'yarn.lock'))).toBe(false);
  });

  it('allows pnpm lockfiles and rejects npm or yarn lockfiles in root and workspace locations', () => {
    const locations = lockfilePolicyLocations();
    const expectedWorkspaceLocations = [
      '.',
      'packages/cli',
      'packages/core',
      'packages/desktop',
      'packages/github',
      'packages/mcp',
      'packages/shared',
    ];

    expect(locations).toEqual(expectedWorkspaceLocations);

    for (const location of locations) {
      for (const lockfile of acceptedLockfiles) {
        expect(classifyLockfile(join(location, lockfile))).toBe('accepted');
      }

      for (const lockfile of rejectedLockfiles) {
        expect(classifyLockfile(join(location, lockfile))).toBe('rejected');
      }
    }

    expect(existingRejectedLockfiles()).toEqual([]);
    expect(existsSync(join(repoRoot, 'pnpm-lock.yaml'))).toBe(true);
    expect(policyLockfiles.map((lockfile) => classifyLockfile(lockfile))).toEqual([
      'accepted',
      'rejected',
      'rejected',
      'rejected',
    ]);
  });

  it('rejects npm or yarn workspace configuration in package manifests', () => {
    const manifests = workspacePackageManifestPaths().map((path) => ({
      path,
      manifest: readJson<PackageManifest>(path),
    }));

    const manifestsWithPackageWorkspaces = manifests
      .filter(({ manifest }) => manifest.workspaces !== undefined)
      .map(({ path }) => path);
    const manifestsWithNonPnpmPackageManagers = manifests
      .filter(
        ({ path, manifest }) =>
          path !== 'package.json' &&
          manifest.packageManager !== undefined &&
          !manifest.packageManager.startsWith('pnpm@'),
      )
      .map(({ path, manifest }) => `${path}: ${manifest.packageManager}`);

    expect(manifestsWithPackageWorkspaces).toEqual([]);
    expect(manifestsWithNonPnpmPackageManagers).toEqual([]);
  });

  it('rejects npm or yarn install, run, workspace, and workspaces commands in automation scripts', () => {
    expect(forbiddenPackageManagerCommands({ path: 'fixture.sh', text: 'npm install left-pad' })).toEqual([
      'fixture.sh:1 uses npm install',
    ]);
    expect(forbiddenPackageManagerCommands({ path: 'fixture.sh', text: 'yarn run build' })).toEqual([
      'fixture.sh:1 uses yarn run',
    ]);
    expect(forbiddenPackageManagerCommands({ path: 'fixture.mjs', text: "spawnSync('npm', ['workspace', 'pkg', 'test'])" })).toEqual([
      'fixture.mjs:1 uses npm workspace',
    ]);
    expect(forbiddenPackageManagerCommands({ path: 'fixture.sh', text: 'npm pack --dry-run\npnpm install --frozen-lockfile' })).toEqual([]);

    const findings = [...automationScriptSources(), ...packageScriptSources()].flatMap(forbiddenPackageManagerCommands);

    expect(findings).toEqual([]);
  });

  it('documents pnpm-only source checkout setup and workflow commands', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    const developmentGuide = readFileSync(join(repoRoot, 'docs/for-agents/DEVELOPMENT.md'), 'utf8');

    expect(readme).toContain('CodeAgora is a pnpm-only workspace');
    expect(readme).toContain('do not use npm or yarn for workspace workflows');
    expect(readme).toContain('pnpm install');
    expect(readme).toContain('pnpm build');
    expect(readme).toContain('pnpm typecheck');
    expect(readme).toContain('pnpm test');
    expect(readme).toContain('pnpm dev review path/to/diff.patch');
    expect(developmentGuide).toContain('This workspace is pnpm-only');
    expect(developmentGuide).toContain('npm pack');
  });

  it('rejects npm or yarn workspace workflow instructions in current docs', () => {
    expect(forbiddenDocumentationWorkspaceCommands({ path: 'fixture.md', text: 'npm install\nnpm run build' })).toEqual([
      'fixture.md:1 uses npm install',
      'fixture.md:2 uses npm run',
    ]);
    expect(forbiddenDocumentationWorkspaceCommands({ path: 'fixture.md', text: 'yarn install\nyarn test' })).toEqual([
      'fixture.md:1 uses yarn install',
      'fixture.md:2 uses yarn test',
    ]);
    expect(forbiddenDocumentationWorkspaceCommands({ path: 'fixture.md', text: 'npm i -g @codeagora/review@rc' })).toEqual([]);
    expect(forbiddenDocumentationWorkspaceCommands({ path: 'fixture.md', text: 'package-lock.json, pnpm-lock.yaml, yarn.lock' })).toEqual([]);
    expect(forbiddenDocumentationWorkspaceCommands({ path: 'fixture.md', text: 'npm pack --dry-run\npnpm install' })).toEqual([]);

    const findings = documentationSources().flatMap(forbiddenDocumentationWorkspaceCommands);

    expect(findings).toEqual([]);
  });
});
