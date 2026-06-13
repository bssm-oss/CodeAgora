#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { EVIDENCE_COMMAND_LOG } from './evidence-recorder.mjs';
import { assertGateExitStatusesPass, evaluateGateCommandEvidence, readGateCommandEvidence } from './release-gate-evaluator.mjs';
import { assertReleaseGateSummaryPass, summarizeReleaseGates } from './release-gate-summary.mjs';
import { EXPECTED_EVIDENCE, RELEASE_GATE_EXECUTIONS, RELEASE_TIERS, SCHEMA_VERSION } from './release-gates.mjs';

const RELEASE_SURFACES = ['all', 'cli-mcp-github'];
import { RELEASE_EVIDENCE_METADATA_LOG } from './evidence-recorder.mjs';

function parseArgs(argv) {
  const options = {
    evidenceDir: path.join('.sisyphus', 'evidence'),
    output: undefined,
    require: undefined,
    surface: 'all',
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--evidence-dir') {
      options.evidenceDir = argv[++index];
    } else if (arg?.startsWith('--evidence-dir=')) {
      options.evidenceDir = arg.slice('--evidence-dir='.length);
    } else if (arg === '--output') {
      options.output = argv[++index];
    } else if (arg?.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
    } else if (arg === '--require') {
      options.require = argv[++index];
    } else if (arg?.startsWith('--require=')) {
      options.require = arg.slice('--require='.length);
    } else if (arg === '--surface') {
      options.surface = argv[++index];
    } else if (arg?.startsWith('--surface=')) {
      options.surface = arg.slice('--surface='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.require && !RELEASE_TIERS.includes(options.require)) {
    throw new Error(`--require must be one of: ${RELEASE_TIERS.join(', ')}`);
  }
  if (!RELEASE_SURFACES.includes(options.surface)) {
    throw new Error(`--surface must be one of: ${RELEASE_SURFACES.join(', ')}`);
  }

  return options;
}

function commitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function tierIncluded(entryTier, requiredTier) {
  return RELEASE_TIERS.indexOf(entryTier) <= RELEASE_TIERS.indexOf(requiredTier);
}

function isDesktopEvidence(entry) {
  return entry.name?.startsWith('desktop-') || entry.command?.startsWith('pnpm desktop:') || entry.command === 'pnpm rc:desktop-gate';
}

function evidenceEntriesForSurface(surface) {
  if (surface === 'cli-mcp-github') {
    return EXPECTED_EVIDENCE.filter((entry) => !isDesktopEvidence(entry));
  }
  return EXPECTED_EVIDENCE;
}

function deterministicLocalGatesForManifest(entries, requiredTier) {
  return entries.filter((entry) => {
    if (entry.execution !== RELEASE_GATE_EXECUTIONS.LOCAL_COMMAND) {
      return false;
    }
    return requiredTier ? tierIncluded(entry.tier, requiredTier) : true;
  });
}

function readReleaseEvidenceMetadata(evidenceDir) {
  const metadataPath = path.join(evidenceDir, RELEASE_EVIDENCE_METADATA_LOG);
  if (!fs.existsSync(metadataPath)) {
    return [];
  }

  return fs.readFileSync(metadataPath, 'utf-8').split('\n').flatMap((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return [];
    }
    try {
      return [{ ...JSON.parse(trimmed), metadataLine: index + 1 }];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid release evidence metadata JSON on line ${index + 1}: ${message}`);
    }
  });
}

function latestMetadataByName(metadataEntries) {
  const latest = new Map();
  for (const entry of metadataEntries) {
    if (typeof entry?.name !== 'string') {
      continue;
    }
    latest.set(entry.name, entry);
  }
  return latest;
}

function latestGateCommandEvidenceByName(gateEvidenceEntries) {
  const latest = new Map();
  for (const entry of gateEvidenceEntries) {
    if (typeof entry?.name !== 'string') {
      continue;
    }
    latest.set(entry.name, entry);
  }
  return latest;
}

function publicGateCommandEvidence(entry) {
  if (!entry) {
    return null;
  }

  return {
    schemaVersion: entry.schemaVersion ?? null,
    name: entry.name ?? null,
    command: entry.command ?? null,
    exitCode: Number.isInteger(entry.exitCode) ? entry.exitCode : null,
    passed: typeof entry.passed === 'boolean' ? entry.passed : null,
    timestamp: entry.timestamp ?? null,
    startedAt: entry.startedAt ?? null,
    finishedAt: entry.finishedAt ?? null,
    logPath: entry.logPath ?? null,
    logLink: entry.logLink ?? null,
    ledgerLine: entry.ledgerLine ?? null,
  };
}

function buildManifest(options) {
  const evidenceDir = path.resolve(options.evidenceDir);
  const evidenceMetadata = readReleaseEvidenceMetadata(evidenceDir);
  const metadataByName = latestMetadataByName(evidenceMetadata);
  const gateCommandEvidence = readGateCommandEvidence(path.join(evidenceDir, EVIDENCE_COMMAND_LOG));
  const gateCommandEvidenceByName = latestGateCommandEvidenceByName(gateCommandEvidence);
  const expectedEvidence = evidenceEntriesForSurface(options.surface);
  const entries = expectedEvidence.map((entry) => {
    const artifactPath = entry.sourcePath ? path.resolve(entry.sourcePath) : path.join(evidenceDir, entry.filename);
    const exists = fs.existsSync(artifactPath);
    const stat = exists ? fs.statSync(artifactPath) : undefined;
    const latestMetadata = metadataByName.get(entry.name) ?? null;
    const latestCommandEvidence = publicGateCommandEvidence(gateCommandEvidenceByName.get(entry.name));
    return {
      ...entry,
      path: path.relative(process.cwd(), artifactPath),
      exists,
      sizeBytes: stat?.size ?? 0,
      sha256: exists ? sha256(artifactPath) : null,
      latestMetadata,
      latestCommandEvidence,
      artifactLinks: latestMetadata?.artifactLinks ?? [],
      outputLinks: latestMetadata?.outputLinks ?? [],
    };
  });
  const gateExitStatus = evaluateGateCommandEvidence({
    evidenceDir: options.evidenceDir,
    requiredTier: options.require,
    gates: deterministicLocalGatesForManifest(expectedEvidence, options.require),
  });
  const gateSummary = summarizeReleaseGates({
    entries,
    gateExitStatus,
    requiredTier: options.require,
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    commitSha: commitSha(),
    surface: options.surface,
    evidenceDir: path.relative(process.cwd(), evidenceDir),
    evidenceMetadataStore: path.relative(process.cwd(), path.join(evidenceDir, RELEASE_EVIDENCE_METADATA_LOG)),
    gateExitStatus,
    gateSummary,
    entries,
  };
}

function enforceRequired(manifest, requiredTier) {
  if (!requiredTier) return;
  const missing = manifest.entries.filter((entry) => entry.requiredForRelease !== false && tierIncluded(entry.tier, requiredTier) && !entry.exists);
  if (missing.length === 0) return;
  const names = missing.map((entry) => `${entry.filename} (${entry.tier})`).join(', ');
  throw new Error(`Missing required ${requiredTier} evidence: ${names}`);
}

function enforceGateExitStatuses(manifest, requiredTier) {
  if (!requiredTier) return;
  assertGateExitStatusesPass(manifest.gateExitStatus);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(options.output ?? path.join(options.evidenceDir, 'evidence-manifest.json'));
  const manifest = buildManifest(options);
  enforceRequired(manifest, options.require);
  enforceGateExitStatuses(manifest, options.require);
  if (options.require) {
    assertReleaseGateSummaryPass(manifest.gateSummary);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
