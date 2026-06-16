#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  DESKTOP_RC_DISTRIBUTION_EVIDENCE_FILENAME,
  desktopRcUpdaterManifestFilename,
  parseDesktopRcTag,
  readDesktopRcDistributionEvidence,
} from './desktop-artifacts.mjs';

const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const evidenceRoot = path.join(repoRoot, '.sisyphus', 'evidence');

function parseArgs(argv) {
  const options = {
    tag: process.env.GITHUB_REF_NAME,
    repo: process.env.GITHUB_REPOSITORY,
    evidenceRoot,
    output: path.join(evidenceRoot, 'desktop-rc-github-release-assets.json'),
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--tag') options.tag = argv[++index];
    else if (arg?.startsWith('--tag=')) options.tag = arg.slice('--tag='.length);
    else if (arg === '--repo') options.repo = argv[++index];
    else if (arg?.startsWith('--repo=')) options.repo = arg.slice('--repo='.length);
    else if (arg === '--evidence-root') options.evidenceRoot = argv[++index];
    else if (arg?.startsWith('--evidence-root=')) options.evidenceRoot = arg.slice('--evidence-root='.length);
    else if (arg === '--output') options.output = argv[++index];
    else if (arg?.startsWith('--output=')) options.output = arg.slice('--output='.length);
    else if (arg !== '--') throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function ghJson(args) {
  return JSON.parse(execFileSync('gh', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
}

function assetNames(release) {
  return new Set((release.assets ?? []).map((asset) => asset.name).filter(Boolean));
}

function requireAssets(release, expected, label) {
  const names = assetNames(release);
  return expected.filter((asset) => !names.has(asset)).map((asset) => `${label} is missing ${asset}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const parsed = parseDesktopRcTag(options.tag);
  const evidenceRead = readDesktopRcDistributionEvidence({
    cwd: repoRoot,
    evidenceRoot: options.evidenceRoot,
  });
  if (!evidenceRead.present) {
    throw new Error(`${DESKTOP_RC_DISTRIBUTION_EVIDENCE_FILENAME} is required before verifying GitHub release assets`);
  }

  const evidence = evidenceRead.evidence;
  const channelTag = `desktop-${parsed.releaseLine}-rc`;
  const manifestFilename = desktopRcUpdaterManifestFilename(parsed.version);
  const repoArgs = options.repo ? ['--repo', options.repo] : [];
  const release = ghJson(['release', 'view', parsed.gitTag, '--json', 'isPrerelease,url,assets', ...repoArgs]);
  const channelRelease = ghJson(['release', 'view', channelTag, '--json', 'isPrerelease,url,assets', ...repoArgs]);
  const expectedReleaseAssets = [
    ...(evidence.githubRelease?.assets ?? []),
    'desktop-rc-distribution-gate.log',
    'evidence-manifest.json',
  ];
  const errors = [
    ...(release.isPrerelease === true ? [] : [`${parsed.gitTag} must be a GitHub prerelease`]),
    ...(channelRelease.isPrerelease === true ? [] : [`${channelTag} must be a GitHub prerelease`]),
    ...requireAssets(release, expectedReleaseAssets, parsed.gitTag),
    ...requireAssets(channelRelease, [manifestFilename], channelTag),
  ];
  const result = {
    schemaVersion: 'codeagora.desktop-rc-github-release-assets.v1',
    generatedAt: new Date().toISOString(),
    gitTag: parsed.gitTag,
    releaseLine: parsed.releaseLine,
    updaterChannelTag: channelTag,
    updaterManifestFilename: manifestFilename,
    versionedRelease: {
      url: release.url,
      prerelease: release.isPrerelease === true,
      assets: [...assetNames(release)].sort(),
    },
    updaterChannelRelease: {
      url: channelRelease.url,
      prerelease: channelRelease.isPrerelease === true,
      assets: [...assetNames(channelRelease)].sort(),
    },
    valid: errors.length === 0,
    errors,
  };

  fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
  fs.writeFileSync(path.resolve(options.output), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  if (!result.valid) {
    throw new Error(`Desktop RC GitHub release asset verification failed: ${errors.join('; ')}`);
  }
  console.log(`Desktop RC GitHub release assets verified for ${parsed.gitTag} and ${channelTag}`);
}

main();
