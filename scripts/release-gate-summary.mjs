import { RELEASE_TIERS } from './release-gates.mjs';

function tierIncluded(entryTier, requiredTier) {
  return RELEASE_TIERS.indexOf(entryTier) <= RELEASE_TIERS.indexOf(requiredTier);
}

function requiredEvidenceEntries(entries, requiredTier) {
  if (!requiredTier) {
    return [];
  }
  return entries.filter((entry) => entry.requiredForRelease !== false && tierIncluded(entry.tier, requiredTier));
}

export function summarizeReleaseGates({ entries, gateExitStatus, requiredTier }) {
  const requiredEntries = requiredEvidenceEntries(entries ?? [], requiredTier);
  const missingEvidence = requiredEntries.filter((entry) => !entry.exists);
  const evidenceComplete = missingEvidence.length === 0;
  const gateExitStatusPassed = gateExitStatus?.passed === true;

  return {
    schemaVersion: 'codeagora.release-gate-summary.v1',
    requiredTier: requiredTier ?? null,
    passed: gateExitStatusPassed && evidenceComplete,
    gateExitStatusPassed,
    evidenceComplete,
    requiredEvidenceCount: requiredEntries.length,
    missingEvidence: missingEvidence.map((entry) => ({
      name: entry.name,
      filename: entry.filename,
      tier: entry.tier,
      path: entry.path ?? null,
    })),
    failedGates: gateExitStatus?.failed ?? [],
    missingGateEvidence: gateExitStatus?.missing ?? [],
    incompleteGateEvidence: gateExitStatus?.incomplete ?? [],
  };
}

export function assertReleaseGateSummaryPass(summary) {
  if (summary.passed) {
    return;
  }

  const reasons = [
    summary.gateExitStatusPassed ? '' : 'gate exit status failed',
    summary.evidenceComplete ? '' : `missing evidence: ${summary.missingEvidence.map((entry) => entry.filename).join(', ')}`,
  ].filter(Boolean);

  throw new Error(`Release gate summary did not pass: ${reasons.join('; ')}`);
}
