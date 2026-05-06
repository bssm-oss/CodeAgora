import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const evidenceRoot = path.join(repoRoot, '.sisyphus', 'evidence');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fileEvidence(relativePath) {
  const absolutePath = path.join(packageRoot, relativePath);
  const exists = fs.existsSync(absolutePath);
  return {
    path: relativePath,
    present: exists,
    size: exists ? fs.statSync(absolutePath).size : 0,
    sha256: exists ? sha256(absolutePath) : null,
  };
}

const packageJson = readJson(path.join(packageRoot, 'package.json'));
const tauriConfig = readJson(path.join(packageRoot, 'src-tauri', 'tauri.conf.json'));
const main = fs.readFileSync(path.join(packageRoot, 'src-tauri', 'src', 'main.rs'), 'utf8');

const commands = [
  'open_repository',
  'get_repo_info',
  'list_sessions',
  'get_session_detail',
  'export_session',
  'start_review_run',
  'get_review_run',
  'cancel_review_run',
  'read_config',
  'validate_config',
  'write_config',
  'get_provider_status',
  'get_mcp_status',
  'get_github_action_status',
  'get_evidence_status',
  'get_command_contract',
].map((name) => ({
  name,
  present: main.includes(name),
}));

const manifest = {
  schemaVersion: 'codeagora.desktop-evidence.v1',
  generatedAt: new Date().toISOString(),
  package: {
    name: packageJson.name,
    version: packageJson.version,
    private: packageJson.private === true,
  },
  platform: {
    os: os.platform(),
    arch: os.arch(),
    release: os.release(),
  },
  tauri: {
    productName: tauriConfig.productName,
    version: tauriConfig.version,
    identifier: tauriConfig.identifier,
    bundleActive: tauriConfig.bundle?.active === true,
    bundleTargets: tauriConfig.bundle?.targets,
    frontendDist: tauriConfig.build?.frontendDist,
    csp: tauriConfig.app?.security?.csp ?? null,
    windows: tauriConfig.app?.windows ?? [],
  },
  packagingDecision: {
    releaseChannel: 'private-preview',
    publicDesktopLaunch: false,
    signing: 'deferred-until-public-desktop-launch',
    notarization: 'deferred-until-public-desktop-launch',
    updater: 'disabled-for-private-preview',
    packageSmoke: 'pnpm --filter @codeagora/desktop smoke',
    appE2e: 'pnpm --filter @codeagora/desktop app:e2e',
    bundleSmoke: 'pnpm --filter @codeagora/desktop bundle:smoke',
    rcGate: 'pnpm --filter @codeagora/desktop evidence',
  },
  artifacts: [
    fileEvidence('dist/index.html'),
    fileEvidence('dist/main.js'),
    fileEvidence('src-tauri/tauri.conf.json'),
    fileEvidence('src-tauri/Cargo.toml'),
    fileEvidence('src-tauri/src/main.rs'),
    fileEvidence('README.md'),
  ],
  commandContract: commands,
  requiredChecks: [
    'pnpm --filter @codeagora/desktop typecheck',
    'pnpm --filter @codeagora/desktop smoke',
    'pnpm --filter @codeagora/desktop tauri:check',
    'pnpm --filter @codeagora/desktop app:e2e',
    'pnpm --filter @codeagora/desktop bundle:smoke',
    'pnpm --filter @codeagora/desktop evidence',
  ],
  manualSmoke: [
    'Launch the Tauri shell on the preview platform.',
    'Open a trusted git repository.',
    'Verify repo, config, session, provider, MCP, Action, and evidence panels render.',
    'Start a provider-free or safe review path and verify progress/cancel behavior.',
    'Export one session as Markdown, JSON, and SARIF.',
    'Confirm no provider secret is visible in UI logs, errors, or exports.',
  ],
};

fs.mkdirSync(evidenceRoot, { recursive: true });
const outputPath = path.join(evidenceRoot, 'desktop-evidence-manifest.json');
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Desktop evidence manifest written to ${path.relative(repoRoot, outputPath)}`);
