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
export const DESKTOP_RC_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION = 'codeagora.desktop-rc-distribution-evidence.v1';
export const DESKTOP_RC_DISTRIBUTION_EVIDENCE_FILENAME = 'desktop-rc-distribution-evidence.json';
export const DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION = 'codeagora.desktop-stable-distribution-evidence.v1';
export const DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_FILENAME = 'desktop-stable-distribution-evidence.json';
export const DESKTOP_UNSIGNED_DMG_EVIDENCE_SCHEMA_VERSION = 'codeagora.desktop-unsigned-dmg-evidence.v1';
export const DESKTOP_UNSIGNED_DMG_EVIDENCE_FILENAME = 'desktop-unsigned-dmg-evidence.json';
export const DESKTOP_RC_UPDATER_PLATFORM = 'darwin-aarch64';
export const DESKTOP_STABLE_UPDATER_PLATFORM = DESKTOP_RC_UPDATER_PLATFORM;

const RC_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)-rc\.(\d+)$/;
const RC_TAG_PATTERN = /^v(\d+\.\d+\.\d+-rc\.\d+)$/;
const STABLE_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const STABLE_TAG_PATTERN = /^v(\d+\.\d+\.\d+)$/;
const SECRET_VALUE_PATTERN = /(?:api[_-]?key|token|secret|password|private[_-]?key|-----BEGIN|sk-[a-z0-9_-]+)/i;

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function parseDesktopRcVersion(version) {
  const match = typeof version === 'string' ? RC_VERSION_PATTERN.exec(version) : null;
  if (!match) {
    throw new Error(
      `Desktop RC version must be npm semver prerelease X.Y.Z-rc.N without build metadata, received ${String(version ?? 'missing')}`,
    );
  }
  return {
    version,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    rc: Number(match[4]),
    releaseLine: `${match[1]}.${match[2]}`,
    gitTag: `v${version}`,
    npmDistTag: 'rc',
    updaterManifestFilename: `latest-${match[1]}.${match[2]}-rc.json`,
  };
}

export function parseDesktopRcTag(tag) {
  const match = typeof tag === 'string' ? RC_TAG_PATTERN.exec(tag) : null;
  if (!match) {
    throw new Error(`Desktop RC git tag must be vX.Y.Z-rc.N, received ${String(tag ?? 'missing')}`);
  }
  return parseDesktopRcVersion(match[1]);
}

export function desktopRcUpdaterManifestFilename(versionOrTag) {
  const parsed = String(versionOrTag).startsWith('v')
    ? parseDesktopRcTag(versionOrTag)
    : parseDesktopRcVersion(versionOrTag);
  return parsed.updaterManifestFilename;
}

export function parseDesktopStableVersion(version) {
  const match = typeof version === 'string' ? STABLE_VERSION_PATTERN.exec(version) : null;
  if (!match) {
    throw new Error(
      `Desktop stable version must be npm semver X.Y.Z without prerelease or build metadata, received ${String(version ?? 'missing')}`,
    );
  }
  return {
    version,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    releaseLine: `${match[1]}.${match[2]}`,
    gitTag: `v${version}`,
    npmDistTag: 'latest',
    updaterManifestFilename: `latest-${match[1]}.${match[2]}.json`,
  };
}

export function parseDesktopStableTag(tag) {
  const match = typeof tag === 'string' ? STABLE_TAG_PATTERN.exec(tag) : null;
  if (!match) {
    throw new Error(`Desktop stable git tag must be vX.Y.Z, received ${String(tag ?? 'missing')}`);
  }
  return parseDesktopStableVersion(match[1]);
}

export function desktopStableUpdaterManifestFilename(versionOrTag) {
  const parsed = String(versionOrTag).startsWith('v')
    ? parseDesktopStableTag(versionOrTag)
    : parseDesktopStableVersion(versionOrTag);
  return parsed.updaterManifestFilename;
}

function validUrl(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new globalThis.URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
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

function releaseLineFromVersion(version) {
  try {
    return parseDesktopRcVersion(version).releaseLine;
  } catch {
    return null;
  }
}

function collectSecretLeaks(value, pathLabel = 'evidence') {
  const leaks = [];
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERN.test(value)) {
      leaks.push(pathLabel);
    }
    return leaks;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => leaks.push(...collectSecretLeaks(entry, `${pathLabel}[${index}]`)));
    return leaks;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      leaks.push(...collectSecretLeaks(entry, `${pathLabel}.${key}`));
    }
  }
  return leaks;
}

function collectRcCodesignDistributionErrors(codesign = {}) {
  const errors = collectCodesignEvidenceErrors(codesign);
  const authority = Array.isArray(codesign.authority) ? codesign.authority.join('\n') : String(codesign.authority ?? '');
  if (!/Developer ID Application:/i.test(authority)) {
    errors.push('codesign.authority must include a Developer ID Application signing authority');
  }
  if (/\bAd Hoc\b|adhoc|^-$/i.test(authority)) {
    errors.push('ad-hoc signatures are not valid for Desktop RC distribution');
  }
  if (codesign.verifyDeepStrict !== true) {
    errors.push('codesign.verifyDeepStrict must be true');
  }
  if (codesign.spctlAssess !== true) {
    errors.push('codesign.spctlAssess must be true');
  }
  return errors;
}

function collectRcNotarizationDistributionErrors(notarization = {}) {
  const errors = collectNotarizationEvidenceErrors(notarization);
  if (notarization.appTicketStapled !== true) {
    errors.push('notarization.appTicketStapled must be true');
  }
  if (notarization.dmgTicketStapled !== true) {
    errors.push('notarization.dmgTicketStapled must be true');
  }
  return errors;
}

function collectHashErrors(record, label) {
  const errors = [];
  if (!isNonEmptyString(record?.path)) {
    errors.push(`${label}.path is required`);
  }
  if (!/^[a-f0-9]{64}$/i.test(String(record?.sha256 ?? ''))) {
    errors.push(`${label}.sha256 must be a SHA-256 hex digest`);
  }
  return errors;
}

export function validateDesktopRcUpdaterManifest(manifest = {}, options = {}) {
  const errors = [];
  const expected = parseDesktopRcVersion(options.version ?? manifest.version);
  const platforms = manifest.platforms ?? {};
  const platformEntry = platforms[DESKTOP_RC_UPDATER_PLATFORM] ?? {};
  const version = typeof manifest.version === 'string' && manifest.version.startsWith('v')
    ? manifest.version.slice(1)
    : manifest.version;

  if (version !== expected.version) {
    errors.push(`updater manifest version must be ${expected.version}, received ${String(manifest.version ?? 'missing')}`);
  }
  if (releaseLineFromVersion(version) !== expected.releaseLine) {
    errors.push(`updater manifest version must stay on ${expected.releaseLine}.x RC line`);
  }
  if (!validUrl(platformEntry.url)) {
    errors.push(`${DESKTOP_RC_UPDATER_PLATFORM}.url must be an https URL`);
  }
  if (!isNonEmptyString(platformEntry.signature)) {
    errors.push(`${DESKTOP_RC_UPDATER_PLATFORM}.signature must contain the .sig file content`);
  }
  if (!isNonEmptyString(manifest.pub_date)) {
    errors.push('updater manifest pub_date is required');
  }
  if (manifest.platforms && Object.keys(platforms).some((platform) => platform !== DESKTOP_RC_UPDATER_PLATFORM)) {
    errors.push(`updater manifest may only include ${DESKTOP_RC_UPDATER_PLATFORM} for this RC pipeline`);
  }

  return {
    valid: errors.length === 0,
    version: version ?? null,
    releaseLine: releaseLineFromVersion(version),
    platform: DESKTOP_RC_UPDATER_PLATFORM,
    url: platformEntry.url ?? null,
    signaturePresent: isNonEmptyString(platformEntry.signature),
    errors,
  };
}

export function validateDesktopRcDistributionEvidence(evidence = {}, options = {}) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object') {
    return {
      schemaVersion: DESKTOP_RC_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION,
      valid: false,
      errors: [`Missing ${DESKTOP_RC_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION} evidence`],
    };
  }
  if (evidence.schemaVersion !== DESKTOP_RC_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION) {
    errors.push(
      `Expected distribution evidence schema ${DESKTOP_RC_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION}, received ${String(evidence.schemaVersion ?? 'missing')}`,
    );
  }

  let expected;
  try {
    expected = parseDesktopRcVersion(options.version ?? evidence.version);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    expected = null;
  }
  if (expected && evidence.gitTag !== expected.gitTag) {
    errors.push(`gitTag must be ${expected.gitTag}, received ${String(evidence.gitTag ?? 'missing')}`);
  }
  if (expected && evidence.npmDistTag !== 'rc') {
    errors.push(`npmDistTag must be rc for ${expected.version}`);
  }
  if (expected && evidence.githubRelease?.prerelease !== true) {
    errors.push('githubRelease.prerelease must be true');
  }
  if (evidence.target?.platform !== MACOS_DESKTOP_PLATFORM || evidence.target?.arch !== MACOS_ARM64_ARCH) {
    errors.push('target must be macOS arm64 only for Desktop RC distribution');
  }

  errors.push(...collectHashErrors(evidence.app, 'app'));
  errors.push(...collectHashErrors(evidence.dmg, 'dmg'));
  if (!isNonEmptyString(evidence.app?.bundleIdentifier)) {
    errors.push('app.bundleIdentifier is required');
  }
  if (!isNonEmptyString(evidence.app?.infoPlist?.CFBundleShortVersionString)) {
    errors.push('app.infoPlist.CFBundleShortVersionString is required');
  }
  if (!isNonEmptyString(evidence.app?.infoPlist?.CFBundleVersion)) {
    errors.push('app.infoPlist.CFBundleVersion is required');
  }
  if (expected && evidence.app?.infoPlist?.CFBundleShortVersionString !== expected.version) {
    errors.push('app Info.plist CFBundleShortVersionString must match the RC semver version');
  }
  if (expected && evidence.app?.infoPlist?.CFBundleVersion !== expected.version) {
    errors.push('app Info.plist CFBundleVersion must match the RC semver version');
  }

  errors.push(...collectRcCodesignDistributionErrors(evidence.codesign));
  errors.push(...collectRcNotarizationDistributionErrors(evidence.notarization));

  const updater = evidence.updater ?? {};
  if (!isNonEmptyString(updater.publicKey)) {
    errors.push('updater.publicKey is required');
  }
  if (!isNonEmptyString(updater.artifact?.path)) {
    errors.push('updater.artifact.path is required');
  }
  if (isNonEmptyString(updater.artifact?.path) && path.basename(updater.artifact.path) === path.basename(evidence.dmg?.path ?? '')) {
    errors.push('updater.artifact.path must reference the Tauri updater app artifact, not the DMG');
  }
  if (isNonEmptyString(updater.artifact?.path) && updater.artifact.path.endsWith('.dmg')) {
    errors.push('updater.artifact.path must not be a DMG');
  }
  if (!/^[a-f0-9]{64}$/i.test(String(updater.artifact?.sha256 ?? ''))) {
    errors.push('updater.artifact.sha256 must be a SHA-256 hex digest');
  }
  if (!isNonEmptyString(updater.signature?.path)) {
    errors.push('updater.signature.path is required');
  }
  if (!isNonEmptyString(updater.signature?.content)) {
    errors.push('updater.signature.content must contain the generated .sig file content');
  }
  if (expected && updater.manifest?.filename !== expected.updaterManifestFilename) {
    errors.push(`updater.manifest.filename must be ${expected.updaterManifestFilename}`);
  }
  if (expected && updater.releaseLine !== expected.releaseLine) {
    errors.push(`updater.releaseLine must be ${expected.releaseLine}`);
  }
  if (!validUrl(updater.manifest?.url)) {
    errors.push('updater.manifest.url must be an https URL');
  }
  if (updater.manifest?.json) {
    try {
      const manifestValidation = validateDesktopRcUpdaterManifest(updater.manifest.json, {
        version: expected?.version ?? evidence.version,
      });
      errors.push(...manifestValidation.errors);
      const manifestArtifactUrl = manifestValidation.url ? new globalThis.URL(manifestValidation.url) : null;
      if (
        manifestArtifactUrl
        && isNonEmptyString(updater.artifact?.path)
        && path.basename(manifestArtifactUrl.pathname) !== path.basename(updater.artifact.path)
      ) {
        errors.push('updater manifest URL must point to the recorded updater artifact');
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  } else {
    errors.push('updater.manifest.json is required');
  }

  const releaseAssets = Array.isArray(evidence.githubRelease?.assets)
    ? evidence.githubRelease.assets
    : [];
  for (const requiredAsset of [
    evidence.dmg?.path,
    updater.artifact?.path,
    updater.signature?.path,
    updater.manifest?.filename,
    DESKTOP_RC_DISTRIBUTION_EVIDENCE_FILENAME,
  ].filter(Boolean)) {
    const basename = path.basename(requiredAsset);
    if (!releaseAssets.some((asset) => asset === basename || asset?.name === basename)) {
      errors.push(`githubRelease.assets must include ${basename}`);
    }
  }

  const secretLeaks = collectSecretLeaks(evidence);
  if (secretLeaks.length > 0) {
    errors.push(`distribution evidence contains secret-looking values at: ${secretLeaks.join(', ')}`);
  }

  return {
    schemaVersion: DESKTOP_RC_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION,
    valid: errors.length === 0,
    version: evidence.version ?? null,
    gitTag: evidence.gitTag ?? null,
    releaseLine: expected?.releaseLine ?? null,
    updaterManifestFilename: expected?.updaterManifestFilename ?? null,
    errors,
  };
}

function releaseLineFromStableVersion(version) {
  try {
    return parseDesktopStableVersion(version).releaseLine;
  } catch {
    return null;
  }
}

function collectStableCodesignDistributionErrors(codesign = {}) {
  const errors = collectCodesignEvidenceErrors(codesign);
  const authority = Array.isArray(codesign.authority) ? codesign.authority.join('\n') : String(codesign.authority ?? '');
  if (!/Developer ID Application:/i.test(authority)) {
    errors.push('codesign.authority must include a Developer ID Application signing authority');
  }
  if (/\bAd Hoc\b|adhoc|^-$/i.test(authority)) {
    errors.push('ad-hoc signatures are not valid for Desktop stable distribution');
  }
  if (codesign.verifyDeepStrict !== true) {
    errors.push('codesign.verifyDeepStrict must be true');
  }
  if (codesign.spctlAssess !== true) {
    errors.push('codesign.spctlAssess must be true');
  }
  return errors;
}

function collectStableNotarizationDistributionErrors(notarization = {}) {
  const errors = collectNotarizationEvidenceErrors(notarization);
  if (notarization.appTicketStapled !== true) {
    errors.push('notarization.appTicketStapled must be true');
  }
  if (notarization.dmgTicketStapled !== true) {
    errors.push('notarization.dmgTicketStapled must be true');
  }
  return errors;
}

export function validateDesktopStableUpdaterManifest(manifest = {}, options = {}) {
  const errors = [];
  const expected = parseDesktopStableVersion(options.version ?? manifest.version);
  const platforms = manifest.platforms ?? {};
  const platformEntry = platforms[DESKTOP_STABLE_UPDATER_PLATFORM] ?? {};
  const version = typeof manifest.version === 'string' && manifest.version.startsWith('v')
    ? manifest.version.slice(1)
    : manifest.version;

  if (version !== expected.version) {
    errors.push(`updater manifest version must be ${expected.version}, received ${String(manifest.version ?? 'missing')}`);
  }
  if (releaseLineFromStableVersion(version) !== expected.releaseLine) {
    errors.push(`updater manifest version must stay on ${expected.releaseLine}.x stable line`);
  }
  if (!validUrl(platformEntry.url)) {
    errors.push(`${DESKTOP_STABLE_UPDATER_PLATFORM}.url must be an https URL`);
  }
  if (!isNonEmptyString(platformEntry.signature)) {
    errors.push(`${DESKTOP_STABLE_UPDATER_PLATFORM}.signature must contain the .sig file content`);
  }
  if (!isNonEmptyString(manifest.pub_date)) {
    errors.push('updater manifest pub_date is required');
  }
  if (manifest.platforms && Object.keys(platforms).some((platform) => platform !== DESKTOP_STABLE_UPDATER_PLATFORM)) {
    errors.push(`updater manifest may only include ${DESKTOP_STABLE_UPDATER_PLATFORM} for this stable pipeline`);
  }

  return {
    valid: errors.length === 0,
    version: version ?? null,
    releaseLine: releaseLineFromStableVersion(version),
    platform: DESKTOP_STABLE_UPDATER_PLATFORM,
    url: platformEntry.url ?? null,
    signaturePresent: isNonEmptyString(platformEntry.signature),
    errors,
  };
}

export function validateDesktopStableDistributionEvidence(evidence = {}, options = {}) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object') {
    return {
      schemaVersion: DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION,
      valid: false,
      errors: [`Missing ${DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION} evidence`],
    };
  }
  if (evidence.schemaVersion !== DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION) {
    errors.push(
      `Expected distribution evidence schema ${DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION}, received ${String(evidence.schemaVersion ?? 'missing')}`,
    );
  }

  let expected;
  try {
    expected = parseDesktopStableVersion(options.version ?? evidence.version);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    expected = null;
  }
  if (expected && evidence.gitTag !== expected.gitTag) {
    errors.push(`gitTag must be ${expected.gitTag}, received ${String(evidence.gitTag ?? 'missing')}`);
  }
  if (expected && evidence.npmDistTag !== 'latest') {
    errors.push(`npmDistTag must be latest for ${expected.version}`);
  }
  if (expected && evidence.githubRelease?.prerelease !== false) {
    errors.push('githubRelease.prerelease must be false');
  }
  if (evidence.target?.platform !== MACOS_DESKTOP_PLATFORM || evidence.target?.arch !== MACOS_ARM64_ARCH) {
    errors.push('target must be macOS arm64 only for Desktop stable distribution');
  }

  errors.push(...collectHashErrors(evidence.app, 'app'));
  errors.push(...collectHashErrors(evidence.dmg, 'dmg'));
  if (!isNonEmptyString(evidence.app?.bundleIdentifier)) {
    errors.push('app.bundleIdentifier is required');
  }
  if (!isNonEmptyString(evidence.app?.infoPlist?.CFBundleShortVersionString)) {
    errors.push('app.infoPlist.CFBundleShortVersionString is required');
  }
  if (!isNonEmptyString(evidence.app?.infoPlist?.CFBundleVersion)) {
    errors.push('app.infoPlist.CFBundleVersion is required');
  }
  if (expected && evidence.app?.infoPlist?.CFBundleShortVersionString !== expected.version) {
    errors.push('app Info.plist CFBundleShortVersionString must match the stable semver version');
  }
  if (expected && evidence.app?.infoPlist?.CFBundleVersion !== expected.version) {
    errors.push('app Info.plist CFBundleVersion must match the stable semver version');
  }

  errors.push(...collectStableCodesignDistributionErrors(evidence.codesign));
  errors.push(...collectStableNotarizationDistributionErrors(evidence.notarization));

  const updater = evidence.updater ?? {};
  if (!isNonEmptyString(updater.publicKey)) {
    errors.push('updater.publicKey is required');
  }
  if (!isNonEmptyString(updater.artifact?.path)) {
    errors.push('updater.artifact.path is required');
  }
  if (isNonEmptyString(updater.artifact?.path) && path.basename(updater.artifact.path) === path.basename(evidence.dmg?.path ?? '')) {
    errors.push('updater.artifact.path must reference the Tauri updater app artifact, not the DMG');
  }
  if (isNonEmptyString(updater.artifact?.path) && updater.artifact.path.endsWith('.dmg')) {
    errors.push('updater.artifact.path must not be a DMG');
  }
  if (!/^[a-f0-9]{64}$/i.test(String(updater.artifact?.sha256 ?? ''))) {
    errors.push('updater.artifact.sha256 must be a SHA-256 hex digest');
  }
  if (!isNonEmptyString(updater.signature?.path)) {
    errors.push('updater.signature.path is required');
  }
  if (!isNonEmptyString(updater.signature?.content)) {
    errors.push('updater.signature.content must contain the generated .sig file content');
  }
  if (expected && updater.manifest?.filename !== expected.updaterManifestFilename) {
    errors.push(`updater.manifest.filename must be ${expected.updaterManifestFilename}`);
  }
  if (expected && updater.releaseLine !== expected.releaseLine) {
    errors.push(`updater.releaseLine must be ${expected.releaseLine}`);
  }
  if (!validUrl(updater.manifest?.url)) {
    errors.push('updater.manifest.url must be an https URL');
  }
  if (updater.manifest?.json) {
    try {
      const manifestValidation = validateDesktopStableUpdaterManifest(updater.manifest.json, {
        version: expected?.version ?? evidence.version,
      });
      errors.push(...manifestValidation.errors);
      const manifestArtifactUrl = manifestValidation.url ? new globalThis.URL(manifestValidation.url) : null;
      if (
        manifestArtifactUrl
        && isNonEmptyString(updater.artifact?.path)
        && path.basename(manifestArtifactUrl.pathname) !== path.basename(updater.artifact.path)
      ) {
        errors.push('updater manifest URL must point to the recorded updater artifact');
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  } else {
    errors.push('updater.manifest.json is required');
  }

  const releaseAssets = Array.isArray(evidence.githubRelease?.assets)
    ? evidence.githubRelease.assets
    : [];
  for (const requiredAsset of [
    evidence.dmg?.path,
    updater.artifact?.path,
    updater.signature?.path,
    updater.manifest?.filename,
    DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_FILENAME,
  ].filter(Boolean)) {
    const basename = path.basename(requiredAsset);
    if (!releaseAssets.some((asset) => asset === basename || asset?.name === basename)) {
      errors.push(`githubRelease.assets must include ${basename}`);
    }
  }

  const secretLeaks = collectSecretLeaks(evidence);
  if (secretLeaks.length > 0) {
    errors.push(`distribution evidence contains secret-looking values at: ${secretLeaks.join(', ')}`);
  }

  return {
    schemaVersion: DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_SCHEMA_VERSION,
    valid: errors.length === 0,
    version: evidence.version ?? null,
    gitTag: evidence.gitTag ?? null,
    releaseLine: expected?.releaseLine ?? null,
    updaterManifestFilename: expected?.updaterManifestFilename ?? null,
    errors,
  };
}

export function validateDesktopUnsignedDmgEvidence(evidence = {}, options = {}) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object') {
    return {
      schemaVersion: DESKTOP_UNSIGNED_DMG_EVIDENCE_SCHEMA_VERSION,
      valid: false,
      errors: [`Missing ${DESKTOP_UNSIGNED_DMG_EVIDENCE_SCHEMA_VERSION} evidence`],
    };
  }
  if (evidence.schemaVersion !== DESKTOP_UNSIGNED_DMG_EVIDENCE_SCHEMA_VERSION) {
    errors.push(
      `Expected unsigned DMG evidence schema ${DESKTOP_UNSIGNED_DMG_EVIDENCE_SCHEMA_VERSION}, received ${String(evidence.schemaVersion ?? 'missing')}`,
    );
  }
  if (evidence.evidenceMode !== 'real') {
    errors.push(`evidenceMode must be real, received ${String(evidence.evidenceMode ?? 'missing')}`);
  }

  let expected;
  try {
    expected = parseDesktopStableVersion(options.version ?? evidence.version);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    expected = null;
  }
  if (expected && evidence.gitTag !== expected.gitTag) {
    errors.push(`gitTag must be ${expected.gitTag}, received ${String(evidence.gitTag ?? 'missing')}`);
  }
  if (expected && evidence.npmDistTag !== 'latest') {
    errors.push(`npmDistTag must be latest for ${expected.version}`);
  }
  if (expected && evidence.githubRelease?.prerelease !== false) {
    errors.push('githubRelease.prerelease must be false');
  }
  if (evidence.target?.platform !== MACOS_DESKTOP_PLATFORM || evidence.target?.arch !== MACOS_ARM64_ARCH) {
    errors.push('target must be macOS arm64 only for unsigned Desktop stable DMG');
  }

  errors.push(...collectHashErrors(evidence.app, 'app'));
  errors.push(...collectHashErrors(evidence.dmg, 'dmg'));
  if (!isNonEmptyString(evidence.app?.bundleIdentifier)) {
    errors.push('app.bundleIdentifier is required');
  }
  if (!isNonEmptyString(evidence.app?.infoPlist?.CFBundleShortVersionString)) {
    errors.push('app.infoPlist.CFBundleShortVersionString is required');
  }
  if (!isNonEmptyString(evidence.app?.infoPlist?.CFBundleVersion)) {
    errors.push('app.infoPlist.CFBundleVersion is required');
  }
  if (expected && evidence.app?.infoPlist?.CFBundleShortVersionString !== expected.version) {
    errors.push('app Info.plist CFBundleShortVersionString must match the stable semver version');
  }
  if (expected && evidence.app?.infoPlist?.CFBundleVersion !== expected.version) {
    errors.push('app Info.plist CFBundleVersion must match the stable semver version');
  }

  const policy = evidence.distributionPolicy ?? {};
  if (policy.signed !== false) {
    errors.push('distributionPolicy.signed must be false for the v0.1.0 unsigned DMG path');
  }
  if (policy.notarized !== false) {
    errors.push('distributionPolicy.notarized must be false for the v0.1.0 unsigned DMG path');
  }
  if (policy.updaterEnabled !== false) {
    errors.push('distributionPolicy.updaterEnabled must be false for the v0.1.0 unsigned DMG path');
  }
  if (policy.gatekeeperWarning !== true) {
    errors.push('distributionPolicy.gatekeeperWarning must be true for unsigned macOS DMGs');
  }
  if (policy.supportTier !== 'preview') {
    errors.push('distributionPolicy.supportTier must be preview');
  }
  if (evidence.codesign || evidence.notarization || evidence.updater) {
    errors.push('unsigned DMG evidence must not include codesign, notarization, or updater claims');
  }

  const releaseAssets = Array.isArray(evidence.githubRelease?.assets)
    ? evidence.githubRelease.assets
    : [];
  for (const requiredAsset of [
    evidence.dmg?.path,
    DESKTOP_UNSIGNED_DMG_EVIDENCE_FILENAME,
  ].filter(Boolean)) {
    const basename = path.basename(requiredAsset);
    if (!releaseAssets.some((asset) => asset === basename || asset?.name === basename)) {
      errors.push(`githubRelease.assets must include ${basename}`);
    }
  }

  const secretLeaks = collectSecretLeaks(evidence);
  if (secretLeaks.length > 0) {
    errors.push(`unsigned DMG evidence contains secret-looking values at: ${secretLeaks.join(', ')}`);
  }

  return {
    schemaVersion: DESKTOP_UNSIGNED_DMG_EVIDENCE_SCHEMA_VERSION,
    valid: errors.length === 0,
    version: evidence.version ?? null,
    gitTag: evidence.gitTag ?? null,
    releaseLine: expected?.releaseLine ?? null,
    errors,
  };
}

export function assertDesktopRcDistributionEvidence(params = {}) {
  const result = validateDesktopRcDistributionEvidence(params.evidence, params);
  if (!result.valid) {
    throw new Error(`Invalid Desktop RC distribution evidence: ${result.errors.join('; ')}`);
  }
  return result;
}

export function assertDesktopUnsignedDmgEvidence(params = {}) {
  const result = validateDesktopUnsignedDmgEvidence(params.evidence, params);
  if (!result.valid) {
    throw new Error(`Invalid Desktop unsigned DMG evidence: ${result.errors.join('; ')}`);
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

export function readDesktopRcDistributionEvidence(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const evidenceRoot = path.resolve(cwd, options.evidenceRoot ?? path.join('.sisyphus', 'evidence'));
  const evidencePath = path.resolve(
    cwd,
    options.evidencePath ?? path.join(evidenceRoot, DESKTOP_RC_DISTRIBUTION_EVIDENCE_FILENAME),
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

export function readDesktopStableDistributionEvidence(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const evidenceRoot = path.resolve(cwd, options.evidenceRoot ?? path.join('.sisyphus', 'evidence'));
  const evidencePath = path.resolve(
    cwd,
    options.evidencePath ?? path.join(evidenceRoot, DESKTOP_STABLE_DISTRIBUTION_EVIDENCE_FILENAME),
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

export function readDesktopUnsignedDmgEvidence(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const evidenceRoot = path.resolve(cwd, options.evidenceRoot ?? path.join('.sisyphus', 'evidence'));
  const evidencePath = path.resolve(
    cwd,
    options.evidencePath ?? path.join(evidenceRoot, DESKTOP_UNSIGNED_DMG_EVIDENCE_FILENAME),
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
