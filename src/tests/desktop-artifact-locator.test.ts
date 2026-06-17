import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  MACOS_ARM64_SIGNING_EVIDENCE_SCHEMA_VERSION,
  DESKTOP_RC_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION,
  DESKTOP_RC_DISTRIBUTION_EVIDENCE_FILENAME,
  DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION,
  DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_FILENAME,
  DESKTOP_UNSIGNED_DMG_EVIDENCE_SCHEMA_VERSION,
  DESKTOP_UNSIGNED_DMG_EVIDENCE_FILENAME,
  DESKTOP_RC_UPDATER_PLATFORM,
  DESKTOP_STABLE_UPDATER_PLATFORM,
  assertMacosArm64NotarizationEvidence,
  assertMacosArm64SigningEvidence,
  assertMacosArm64ArtifactMetadata,
  assertMacosDesktopArtifact,
  desktopRcUpdaterManifestFilename,
  desktopStableUpdaterManifestFilename,
  locateMacosDesktopArtifact,
  macosDesktopArtifactFilename,
  parseDesktopRcTag,
  parseDesktopRcVersion,
  parseDesktopStableTag,
  parseDesktopStableVersion,
  tauriMacosArchSuffix,
  validateDesktopRcDistributionEvidence,
  validateDesktopRcUpdaterManifest,
  validateDesktopStableDistributionEvidence,
  validateDesktopStableUpdaterManifest,
  validateDesktopUnsignedDmgEvidence,
  validateMacosArm64NotarizationEvidence,
  validateMacosArm64SigningEvidence,
  validateMacosArm64ArtifactMetadata,
} from '../../packages/desktop/scripts/desktop-artifacts.mjs';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-desktop-artifacts-'));
}

describe('macOS desktop artifact locator', () => {
  it('accepts only npm-semver RC versions and maps the line-scoped updater manifest', () => {
    expect(parseDesktopRcVersion('0.1.0-rc.7')).toMatchObject({
      version: '0.1.0-rc.7',
      releaseLine: '0.1',
      gitTag: 'v0.1.0-rc.7',
      npmDistTag: 'rc',
      updaterManifestFilename: 'latest-0.1-rc.json',
    });
    expect(parseDesktopRcTag('v0.2.0-rc.1')).toMatchObject({
      version: '0.2.0-rc.1',
      releaseLine: '0.2',
      updaterManifestFilename: 'latest-0.2-rc.json',
    });
    expect(desktopRcUpdaterManifestFilename('v0.1.0-rc.7')).toBe('latest-0.1-rc.json');
    expect(() => parseDesktopRcVersion('0.1.0-rc7')).toThrow('X.Y.Z-rc.N');
    expect(() => parseDesktopRcVersion('0.1.0-desktop-rc.7')).toThrow('X.Y.Z-rc.N');
    expect(() => parseDesktopRcVersion('0.1.0-rc.7+build.1')).toThrow('X.Y.Z-rc.N');
  });

  it('accepts only stable npm-semver versions and maps the stable updater manifest', () => {
    expect(parseDesktopStableVersion('0.1.0')).toMatchObject({
      version: '0.1.0',
      releaseLine: '0.1',
      gitTag: 'v0.1.0',
      npmDistTag: 'latest',
      updaterManifestFilename: 'latest-0.1.json',
    });
    expect(parseDesktopStableTag('v0.2.0')).toMatchObject({
      version: '0.2.0',
      releaseLine: '0.2',
      updaterManifestFilename: 'latest-0.2.json',
    });
    expect(desktopStableUpdaterManifestFilename('v0.1.0')).toBe('latest-0.1.json');
    expect(() => parseDesktopStableVersion('0.1.0-rc.7')).toThrow('without prerelease');
    expect(() => parseDesktopStableVersion('0.1.0+build.1')).toThrow('without prerelease');
  });

  it('builds the expected Tauri macOS release artifact name for arm64', () => {
    expect(tauriMacosArchSuffix('arm64')).toBe('aarch64');
    expect(macosDesktopArtifactFilename({
      productName: 'CodeAgora',
      version: '0.1.0-rc.6',
      arch: 'arm64',
    })).toBe('CodeAgora_0.1.0-rc.6_aarch64.dmg');
  });

  it('locates the expected macOS release artifact in a fixture bundle directory', () => {
    const cwd = makeTmpDir();
    try {
      const bundleRoot = path.join(cwd, 'fixture-bundle');
      const dmgDir = path.join(bundleRoot, 'dmg');
      fs.mkdirSync(dmgDir, { recursive: true });
      const filename = macosDesktopArtifactFilename({
        productName: 'CodeAgora',
        version: '0.1.0-rc.6',
        arch: 'arm64',
      });
      fs.writeFileSync(path.join(dmgDir, filename), 'fake dmg\n');

      const artifact = locateMacosDesktopArtifact({
        cwd,
        bundleRoot,
        productName: 'CodeAgora',
        version: '0.1.0-rc.6',
        arch: 'arm64',
      });

      expect(artifact).toMatchObject({
        present: true,
        platform: 'macos',
        arch: 'arm64',
        tauriArch: 'aarch64',
        artifactType: 'dmg',
        expectedFilename: filename,
        relativePath: path.join('fixture-bundle', 'dmg', filename),
        size: 9,
      });
      expect(assertMacosDesktopArtifact({
        cwd,
        bundleRoot,
        productName: 'CodeAgora',
        version: '0.1.0-rc.6',
        arch: 'arm64',
      }).path).toBe(path.join(dmgDir, filename));
      expect(validateMacosArm64ArtifactMetadata(artifact)).toMatchObject({
        valid: true,
        platform: 'macos',
        arch: 'arm64',
        tauriArch: 'aarch64',
        artifactType: 'dmg',
        expectedFilename: filename,
        errors: [],
      });
      expect(assertMacosArm64ArtifactMetadata(artifact).valid).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('accepts valid signing evidence for the located macOS arm64 artifact', () => {
    const cwd = makeTmpDir();
    try {
      const bundleRoot = path.join(cwd, 'fixture-bundle');
      const dmgDir = path.join(bundleRoot, 'dmg');
      fs.mkdirSync(dmgDir, { recursive: true });
      const filename = macosDesktopArtifactFilename({
        productName: 'CodeAgora',
        version: '0.1.0-rc.6',
        arch: 'arm64',
      });
      fs.writeFileSync(path.join(dmgDir, filename), 'signed fake dmg\n');

      const artifact = locateMacosDesktopArtifact({
        cwd,
        bundleRoot,
        productName: 'CodeAgora',
        version: '0.1.0-rc.6',
        arch: 'arm64',
      });
      const evidence = {
        schemaVersion: MACOS_ARM64_SIGNING_EVIDENCE_SCHEMA_VERSION,
        generatedAt: '2026-06-12T00:00:00.000Z',
        artifact: {
          path: artifact.relativePath,
          sha256: artifact.sha256,
        },
        codesign: {
          status: 'accepted',
          authority: ['Developer ID Application: CodeAgora Test (TEAMID1234)'],
          teamIdentifier: 'TEAMID1234',
          identifier: 'com.codeagora.desktop',
          hardenedRuntime: true,
        },
        notarization: {
          status: 'accepted',
          ticketStapled: true,
        },
      };

      const validation = validateMacosArm64SigningEvidence({ artifact, evidence });

      expect(validation).toMatchObject({
        valid: true,
        evidencePath: artifact.relativePath,
        codesignStatus: 'accepted',
        notarizationStatus: 'accepted',
        ticketStapled: true,
        errors: [],
      });
      expect(assertMacosArm64SigningEvidence({ artifact, evidence }).valid).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('accepts notarization evidence only when the signed macOS arm64 artifact is accepted and stapled', () => {
    const cwd = makeTmpDir();
    try {
      const bundleRoot = path.join(cwd, 'fixture-bundle');
      const dmgDir = path.join(bundleRoot, 'dmg');
      fs.mkdirSync(dmgDir, { recursive: true });
      const filename = macosDesktopArtifactFilename({
        productName: 'CodeAgora',
        version: '0.1.0-rc.6',
        arch: 'arm64',
      });
      fs.writeFileSync(path.join(dmgDir, filename), 'signed and notarized fake dmg\n');

      const artifact = locateMacosDesktopArtifact({
        cwd,
        bundleRoot,
        productName: 'CodeAgora',
        version: '0.1.0-rc.6',
        arch: 'arm64',
      });
      const evidence = {
        schemaVersion: MACOS_ARM64_SIGNING_EVIDENCE_SCHEMA_VERSION,
        artifact: {
          path: artifact.relativePath,
          sha256: artifact.sha256,
        },
        codesign: {
          status: 'accepted',
          authority: 'Developer ID Application: CodeAgora Test (TEAMID1234)',
          teamIdentifier: 'TEAMID1234',
          identifier: 'com.codeagora.desktop',
          hardenedRuntime: true,
        },
        notarization: {
          status: 'accepted',
          ticketStapled: true,
        },
      };

      expect(validateMacosArm64NotarizationEvidence({ artifact, evidence })).toMatchObject({
        valid: true,
        evidencePath: artifact.relativePath,
        codesignStatus: 'accepted',
        notarizationStatus: 'accepted',
        ticketStapled: true,
        errors: [],
      });
      expect(assertMacosArm64NotarizationEvidence({ artifact, evidence }).valid).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('rejects rejected or missing notarization evidence for the signed macOS arm64 artifact', () => {
    const cwd = makeTmpDir();
    try {
      const bundleRoot = path.join(cwd, 'fixture-bundle');
      const dmgDir = path.join(bundleRoot, 'dmg');
      fs.mkdirSync(dmgDir, { recursive: true });
      const filename = macosDesktopArtifactFilename({
        productName: 'CodeAgora',
        version: '0.1.0-rc.6',
        arch: 'arm64',
      });
      fs.writeFileSync(path.join(dmgDir, filename), 'signed but not notarized fake dmg\n');

      const artifact = locateMacosDesktopArtifact({
        cwd,
        bundleRoot,
        productName: 'CodeAgora',
        version: '0.1.0-rc.6',
        arch: 'arm64',
      });
      const baseEvidence = {
        schemaVersion: MACOS_ARM64_SIGNING_EVIDENCE_SCHEMA_VERSION,
        artifact: {
          path: artifact.relativePath,
          sha256: artifact.sha256,
        },
        codesign: {
          status: 'accepted',
          authority: ['Developer ID Application: CodeAgora Test (TEAMID1234)'],
          teamIdentifier: 'TEAMID1234',
          identifier: 'com.codeagora.desktop',
          hardenedRuntime: true,
        },
      };

      const rejected = validateMacosArm64NotarizationEvidence({
        artifact,
        evidence: {
          ...baseEvidence,
          notarization: {
            status: 'rejected',
            ticketStapled: false,
          },
        },
      });
      expect(rejected.valid).toBe(false);
      expect(rejected.errors).toContain('notarization.status must be accepted, received rejected');
      expect(rejected.errors).toContain('notarization.ticketStapled must be true');

      const missing = validateMacosArm64NotarizationEvidence({
        artifact,
        evidence: baseEvidence,
      });
      expect(missing.valid).toBe(false);
      expect(missing.errors).toContain('notarization.status must be accepted, received missing');
      expect(missing.errors).toContain('notarization.ticketStapled must be true');
      expect(() => assertMacosArm64NotarizationEvidence({
        artifact,
        evidence: baseEvidence,
      })).toThrow('Invalid macOS arm64 desktop notarization evidence');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('rejects missing or invalid signing evidence for the macOS arm64 artifact', () => {
    const cwd = makeTmpDir();
    try {
      const bundleRoot = path.join(cwd, 'fixture-bundle');
      const dmgDir = path.join(bundleRoot, 'dmg');
      fs.mkdirSync(dmgDir, { recursive: true });
      const filename = macosDesktopArtifactFilename({
        productName: 'CodeAgora',
        version: '0.1.0-rc.6',
        arch: 'arm64',
      });
      fs.writeFileSync(path.join(dmgDir, filename), 'unsigned fake dmg\n');

      const artifact = locateMacosDesktopArtifact({
        cwd,
        bundleRoot,
        productName: 'CodeAgora',
        version: '0.1.0-rc.6',
        arch: 'arm64',
      });

      const missing = validateMacosArm64SigningEvidence({ artifact, evidence: null });
      expect(missing.valid).toBe(false);
      expect(missing.errors).toContain(
        `Missing ${MACOS_ARM64_SIGNING_EVIDENCE_SCHEMA_VERSION} evidence`,
      );

      const invalidEvidence = {
        schemaVersion: MACOS_ARM64_SIGNING_EVIDENCE_SCHEMA_VERSION,
        artifact: {
          path: path.join('other', filename),
          sha256: '0'.repeat(64),
        },
        codesign: {
          status: 'rejected',
          authority: [],
          teamIdentifier: '',
          identifier: '',
          hardenedRuntime: false,
        },
        notarization: {
          status: 'missing',
          ticketStapled: false,
        },
      };
      const invalid = validateMacosArm64SigningEvidence({ artifact, evidence: invalidEvidence });

      expect(invalid.valid).toBe(false);
      expect(invalid.errors).toContain(
        `Signing evidence artifact path ${path.join('other', filename)} does not match ${artifact.relativePath}`,
      );
      expect(invalid.errors).toContain('Signing evidence artifact.sha256 does not match the located artifact');
      expect(invalid.errors).toContain('codesign.status must be accepted, received rejected');
      expect(invalid.errors).toContain('codesign.authority must include at least one signing authority');
      expect(invalid.errors).toContain('codesign.teamIdentifier is required');
      expect(invalid.errors).toContain('codesign.identifier is required');
      expect(invalid.errors).toContain('codesign.hardenedRuntime must be true');
      expect(invalid.errors).toContain('notarization.status must be accepted, received missing');
      expect(invalid.errors).toContain('notarization.ticketStapled must be true');
      expect(() => assertMacosArm64SigningEvidence({ artifact, evidence: invalidEvidence })).toThrow(
        'Invalid macOS arm64 desktop signing evidence',
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('validates Desktop RC distribution evidence for signed, notarized, stapled macOS arm64 artifacts and updater JSON', () => {
    const manifestJson = {
      version: '0.1.0-rc.7',
      pub_date: '2026-06-16T00:00:00.000Z',
      platforms: {
        [DESKTOP_RC_UPDATER_PLATFORM]: {
          url: 'https://github.com/bssm-oss/CodeAgora/releases/download/v0.1.0-rc.7/CodeAgora.app.tar.gz',
          signature: 'trusted updater signature content',
        },
      },
    };
    const evidence = {
      schemaVersion: DESKTOP_RC_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION,
      evidenceMode: 'real',
      version: '0.1.0-rc.7',
      gitTag: 'v0.1.0-rc.7',
      npmDistTag: 'rc',
      target: {
        platform: 'macos',
        arch: 'arm64',
      },
      app: {
        path: 'packages/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/CodeAgora.app',
        sha256: 'a'.repeat(64),
        bundleIdentifier: 'dev.codeagora.desktop',
        infoPlist: {
          CFBundleShortVersionString: '0.1.0-rc.7',
          CFBundleVersion: '0.1.0-rc.7',
        },
      },
      dmg: {
        path: 'packages/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/CodeAgora_0.1.0-rc.7_aarch64.dmg',
        sha256: 'b'.repeat(64),
      },
      codesign: {
        status: 'accepted',
        authority: ['Developer ID Application: CodeAgora Test (TEAMID1234)'],
        teamIdentifier: 'TEAMID1234',
        identifier: 'dev.codeagora.desktop',
        hardenedRuntime: true,
        verifyDeepStrict: true,
        spctlAssess: true,
      },
      notarization: {
        status: 'accepted',
        ticketStapled: true,
        appTicketStapled: true,
        dmgTicketStapled: true,
      },
      updater: {
        releaseLine: '0.1',
        publicKey: 'trusted public key',
        artifact: {
          path: 'packages/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/CodeAgora.app.tar.gz',
          sha256: 'c'.repeat(64),
        },
        signature: {
          path: 'packages/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/CodeAgora.app.tar.gz.sig',
          content: 'trusted updater signature content',
        },
        manifest: {
          filename: 'latest-0.1-rc.json',
          url: 'https://github.com/bssm-oss/CodeAgora/releases/download/v0.1.0-rc.7/latest-0.1-rc.json',
          json: manifestJson,
        },
      },
      githubRelease: {
        tag: 'v0.1.0-rc.7',
        prerelease: true,
        assets: [
          'CodeAgora_0.1.0-rc.7_aarch64.dmg',
          'CodeAgora.app.tar.gz',
          'CodeAgora.app.tar.gz.sig',
          'latest-0.1-rc.json',
          DESKTOP_RC_DISTRIBUTION_EVIDENCE_FILENAME,
        ],
      },
    };

    expect(validateDesktopRcUpdaterManifest(manifestJson, { version: '0.1.0-rc.7' })).toMatchObject({
      valid: true,
      releaseLine: '0.1',
      signaturePresent: true,
      errors: [],
    });
    expect(validateDesktopRcDistributionEvidence(evidence)).toMatchObject({
      valid: true,
      version: '0.1.0-rc.7',
      releaseLine: '0.1',
      updaterManifestFilename: 'latest-0.1-rc.json',
      errors: [],
    });
  });

  it('validates Desktop stable distribution evidence for signed, notarized, stapled macOS arm64 artifacts and updater JSON', () => {
    const manifestJson = {
      version: '0.1.0',
      pub_date: '2026-06-17T00:00:00.000Z',
      platforms: {
        [DESKTOP_STABLE_UPDATER_PLATFORM]: {
          url: 'https://github.com/bssm-oss/CodeAgora/releases/download/v0.1.0/CodeAgora.app.tar.gz',
          signature: 'trusted stable updater signature content',
        },
      },
    };
    const evidence = {
      schemaVersion: DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION,
      evidenceMode: 'real',
      version: '0.1.0',
      gitTag: 'v0.1.0',
      npmDistTag: 'latest',
      target: {
        platform: 'macos',
        arch: 'arm64',
      },
      app: {
        path: 'packages/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/CodeAgora.app',
        sha256: 'a'.repeat(64),
        bundleIdentifier: 'dev.codeagora.desktop',
        infoPlist: {
          CFBundleShortVersionString: '0.1.0',
          CFBundleVersion: '0.1.0',
        },
      },
      dmg: {
        path: 'packages/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/CodeAgora_0.1.0_aarch64.dmg',
        sha256: 'b'.repeat(64),
      },
      codesign: {
        status: 'accepted',
        authority: ['Developer ID Application: CodeAgora Test (TEAMID1234)'],
        teamIdentifier: 'TEAMID1234',
        identifier: 'dev.codeagora.desktop',
        hardenedRuntime: true,
        verifyDeepStrict: true,
        spctlAssess: true,
      },
      notarization: {
        status: 'accepted',
        ticketStapled: true,
        appTicketStapled: true,
        dmgTicketStapled: true,
      },
      updater: {
        releaseLine: '0.1',
        publicKey: 'trusted public key',
        artifact: {
          path: 'packages/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/CodeAgora.app.tar.gz',
          sha256: 'c'.repeat(64),
        },
        signature: {
          path: 'packages/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/CodeAgora.app.tar.gz.sig',
          content: 'trusted stable updater signature content',
        },
        manifest: {
          filename: 'latest-0.1.json',
          url: 'https://github.com/bssm-oss/CodeAgora/releases/download/v0.1.0/latest-0.1.json',
          json: manifestJson,
        },
      },
      githubRelease: {
        tag: 'v0.1.0',
        prerelease: false,
        assets: [
          'CodeAgora_0.1.0_aarch64.dmg',
          'CodeAgora.app.tar.gz',
          'CodeAgora.app.tar.gz.sig',
          'latest-0.1.json',
          DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_FILENAME,
        ],
      },
    };

    expect(validateDesktopStableUpdaterManifest(manifestJson, { version: '0.1.0' })).toMatchObject({
      valid: true,
      releaseLine: '0.1',
      signaturePresent: true,
      errors: [],
    });
    expect(validateDesktopStableDistributionEvidence(evidence)).toMatchObject({
      valid: true,
      version: '0.1.0',
      releaseLine: '0.1',
      updaterManifestFilename: 'latest-0.1.json',
      errors: [],
    });
  });

  it('validates v0.1.0 Desktop unsigned preview DMG evidence without signing or updater claims', () => {
    const evidence = {
      schemaVersion: DESKTOP_UNSIGNED_DMG_EVIDENCE_SCHEMA_VERSION,
      evidenceMode: 'real',
      version: '0.1.0',
      gitTag: 'v0.1.0',
      npmDistTag: 'latest',
      target: {
        platform: 'macos',
        arch: 'arm64',
      },
      app: {
        path: 'packages/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/CodeAgora.app',
        sha256: 'a'.repeat(64),
        bundleIdentifier: 'dev.codeagora.desktop',
        infoPlist: {
          CFBundleShortVersionString: '0.1.0',
          CFBundleVersion: '0.1.0',
        },
      },
      dmg: {
        path: 'packages/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/CodeAgora_0.1.0_aarch64.dmg',
        sha256: 'b'.repeat(64),
      },
      distributionPolicy: {
        signed: false,
        notarized: false,
        updaterEnabled: false,
        gatekeeperWarning: true,
        supportTier: 'preview',
      },
      githubRelease: {
        tag: 'v0.1.0',
        prerelease: false,
        assets: [
          'CodeAgora_0.1.0_aarch64.dmg',
          DESKTOP_UNSIGNED_DMG_EVIDENCE_FILENAME,
        ],
      },
    };

    expect(validateDesktopUnsignedDmgEvidence(evidence)).toMatchObject({
      valid: true,
      version: '0.1.0',
      releaseLine: '0.1',
      errors: [],
    });

    const invalid = validateDesktopUnsignedDmgEvidence({
      ...evidence,
      distributionPolicy: {
        signed: true,
        notarized: true,
        updaterEnabled: true,
        gatekeeperWarning: false,
        supportTier: 'stable',
      },
      codesign: { status: 'accepted' },
      updater: { publicKey: 'unexpected' },
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toEqual(expect.arrayContaining([
      'distributionPolicy.signed must be false for the v0.1.0 unsigned DMG path',
      'distributionPolicy.notarized must be false for the v0.1.0 unsigned DMG path',
      'distributionPolicy.updaterEnabled must be false for the v0.1.0 unsigned DMG path',
      'distributionPolicy.gatekeeperWarning must be true for unsigned macOS DMGs',
      'distributionPolicy.supportTier must be preview',
      'unsigned DMG evidence must not include codesign, notarization, or updater claims',
    ]));
  });

  it('rejects unsafe Desktop RC distribution evidence failure modes', () => {
    const invalid = validateDesktopRcDistributionEvidence({
      schemaVersion: DESKTOP_RC_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION,
      version: '0.1.0-rc7',
      gitTag: 'v0.1.0-rc7',
      npmDistTag: 'latest',
      target: { platform: 'macos', arch: 'x64' },
      app: {
        path: 'CodeAgora.app',
        sha256: 'not-a-hash',
        bundleIdentifier: 'dev.codeagora.desktop',
        infoPlist: {
          CFBundleShortVersionString: '0.1.0-rc7',
          CFBundleVersion: '0.1.0-rc7',
        },
      },
      dmg: {
        path: 'CodeAgora.dmg',
        sha256: '0'.repeat(64),
      },
      codesign: {
        status: 'accepted',
        authority: ['Ad Hoc'],
        teamIdentifier: '',
        identifier: 'dev.codeagora.desktop',
        hardenedRuntime: true,
        verifyDeepStrict: false,
        spctlAssess: false,
      },
      notarization: {
        status: 'missing',
        ticketStapled: false,
        appTicketStapled: false,
        dmgTicketStapled: false,
      },
      updater: {
        releaseLine: '0.2',
        publicKey: '',
        artifact: { path: 'CodeAgora.dmg', sha256: '0'.repeat(64) },
        signature: { path: '', content: '' },
        manifest: {
          filename: 'latest-0.1-rc.json',
          url: 'https://github.com/bssm-oss/CodeAgora/releases/download/v0.1.0-rc.7/latest-0.1-rc.json',
          json: {
            version: '0.2.0-rc.1',
            pub_date: '2026-06-16T00:00:00.000Z',
            platforms: {
              [DESKTOP_RC_UPDATER_PLATFORM]: {
                url: 'https://github.com/bssm-oss/CodeAgora/releases/download/v0.2.0-rc.1/CodeAgora_0.2.0-rc.1_aarch64.dmg',
                signature: '',
              },
            },
          },
        },
      },
      githubRelease: {
        prerelease: false,
        assets: [],
      },
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('X.Y.Z-rc.N'),
      'target must be macOS arm64 only for Desktop RC distribution',
      'app.sha256 must be a SHA-256 hex digest',
      'codesign.authority must include a Developer ID Application signing authority',
      'ad-hoc signatures are not valid for Desktop RC distribution',
      'codesign.verifyDeepStrict must be true',
      'codesign.spctlAssess must be true',
      'notarization.status must be accepted, received missing',
      'notarization.ticketStapled must be true',
      'notarization.appTicketStapled must be true',
      'notarization.dmgTicketStapled must be true',
      'updater.publicKey is required',
      'updater.artifact.path must not be a DMG',
      'updater.signature.path is required',
      'updater.signature.content must contain the generated .sig file content',
    ]));
  });

  it('rejects fixture artifact metadata that is not macOS arm64', () => {
    const cwd = makeTmpDir();
    try {
      const bundleRoot = path.join(cwd, 'fixture-bundle');
      const dmgDir = path.join(bundleRoot, 'dmg');
      fs.mkdirSync(dmgDir, { recursive: true });
      const filename = macosDesktopArtifactFilename({
        productName: 'CodeAgora',
        version: '0.1.0-rc.6',
        arch: 'x64',
      });
      fs.writeFileSync(path.join(dmgDir, filename), 'fake dmg\n');

      const artifact = locateMacosDesktopArtifact({
        cwd,
        bundleRoot,
        productName: 'CodeAgora',
        version: '0.1.0-rc.6',
        arch: 'x64',
      });
      const validation = validateMacosArm64ArtifactMetadata(artifact);

      expect(artifact).toMatchObject({
        present: true,
        platform: 'macos',
        arch: 'x64',
        tauriArch: 'x64',
        artifactType: 'dmg',
        expectedFilename: filename,
      });
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Expected architecture arm64, received x64');
      expect(validation.errors).toContain('Expected Tauri architecture aarch64, received x64');
      expect(validation.errors).toContain(
        `Expected macOS arm64 artifact filename suffix _aarch64.dmg, received ${filename}`,
      );
      expect(() => assertMacosArm64ArtifactMetadata(artifact)).toThrow(
        'Invalid macOS arm64 desktop artifact metadata',
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('reports a missing expected macOS release artifact with the expected path', () => {
    const cwd = makeTmpDir();
    try {
      const bundleRoot = path.join(cwd, 'fixture-bundle');
      fs.mkdirSync(path.join(bundleRoot, 'dmg'), { recursive: true });

      const artifact = locateMacosDesktopArtifact({
        cwd,
        bundleRoot,
        productName: 'CodeAgora',
        version: '0.1.0-rc.6',
        arch: 'arm64',
      });

      expect(artifact.present).toBe(false);
      expect(artifact.error).toBe(
        `Expected macOS desktop release artifact is missing: ${path.join('fixture-bundle', 'dmg', 'CodeAgora_0.1.0-rc.6_aarch64.dmg')}`,
      );
      expect(() => assertMacosDesktopArtifact({
        cwd,
        bundleRoot,
        productName: 'CodeAgora',
        version: '0.1.0-rc.6',
        arch: 'arm64',
      })).toThrow('Expected macOS desktop release artifact is missing');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
