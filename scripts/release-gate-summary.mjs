import { RELEASE_TIERS } from './release-gates.mjs';

function tierIncluded(entryTier, requiredTier) {
  return RELEASE_TIERS.indexOf(entryTier) <= RELEASE_TIERS.indexOf(requiredTier);
}

function entryIncludedForRequiredTier(entry, requiredTier) {
  if (requiredTier === 'stable' && entry.stableCarryForward === false) {
    return false;
  }
  return tierIncluded(entry.tier, requiredTier);
}

function requiredEvidenceEntries(entries, requiredTier) {
  if (!requiredTier) {
    return [];
  }
  return entries.filter((entry) => (
    entry.requiredForRelease !== false
    && entryIncludedForRequiredTier(entry, requiredTier)
  ));
}

export function summarizeReleaseGates({ entries, gateExitStatus, requiredTier }) {
  const requiredEntries = requiredEvidenceEntries(entries ?? [], requiredTier);
  const missingEvidence = requiredEntries.filter((entry) => !entry.exists);
  const invalidEvidence = requiredEntries.filter((entry) => (
    entry.exists
    && entry.releaseValidity !== undefined
    && entry.releaseValidity.validForRelease !== true
  ));
  const evidenceComplete = missingEvidence.length === 0;
  const evidenceValid = invalidEvidence.length === 0;
  const gateExitStatusPassed = gateExitStatus?.passed === true;

  return {
    schemaVersion: 'codeagora.release-gate-summary.v1',
    requiredTier: requiredTier ?? null,
    passed: gateExitStatusPassed && evidenceComplete && evidenceValid,
    gateExitStatusPassed,
    evidenceComplete,
    evidenceValid,
    requiredEvidenceCount: requiredEntries.length,
    missingEvidence: missingEvidence.map((entry) => ({
      name: entry.name,
      filename: entry.filename,
      tier: entry.tier,
      path: entry.path ?? null,
    })),
    invalidEvidence: invalidEvidence.map((entry) => ({
      name: entry.name,
      filename: entry.filename,
      tier: entry.tier,
      path: entry.path ?? null,
      evidenceMode: entry.releaseValidity?.evidenceMode ?? null,
      reason: entry.releaseValidity?.reason ?? 'invalid',
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
    summary.evidenceValid ? '' : `invalid evidence: ${summary.invalidEvidence.map((entry) => `${entry.filename} (${entry.reason})`).join(', ')}`,
  ].filter(Boolean);

  throw new Error(`Release gate summary did not pass: ${reasons.join('; ')}`);
}
