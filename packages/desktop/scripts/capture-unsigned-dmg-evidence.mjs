#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  DESKTOP_UNSIGNED_DMG_EVIDENCE_FILENAME,
  DESKTOP_UNSIGNED_DMG_EVIDENCE_SCHEMA_VERSION,
  MACOS_ARM64_ARCH,
  MACOS_DESKTOP_PLATFORM,
  parseDesktopStableTag,
  parseDesktopStableVersion,
  validateDesktopUnsignedDmgEvidence,
} from './desktop-artifacts.mjs';

const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const evidenceRoot = path.join(repoRoot, '.sisyphus', 'evidence');
const defaultBundleRoot = path.join(
  packageRoot,
  'src-tauri',
  'target',
  'aarch64-apple-darwin',
  'release',
  'bundle',
);

function parseArgs(argv) {
  const options = {
    tag: process.env.GITHUB_REF_NAME,
    releaseUrl: process.env.GITHUB_RELEASE_URL,
    appPath: process.env.CODEAGORA_DESKTOP_APP_PATH,
    dmgPath: process.env.CODEAGORA_DESKTOP_DMG_PATH,
    output: path.join(evidenceRoot, DESKTOP_UNSIGNED_DMG_EVIDENCE_FILENAME),
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

function findFirst(root, predicate) {
  if (!fs.existsSync(root)) return null;
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir).sort()) {
      const current = path.join(dir, entry);
      const stat = fs.statSync(current);
      if (predicate(current, stat)) return current;
      if (stat.isDirectory() && !current.endsWith('.app')) {
        const found = visit(current);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(root);
}

function requiredPath(filePath, label) {
  if (!filePath) throw new Error(`${label} path is required`);
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) throw new Error(`${label} is missing: ${absolute}`);
  return absolute;
}

function runOutput(file, args) {
  return execFileSync(file, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readInfoPlist(appPath) {
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  return {
    CFBundleShortVersionString: runOutput('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plistPath]).trim(),
    CFBundleVersion: runOutput('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleVersion', plistPath]).trim(),
    CFBundleIdentifier: runOutput('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plistPath]).trim(),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const parsed = options.tag
    ? parseDesktopStableTag(options.tag)
    : parseDesktopStableVersion(readJson(path.join(packageRoot, 'package.json')).version);
  const releaseUrl = options.releaseUrl ?? `https://github.com/bssm-oss/CodeAgora/releases/tag/${parsed.gitTag}`;
  const appPath = requiredPath(
    options.appPath ?? findFirst(defaultBundleRoot, (candidate, stat) => stat.isDirectory() && candidate.endsWith('CodeAgora.app')),
    'macOS app bundle',
  );
  const dmgPath = requiredPath(
    options.dmgPath ?? findFirst(path.join(defaultBundleRoot, 'dmg'), (candidate, stat) => stat.isFile() && /CodeAgora_.*_aarch64\.dmg$/.test(path.basename(candidate))),
    'macOS unsigned DMG',
  );
  const infoPlist = readInfoPlist(appPath);

  const evidence = {
    schemaVersion: DESKTOP_UNSIGNED_DMG_EVIDENCE_SCHEMA_VERSION,
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
    distributionPolicy: {
      signed: false,
      notarized: false,
      updaterEnabled: false,
      gatekeeperWarning: true,
      supportTier: 'preview',
      note: 'v0.1.0 Desktop is distributed as an unsigned preview DMG; macOS Gatekeeper warning is expected.',
    },
    githubRelease: {
      tag: parsed.gitTag,
      prerelease: false,
      url: releaseUrl,
      assets: [
        path.basename(dmgPath),
        DESKTOP_UNSIGNED_DMG_EVIDENCE_FILENAME,
      ],
    },
  };

  const validation = validateDesktopUnsignedDmgEvidence(evidence);
  if (!validation.valid) {
    throw new Error(`Generated Desktop unsigned DMG evidence is invalid: ${validation.errors.join('; ')}`);
  }

  fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
  fs.writeFileSync(path.resolve(options.output), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`Desktop unsigned DMG evidence written to ${relative(options.output)}`);
}

main();
