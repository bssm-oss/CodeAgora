#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_FILENAME,
  DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION,
  DESKTOP_STABLE_UPDATER_PLATFORM,
  MACOS_ARM64_ARCH,
  MACOS_DESKTOP_PLATFORM,
  desktopStableUpdaterManifestFilename,
  parseDesktopStableTag,
  parseDesktopStableVersion,
  validateDesktopStableDistributionEvidence,
} from './desktop-artifacts.mjs';

const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const evidenceRoot = path.join(repoRoot, '.sisyphus', 'evidence');

function parseArgs(argv) {
  const options = {
    tag: process.env.GITHUB_REF_NAME,
    releaseUrl: process.env.GITHUB_RELEASE_URL,
    appPath: process.env.CODEAGORA_DESKTOP_APP_PATH,
    dmgPath: process.env.CODEAGORA_DESKTOP_DMG_PATH,
    updaterPath: process.env.CODEAGORA_DESKTOP_UPDATER_PATH,
    updaterSignaturePath: process.env.CODEAGORA_DESKTOP_UPDATER_SIGNATURE_PATH,
    updaterManifestUrl: process.env.CODEAGORA_DESKTOP_UPDATER_MANIFEST_URL,
    output: path.join(evidenceRoot, DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_FILENAME),
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--tag') options.tag = argv[++index];
    else if (arg?.startsWith('--tag=')) options.tag = arg.slice('--tag='.length);
    else if (arg === '--release-url') options.releaseUrl = argv[++index];
    else if (arg?.startsWith('--release-url=')) options.releaseUrl = arg.slice('--release-url='.length);
    else if (arg === '--app') options.appPath = argv[++index];
    else if (arg?.startsWith('--app=')) options.appPath = arg.slice('--app='.length);
    else if (arg === '--dmg') options.dmgPath = argv[++index];
    else if (arg?.startsWith('--dmg=')) options.dmgPath = arg.slice('--dmg='.length);
    else if (arg === '--updater') options.updaterPath = argv[++index];
    else if (arg?.startsWith('--updater=')) options.updaterPath = arg.slice('--updater='.length);
    else if (arg === '--updater-sig') options.updaterSignaturePath = argv[++index];
    else if (arg?.startsWith('--updater-sig=')) options.updaterSignaturePath = arg.slice('--updater-sig='.length);
    else if (arg === '--updater-manifest-url') options.updaterManifestUrl = argv[++index];
    else if (arg?.startsWith('--updater-manifest-url=')) options.updaterManifestUrl = arg.slice('--updater-manifest-url='.length);
    else if (arg === '--output') options.output = argv[++index];
    else if (arg?.startsWith('--output=')) options.output = arg.slice('--output='.length);
    else if (arg !== '--') throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(filePath) {
  const absolute = path.resolve(filePath);
  const stat = fs.statSync(absolute);
  if (!stat.isDirectory()) {
    return crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  }

  const hash = crypto.createHash('sha256');
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir).sort()) {
      const current = path.join(dir, entry);
      const relativePath = path.relative(absolute, current);
      const currentStat = fs.statSync(current);
      hash.update(relativePath);
      hash.update(currentStat.mode.toString(8));
      if (currentStat.isDirectory()) {
        visit(current);
      } else if (currentStat.isFile()) {
        hash.update(fs.readFileSync(current));
      }
    }
  };
  visit(absolute);
  return hash.digest('hex');
}

function relative(filePath) {
  return path.relative(repoRoot, path.resolve(filePath));
}

function requiredFile(filePath, label) {
  if (!filePath) throw new Error(`${label} path is required`);
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) throw new Error(`${label} is missing: ${absolute}`);
  return absolute;
}

function runOutput(file, args, options = {}) {
  return execFileSync(file, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function parseCodesignDetails(appPath) {
  const result = spawnSync('codesign', ['-dv', '--verbose=4', appPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const details = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    throw new Error(`codesign metadata capture failed for ${appPath}: ${details}`);
  }
  const authority = [...details.matchAll(/^Authority=(.+)$/gm)].map((match) => match[1].trim());
  const teamIdentifier = /^TeamIdentifier=(.+)$/m.exec(details)?.[1]?.trim() ?? process.env.APPLE_TEAM_ID ?? null;
  const identifier = /^Identifier=(.+)$/m.exec(details)?.[1]?.trim() ?? null;
  const hardenedRuntime = /^Runtime Version=/m.test(details) || /\bruntime\b/i.test(details);

  return {
    status: 'accepted',
    authority,
    teamIdentifier,
    identifier,
    hardenedRuntime,
    verifyDeepStrict: true,
    spctlAssess: true,
  };
}

function readInfoPlist(appPath) {
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  return {
    CFBundleShortVersionString: runOutput('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plistPath]).trim(),
    CFBundleVersion: runOutput('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleVersion', plistPath]).trim(),
    CFBundleIdentifier: runOutput('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plistPath]).trim(),
  };
}

function readTauriUpdaterPublicKey() {
  const tauriConfig = readJson(path.join(packageRoot, 'src-tauri', 'tauri.conf.json'));
  const publicKey = tauriConfig.plugins?.updater?.pubkey;
  if (typeof publicKey !== 'string' || publicKey.trim().length === 0) {
    throw new Error('Tauri updater public key is missing from src-tauri/tauri.conf.json');
  }
  return publicKey;
}

function githubReleaseDownloadBaseUrl(releaseUrl) {
  const normalized = releaseUrl.replace(/\/$/, '');
  if (normalized.includes('/releases/download/')) return normalized;
  if (normalized.includes('/releases/tag/')) return normalized.replace('/releases/tag/', '/releases/download/');
  return `${normalized}/download`;
}

function writeStableUpdaterManifest({ version, releaseUrl, updaterPath, updaterSignaturePath, outputUrl }) {
  const signatureContent = fs.readFileSync(updaterSignaturePath, 'utf8').trim();
  const downloadBaseUrl = githubReleaseDownloadBaseUrl(releaseUrl);
  const artifactUrl = `${downloadBaseUrl}/${path.basename(updaterPath)}`;
  const manifest = {
    version,
    pub_date: new Date().toISOString(),
    platforms: {
      [DESKTOP_STABLE_UPDATER_PLATFORM]: {
        signature: signatureContent,
        url: artifactUrl,
      },
    },
  };
  const filename = desktopStableUpdaterManifestFilename(version);
  const manifestPath = path.join(evidenceRoot, filename);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return {
    filename,
    path: manifestPath,
    url: outputUrl ?? `${downloadBaseUrl}/${filename}`,
    json: manifest,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const parsed = options.tag ? parseDesktopStableTag(options.tag) : parseDesktopStableVersion(readJson(path.join(packageRoot, 'package.json')).version);
  const releaseUrl = options.releaseUrl ?? `https://github.com/bssm-oss/CodeAgora/releases/tag/${parsed.gitTag}`;
  const appPath = requiredFile(options.appPath, 'macOS app bundle');
  const dmgPath = requiredFile(options.dmgPath, 'macOS DMG');
  const updaterPath = requiredFile(options.updaterPath, 'updater artifact');
  const updaterSignaturePath = requiredFile(options.updaterSignaturePath, 'updater signature');
  const manifest = writeStableUpdaterManifest({
    version: parsed.version,
    releaseUrl,
    updaterPath,
    updaterSignaturePath,
    outputUrl: options.updaterManifestUrl,
  });
  const infoPlist = readInfoPlist(appPath);

  runOutput('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
  runOutput('spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath]);
  runOutput('xcrun', ['stapler', 'validate', appPath]);
  runOutput('xcrun', ['stapler', 'validate', dmgPath]);

  const evidence = {
    schemaVersion: DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    evidenceMode: 'real',
    version: parsed.version,
    gitTag: parsed.gitTag,
    npmDistTag: parsed.npmDistTag,
    target: {
      platform: MACOS_DESKTOP_PLATFORM,
      arch: MACOS_ARM64_ARCH,
    },
    app: {
      path: relative(appPath),
      sha256: sha256(appPath),
      bundleIdentifier: infoPlist.CFBundleIdentifier,
      infoPlist,
    },
    dmg: {
      path: relative(dmgPath),
      sha256: sha256(dmgPath),
    },
    codesign: parseCodesignDetails(appPath),
    notarization: {
      status: 'accepted',
      ticketStapled: true,
      appTicketStapled: true,
      dmgTicketStapled: true,
    },
    updater: {
      releaseLine: parsed.releaseLine,
      publicKey: readTauriUpdaterPublicKey(),
      artifact: {
        path: relative(updaterPath),
        sha256: sha256(updaterPath),
      },
      signature: {
        path: relative(updaterSignaturePath),
        content: fs.readFileSync(updaterSignaturePath, 'utf8').trim(),
      },
      manifest: {
        filename: manifest.filename,
        path: relative(manifest.path),
        url: manifest.url,
        sha256: sha256(manifest.path),
        json: manifest.json,
      },
    },
    githubRelease: {
      tag: parsed.gitTag,
      prerelease: false,
      url: releaseUrl,
      assets: [
        path.basename(dmgPath),
        path.basename(updaterPath),
        path.basename(updaterSignaturePath),
        manifest.filename,
        DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_FILENAME,
      ],
    },
  };

  const validation = validateDesktopStableDistributionEvidence(evidence);
  if (!validation.valid) {
    throw new Error(`Generated Desktop stable distribution evidence is invalid: ${validation.errors.join('; ')}`);
  }

  fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
  fs.writeFileSync(path.resolve(options.output), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`Desktop stable distribution evidence written to ${relative(options.output)}`);
}

main();
