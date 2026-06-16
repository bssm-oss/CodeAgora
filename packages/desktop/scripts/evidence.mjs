import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MACOS_ARM64_SIGNING_EVIDENCE_FILENAME,
  DESKTOP_RC_DISTRIBUTION_EVIDENCE_FILENAME,
  locateMacosDesktopArtifact,
  readDesktopRcDistributionEvidence,
  readMacosArm64SigningEvidence,
  validateDesktopRcDistributionEvidence,
  validateMacosArm64SigningEvidence,
} from './desktop-artifacts.mjs';

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
const macosArm64Artifact = locateMacosDesktopArtifact({
  cwd: repoRoot,
  bundleRoot: path.join(packageRoot, 'src-tauri', 'target', 'release', 'bundle'),
  productName: tauriConfig.productName,
  version: packageJson.version,
  arch: 'arm64',
});
const macosArm64SigningEvidence = readMacosArm64SigningEvidence({
  cwd: repoRoot,
  evidenceRoot,
});
const macosArm64SigningValidation = validateMacosArm64SigningEvidence({
  artifact: macosArm64Artifact,
  evidence: macosArm64SigningEvidence.evidence,
});
const desktopRcDistributionEvidence = readDesktopRcDistributionEvidence({
  cwd: repoRoot,
  evidenceRoot,
});
const desktopRcDistributionValidation = validateDesktopRcDistributionEvidence(
  desktopRcDistributionEvidence.evidence,
  { version: packageJson.version },
);

const commands = [
  'open_external_link',
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
  'get_live_doctor_status',
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
    releaseChannel: 'official-desktop',
    publicDesktopLaunch: true,
    signing: macosArm64SigningValidation.valid
      ? 'valid-macos-arm64-release-evidence'
      : 'missing-or-invalid-macos-arm64-release-evidence',
    notarization: macosArm64SigningValidation.valid
      ? 'valid-macos-arm64-release-evidence'
      : 'missing-or-invalid-macos-arm64-release-evidence',
    updater: 'enabled-for-line-scoped-rc-updates',
    updaterManifest: 'latest-0.1-rc.json',
    packageSmoke: 'pnpm --filter @codeagora/desktop smoke',
    appE2e: 'pnpm --filter @codeagora/desktop app:e2e',
    macosWebdriverE2e: 'pnpm --filter @codeagora/desktop macos:webdriver-e2e (debug .app bundle)',
    visualQa: 'pnpm --filter @codeagora/desktop visual:qa (cockpit and setup screenshots)',
    liveReviewSmoke: 'pnpm --filter @codeagora/desktop live:review-smoke (real provider smoke when provider credentials are available)',
    bundleSmoke: 'pnpm --filter @codeagora/desktop bundle:smoke',
    rcGate: 'pnpm rc:desktop-gate',
  },
  releaseArtifacts: {
    macosArm64: {
      platform: macosArm64Artifact.platform,
      arch: macosArm64Artifact.arch,
      tauriArch: macosArm64Artifact.tauriArch,
      artifactType: macosArm64Artifact.artifactType,
      present: macosArm64Artifact.present,
      expectedFilename: macosArm64Artifact.expectedFilename,
      path: macosArm64Artifact.relativePath,
      size: macosArm64Artifact.size ?? 0,
      sha256: macosArm64Artifact.sha256 ?? null,
      error: macosArm64Artifact.error ?? null,
    },
    macosArm64SigningEvidence: {
      path: macosArm64SigningEvidence.relativePath
        ?? path.join('.sisyphus', 'evidence', MACOS_ARM64_SIGNING_EVIDENCE_FILENAME),
      present: macosArm64SigningEvidence.present,
      validation: macosArm64SigningValidation,
    },
    desktopRcDistributionEvidence: {
      path: desktopRcDistributionEvidence.relativePath
        ?? path.join('.sisyphus', 'evidence', DESKTOP_RC_DISTRIBUTION_EVIDENCE_FILENAME),
      present: desktopRcDistributionEvidence.present,
      validation: desktopRcDistributionValidation,
    },
  },
  artifacts: [
    fileEvidence('dist/index.html'),
    fileEvidence('dist/main.js'),
    fileEvidence('src-tauri/tauri.conf.json'),
    fileEvidence('src-tauri/Cargo.toml'),
    fileEvidence('src-tauri/src/main.rs'),
    fileEvidence('scripts/visual-qa.mjs'),
    fileEvidence('README.md'),
  ],
  commandContract: commands,
  requiredChecks: [
    'pnpm --filter @codeagora/desktop typecheck',
    'pnpm --filter @codeagora/desktop smoke',
    'pnpm --filter @codeagora/desktop tauri:check',
    'pnpm --filter @codeagora/desktop app:e2e',
    'pnpm --filter @codeagora/desktop macos:webdriver-e2e',
    'pnpm --filter @codeagora/desktop visual:qa',
    'pnpm --filter @codeagora/desktop bundle:smoke',
    'pnpm --filter @codeagora/desktop evidence',
  ],
  optionalLiveChecks: [
    'pnpm --filter @codeagora/desktop live:review-smoke',
  ],
  manualSmoke: [
    'Launch the Tauri shell on the target platform.',
    'Open a trusted git repository.',
    'Verify repo, config, session, provider, MCP, Action, and evidence panels render.',
    'Run the live LLM review connection check and confirm provider connectivity or failure is surfaced clearly.',
    'Run a real live review smoke and confirm a review session is produced in .ca/sessions.',
    'Start a provider-free or safe review path and verify progress/cancel behavior.',
    'Export one session as Markdown, JSON, and SARIF.',
    'Confirm no provider secret is visible in UI logs, errors, or exports.',
  ],
};

fs.mkdirSync(evidenceRoot, { recursive: true });
const outputPath = path.join(evidenceRoot, 'desktop-evidence-manifest.json');
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Desktop evidence manifest written to ${path.relative(repoRoot, outputPath)}`);
