import fs from 'node:fs';
import path from 'node:path';

export const EVIDENCE_COMMAND_LOG = 'gate-command-evidence.jsonl';
export const RELEASE_EVIDENCE_METADATA_LOG = 'release-evidence-metadata.jsonl';

function relativePath(fromCwd, targetPath) {
  return path.relative(fromCwd, targetPath) || path.basename(targetPath);
}

function formatGateLog(result) {
  const lines = [
    `name: ${result.name}`,
    `command: ${result.command}`,
    `exitCode: ${result.exitCode}`,
    `startedAt: ${result.startedAt}`,
    `finishedAt: ${result.finishedAt}`,
    '',
    '--- stdout ---',
    result.stdout ?? '',
    '',
    '--- stderr ---',
    result.stderr ?? '',
  ];
  return `${lines.join('\n')}\n`;
}

export function buildEvidenceEntry(result, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const evidenceDir = path.resolve(cwd, options.evidenceDir ?? path.join('.sisyphus', 'evidence'));
  const logPath = result.logPath ?? path.join(evidenceDir, result.filename);
  const timestamp = result.finishedAt ?? new Date().toISOString();

  return {
    schemaVersion: 'codeagora.release-gate-command-evidence.v1',
    name: result.name,
    command: result.command,
    exitCode: result.exitCode,
    passed: result.exitCode === 0,
    timestamp,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    logPath: relativePath(cwd, logPath),
    logLink: result.logLink ?? null,
  };
}

export function recordGateCommandEvidence(result, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const evidenceDir = path.resolve(cwd, options.evidenceDir ?? path.join('.sisyphus', 'evidence'));
  const logPath = path.join(evidenceDir, result.filename);
  const ledgerPath = path.resolve(cwd, options.ledgerPath ?? path.join(evidenceDir, EVIDENCE_COMMAND_LOG));
  const entry = buildEvidenceEntry({ ...result, logPath }, { ...options, cwd });

  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(logPath, formatGateLog(result));
  fs.appendFileSync(ledgerPath, `${JSON.stringify(entry)}\n`);

  return {
    entry,
    logPath,
    ledgerPath,
  };
}
