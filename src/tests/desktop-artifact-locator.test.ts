import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  MACOS_ARM64_SIGNING_EVIDENCE_SCHEMA_VERSION,
  assertMacosArm64NotarizationEvidence,
  assertMacosArm64SigningEvidence,
  assertMacosArm64ArtifactMetadata,
  assertMacosDesktopArtifact,
  locateMacosDesktopArtifact,
  macosDesktopArtifactFilename,
  tauriMacosArchSuffix,
  validateMacosArm64NotarizationEvidence,
  validateMacosArm64SigningEvidence,
  validateMacosArm64ArtifactMetadata,
} from '../../packages/desktop/scripts/desktop-artifacts.mjs';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-desktop-artifacts-'));
}

describe('macOS desktop artifact locator', () => {
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
