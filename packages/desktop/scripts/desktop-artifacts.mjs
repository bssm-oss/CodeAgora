import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MACOS_DESKTOP_ARTIFACT_TYPE = 'dmg';
export const MACOS_DESKTOP_PLATFORM = 'macos';
export const MACOS_ARM64_ARCH = 'arm64';
export const MACOS_ARM64_TAURI_ARCH = 'aarch64';
export const MACOS_ARM64_SIGNING_EVIDENCE_SCHEMA_VERSION = 'codeagora.desktop-macos-arm64-signing-evidence.v1';
export const MACOS_ARM64_SIGNING_EVIDENCE_FILENAME = 'desktop-macos-arm64-signing-evidence.json';

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function tauriMacosArchSuffix(arch = os.arch()) {
  if (arch === 'arm64') return 'aarch64';
  if (arch === 'x64') return 'x64';
  return arch;
}

export function macosDesktopArtifactFilename(options = {}) {
  const productName = options.productName ?? 'CodeAgora';
  const version = options.version ?? '0.0.0';
  const arch = tauriMacosArchSuffix(options.arch);
  return `${productName.replace(/\s+/g, '_')}_${version}_${arch}.${MACOS_DESKTOP_ARTIFACT_TYPE}`;
}

function macosDesktopArtifactMetadata(options = {}) {
  const arch = options.arch ?? os.arch();
  return {
    platform: MACOS_DESKTOP_PLATFORM,
    arch,
    tauriArch: tauriMacosArchSuffix(arch),
    artifactType: MACOS_DESKTOP_ARTIFACT_TYPE,
  };
}

export function validateMacosArm64ArtifactMetadata(artifact) {
  const errors = [];
  const metadata = artifact && typeof artifact === 'object' ? artifact : {};
  const expectedFilename = metadata.expectedFilename ?? (
    typeof metadata.path === 'string' ? path.basename(metadata.path) : null
  );

  if (metadata.platform !== MACOS_DESKTOP_PLATFORM) {
    errors.push(`Expected platform ${MACOS_DESKTOP_PLATFORM}, received ${String(metadata.platform ?? 'missing')}`);
  }

  if (metadata.arch !== MACOS_ARM64_ARCH) {
    errors.push(`Expected architecture ${MACOS_ARM64_ARCH}, received ${String(metadata.arch ?? 'missing')}`);
  }

  if (metadata.tauriArch !== MACOS_ARM64_TAURI_ARCH) {
    errors.push(`Expected Tauri architecture ${MACOS_ARM64_TAURI_ARCH}, received ${String(metadata.tauriArch ?? 'missing')}`);
  }

  if (metadata.artifactType !== MACOS_DESKTOP_ARTIFACT_TYPE) {
    errors.push(`Expected artifact type ${MACOS_DESKTOP_ARTIFACT_TYPE}, received ${String(metadata.artifactType ?? 'missing')}`);
  }

  if (expectedFilename && !expectedFilename.endsWith(`_${MACOS_ARM64_TAURI_ARCH}.${MACOS_DESKTOP_ARTIFACT_TYPE}`)) {
    errors.push(`Expected macOS arm64 artifact filename suffix _${MACOS_ARM64_TAURI_ARCH}.${MACOS_DESKTOP_ARTIFACT_TYPE}, received ${expectedFilename}`);
  }

  return {
    valid: errors.length === 0,
    platform: metadata.platform ?? null,
    arch: metadata.arch ?? null,
    tauriArch: metadata.tauriArch ?? null,
    artifactType: metadata.artifactType ?? null,
    expectedFilename,
    errors,
  };
}

export function assertMacosArm64ArtifactMetadata(artifact) {
  const result = validateMacosArm64ArtifactMetadata(artifact);
  if (!result.valid) {
    throw new Error(`Invalid macOS arm64 desktop artifact metadata: ${result.errors.join('; ')}`);
  }
  return result;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasSigningAuthority(value) {
  if (Array.isArray(value)) {
    return value.some((entry) => isNonEmptyString(entry));
  }
  return isNonEmptyString(value);
}

function expectedArtifactEvidencePath(artifact) {
  return artifact?.relativePath ?? artifact?.path ?? null;
}

function validateMacosArm64SigningEvidenceEnvelope({ artifact, evidence } = {}) {
  const errors = [];
  const artifactValidation = validateMacosArm64ArtifactMetadata(artifact);
  errors.push(...artifactValidation.errors);

  if (artifact?.present !== true) {
    errors.push('Expected present macOS arm64 desktop artifact before validating signing evidence');
  }

  if (!evidence || typeof evidence !== 'object') {
    errors.push(`Missing ${MACOS_ARM64_SIGNING_EVIDENCE_SCHEMA_VERSION} evidence`);
    return {
      schemaVersion: MACOS_ARM64_SIGNING_EVIDENCE_SCHEMA_VERSION,
      missing: true,
      valid: false,
      artifact: artifactValidation,
      evidencePath: expectedArtifactEvidencePath(artifact),
      errors,
    };
  }

  if (evidence.schemaVersion !== MACOS_ARM64_SIGNING_EVIDENCE_SCHEMA_VERSION) {
    errors.push(
      `Expected signing evidence schema ${MACOS_ARM64_SIGNING_EVIDENCE_SCHEMA_VERSION}, received ${String(evidence.schemaVersion ?? 'missing')}`,
    );
  }

  const expectedPath = expectedArtifactEvidencePath(artifact);
  const evidenceArtifact = evidence.artifact ?? {};
  const evidencePath = evidenceArtifact.path ?? evidenceArtifact.relativePath ?? null;
  if (!isNonEmptyString(evidencePath)) {
    errors.push('Signing evidence must include artifact.path');
  } else if (expectedPath && evidencePath !== expectedPath) {
    errors.push(`Signing evidence artifact path ${evidencePath} does not match ${expectedPath}`);
  }

  if (isNonEmptyString(artifact?.sha256)) {
    if (evidenceArtifact.sha256 !== artifact.sha256) {
      errors.push('Signing evidence artifact.sha256 does not match the located artifact');
    }
  } else if (!isNonEmptyString(evidenceArtifact.sha256)) {
    errors.push('Signing evidence must include artifact.sha256');
  }

  return {
    missing: false,
    errors,
    artifactValidation,
    evidenceArtifact,
    evidencePath,
  };
}

function collectCodesignEvidenceErrors(codesign = {}) {
  const errors = [];
  if (codesign.status !== 'accepted') {
    errors.push(`codesign.status must be accepted, received ${String(codesign.status ?? 'missing')}`);
  }
  if (!hasSigningAuthority(codesign.authority)) {
    errors.push('codesign.authority must include at least one signing authority');
  }
  if (!isNonEmptyString(codesign.teamIdentifier)) {
    errors.push('codesign.teamIdentifier is required');
  }
  if (!isNonEmptyString(codesign.identifier)) {
    errors.push('codesign.identifier is required');
  }
  if (codesign.hardenedRuntime !== true) {
    errors.push('codesign.hardenedRuntime must be true');
  }
  return errors;
}

function collectNotarizationEvidenceErrors(notarization = {}) {
  const errors = [];
  if (notarization.status !== 'accepted') {
    errors.push(`notarization.status must be accepted, received ${String(notarization.status ?? 'missing')}`);
  }
  if (notarization.ticketStapled !== true) {
    errors.push('notarization.ticketStapled must be true');
  }
  return errors;
}

export function validateMacosArm64NotarizationEvidence({ artifact, evidence } = {}) {
  const envelope = validateMacosArm64SigningEvidenceEnvelope({ artifact, evidence });
  if (envelope.missing) return envelope;

  const codesign = evidence.codesign ?? {};
  const notarization = evidence.notarization ?? {};
  const errors = [
    ...envelope.errors,
    ...collectCodesignEvidenceErrors(codesign),
    ...collectNotarizationEvidenceErrors(notarization),
  ];

  return {
    schemaVersion: MACOS_ARM64_SIGNING_EVIDENCE_SCHEMA_VERSION,
    valid: errors.length === 0,
    artifact: envelope.artifactValidation,
    evidencePath: envelope.evidencePath,
    codesignStatus: codesign.status ?? null,
    notarizationStatus: notarization.status ?? null,
    ticketStapled: notarization.ticketStapled ?? null,
    errors,
  };
}

export function assertMacosArm64NotarizationEvidence(params = {}) {
  const result = validateMacosArm64NotarizationEvidence(params);
  if (!result.valid) {
    throw new Error(`Invalid macOS arm64 desktop notarization evidence: ${result.errors.join('; ')}`);
  }
  return result;
}

export function validateMacosArm64SigningEvidence({ artifact, evidence } = {}) {
  const envelope = validateMacosArm64SigningEvidenceEnvelope({ artifact, evidence });
  if (envelope.missing) return envelope;

  const codesign = evidence.codesign ?? {};
  const notarization = evidence.notarization ?? {};
  const errors = [
    ...envelope.errors,
    ...collectCodesignEvidenceErrors(codesign),
    ...collectNotarizationEvidenceErrors(notarization),
  ];

  return {
    schemaVersion: MACOS_ARM64_SIGNING_EVIDENCE_SCHEMA_VERSION,
    valid: errors.length === 0,
    artifact: envelope.artifactValidation,
    evidencePath: envelope.evidencePath,
    codesignStatus: codesign.status ?? null,
    notarizationStatus: notarization.status ?? null,
    ticketStapled: notarization.ticketStapled ?? null,
    errors,
  };
}

export function assertMacosArm64SigningEvidence(params = {}) {
  const result = validateMacosArm64SigningEvidence(params);
  if (!result.valid) {
    throw new Error(`Invalid macOS arm64 desktop signing evidence: ${result.errors.join('; ')}`);
  }
  return result;
}

export function readMacosArm64SigningEvidence(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const evidenceRoot = path.resolve(cwd, options.evidenceRoot ?? path.join('.sisyphus', 'evidence'));
  const evidencePath = path.resolve(
    cwd,
    options.evidencePath ?? path.join(evidenceRoot, MACOS_ARM64_SIGNING_EVIDENCE_FILENAME),
  );

  if (!fs.existsSync(evidencePath)) {
    return {
      present: false,
      path: evidencePath,
      relativePath: path.relative(cwd, evidencePath),
      evidence: null,
    };
  }

  return {
    present: true,
    path: evidencePath,
    relativePath: path.relative(cwd, evidencePath),
    evidence: JSON.parse(fs.readFileSync(evidencePath, 'utf8')),
  };
}

export function locateMacosDesktopArtifact(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const bundleRoot = path.resolve(
    cwd,
    options.bundleRoot ?? path.join('packages', 'desktop', 'src-tauri', 'target', 'release', 'bundle'),
  );
  const expectedFilename = macosDesktopArtifactFilename(options);
  const artifactPath = path.join(bundleRoot, MACOS_DESKTOP_ARTIFACT_TYPE, expectedFilename);
  const relativePath = path.relative(cwd, artifactPath);

  if (!fs.existsSync(artifactPath)) {
    return {
      ...macosDesktopArtifactMetadata(options),
      present: false,
      expectedFilename,
      path: artifactPath,
      relativePath,
      error: `Expected macOS desktop release artifact is missing: ${relativePath}`,
    };
  }

  const stat = fs.statSync(artifactPath);
  if (!stat.isFile()) {
    return {
      ...macosDesktopArtifactMetadata(options),
      present: false,
      expectedFilename,
      path: artifactPath,
      relativePath,
      error: `Expected macOS desktop release artifact is not a file: ${relativePath}`,
    };
  }

  return {
    ...macosDesktopArtifactMetadata(options),
    present: true,
    expectedFilename,
    path: artifactPath,
    relativePath,
    size: stat.size,
    sha256: sha256(artifactPath),
  };
}

export function assertMacosDesktopArtifact(options = {}) {
  const artifact = locateMacosDesktopArtifact(options);
  if (!artifact.present) {
    throw new Error(artifact.error);
  }
  return artifact;
}
