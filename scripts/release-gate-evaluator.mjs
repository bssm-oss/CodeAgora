#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EVIDENCE_COMMAND_LOG } from './evidence-recorder.mjs';
import { deterministicLocalReleaseGates, RELEASE_TIERS } from './release-gates.mjs';

function tierIncluded(entryTier, requiredTier) {
  return RELEASE_TIERS.indexOf(entryTier) <= RELEASE_TIERS.indexOf(requiredTier);
}

function parseArgs(argv) {
  const options = {
    evidenceDir: path.join('.sisyphus', 'evidence'),
    ledgerPath: undefined,
    require: undefined,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--evidence-dir') {
      options.evidenceDir = argv[++index];
    } else if (arg?.startsWith('--evidence-dir=')) {
      options.evidenceDir = arg.slice('--evidence-dir='.length);
    } else if (arg === '--ledger') {
      options.ledgerPath = argv[++index];
    } else if (arg?.startsWith('--ledger=')) {
      options.ledgerPath = arg.slice('--ledger='.length);
    } else if (arg === '--require') {
      options.require = argv[++index];
    } else if (arg?.startsWith('--require=')) {
      options.require = arg.slice('--require='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.require && !RELEASE_TIERS.includes(options.require)) {
    throw new Error(`--require must be one of: ${RELEASE_TIERS.join(', ')}`);
  }

  return options;
}

export function readGateCommandEvidence(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) {
    return [];
  }

  const lines = fs.readFileSync(ledgerPath, 'utf-8').split('\n');
  return lines.flatMap((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return [];
    }
    try {
      return [{ ...JSON.parse(trimmed), ledgerLine: index + 1 }];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid gate command evidence JSON on line ${index + 1}: ${message}`);
    }
  });
}

export function deterministicGatesForTier(requiredTier) {
  const gates = deterministicLocalReleaseGates();
  if (!requiredTier) {
    return gates;
  }
  return gates.filter((gate) => tierIncluded(gate.tier, requiredTier));
}

export function evaluateGateExitStatuses(entries, options = {}) {
  const gates = options.gates ?? deterministicGatesForTier(options.requiredTier);
  const latestByName = new Map();

  for (const entry of entries) {
    if (typeof entry?.name !== 'string') {
      continue;
    }
    latestByName.set(entry.name, entry);
  }

  function completenessIssues(evidence, gate) {
    if (!evidence) {
      return [];
    }

    const issues = [];
    if (evidence.schemaVersion !== 'codeagora.release-gate-command-evidence.v1') {
      issues.push('schemaVersion');
    }
    if (evidence.command !== gate.command) {
      issues.push('command');
    }
    if (!Number.isInteger(evidence.exitCode)) {
      issues.push('exitCode');
    }
    if (typeof evidence.timestamp !== 'string' || evidence.timestamp.length === 0) {
      issues.push('timestamp');
    }
    const hasLogPath = typeof evidence.logPath === 'string' && evidence.logPath.length > 0;
    const hasLogLink = typeof evidence.logLink === 'string' && evidence.logLink.length > 0;
    if (!hasLogPath && !hasLogLink) {
      issues.push('logPathOrLink');
    }
    return issues;
  }

  const gateResults = gates.map((gate) => {
    const evidence = latestByName.get(gate.name);
    const completeness = completenessIssues(evidence, gate);
    const exitCode = Number.isInteger(evidence?.exitCode) ? evidence.exitCode : null;
    const evidenceComplete = Boolean(evidence) && completeness.length === 0;
    const passed = evidenceComplete && exitCode === 0;
    const missing = !evidence;

    return {
      name: gate.name,
      command: gate.command,
      filename: gate.filename,
      tier: gate.tier,
      exitCode,
      passed,
      missing,
      evidenceComplete,
      completeness,
      logPath: evidence?.logPath ?? null,
      logLink: evidence?.logLink ?? null,
      timestamp: evidence?.timestamp ?? evidence?.finishedAt ?? null,
      ledgerLine: evidence?.ledgerLine ?? null,
    };
  });

  const missing = gateResults.filter((result) => result.missing);
  const incomplete = gateResults.filter((result) => !result.missing && !result.evidenceComplete);
  const failed = gateResults.filter((result) => !result.missing && result.exitCode !== 0);

  return {
    schemaVersion: 'codeagora.release-gate-exit-status.v1',
    requiredTier: options.requiredTier ?? null,
    passed: missing.length === 0 && incomplete.length === 0 && failed.length === 0,
    total: gateResults.length,
    passedCount: gateResults.filter((result) => result.passed).length,
    missing,
    incomplete,
    failed,
    gates: gateResults,
  };
}

export function evaluateGateCommandEvidence(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const evidenceDir = path.resolve(cwd, options.evidenceDir ?? path.join('.sisyphus', 'evidence'));
  const ledgerPath = path.resolve(cwd, options.ledgerPath ?? path.join(evidenceDir, EVIDENCE_COMMAND_LOG));
  const entries = readGateCommandEvidence(ledgerPath);

  return {
    ledgerPath: path.relative(cwd, ledgerPath),
    ...evaluateGateExitStatuses(entries, { requiredTier: options.requiredTier, gates: options.gates }),
  };
}

export function assertGateExitStatusesPass(evaluation) {
  if (evaluation.passed) {
    return;
  }

  const failed = evaluation.failed.map((gate) => `${gate.name} (${gate.exitCode})`);
  const missing = evaluation.missing.map((gate) => gate.name);
  const incomplete = evaluation.incomplete.map((gate) => `${gate.name} (${gate.completeness.join(', ')})`);
  const reasons = [
    failed.length > 0 ? `failed: ${failed.join(', ')}` : '',
    missing.length > 0 ? `missing: ${missing.join(', ')}` : '',
    incomplete.length > 0 ? `incomplete: ${incomplete.join(', ')}` : '',
  ].filter(Boolean);

  throw new Error(`Deterministic release gates did not all record complete passing evidence: ${reasons.join('; ')}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const evaluation = evaluateGateCommandEvidence({
    evidenceDir: options.evidenceDir,
    ledgerPath: options.ledgerPath,
    requiredTier: options.require,
  });

  console.log(JSON.stringify(evaluation, null, 2));
  assertGateExitStatusesPass(evaluation);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
