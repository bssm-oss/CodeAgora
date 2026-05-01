/**
 * Stable machine-readable contract for CLI/MCP agent consumers.
 */

import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';
import type { ProgressEvent } from '@codeagora/core/pipeline/progress.js';
import { redactDeep } from '@codeagora/shared/utils/redaction.js';

export const AGENT_CONTRACT_VERSION = 'codeagora.review.v1' as const;

export type AgentContractVersion = typeof AGENT_CONTRACT_VERSION;
export type AgentReviewExitCode = 0 | 1 | 3;

export type AgentJsonResult = PipelineResult & {
  schemaVersion: AgentContractVersion;
};

export type AgentProgressNdjsonEvent = ProgressEvent & {
  schemaVersion: AgentContractVersion;
  type: 'progress';
};

export type AgentResultNdjsonEvent = AgentJsonResult & {
  type: 'result';
};

export interface AgentReviewExitOptions {
  failOnReject?: boolean;
  failOnSeverity?: string;
}

export const REVIEW_SEVERITY_ORDER = [
  'SUGGESTION',
  'WARNING',
  'CRITICAL',
  'HARSHLY_CRITICAL',
] as const;

export function withAgentContract(result: PipelineResult): AgentJsonResult {
  const redactedResult = redactDeep(result);
  return {
    ...redactedResult,
    schemaVersion: AGENT_CONTRACT_VERSION,
  };
}

export function formatAgentJson(result: PipelineResult): string {
  return JSON.stringify(withAgentContract(result), null, 2);
}

export function formatProgressNdjsonEvent(event: ProgressEvent): string {
  const redactedEvent = redactDeep(event);
  return JSON.stringify({
    ...redactedEvent,
    schemaVersion: AGENT_CONTRACT_VERSION,
    type: 'progress',
  } satisfies AgentProgressNdjsonEvent);
}

export function formatResultNdjsonEvent(result: PipelineResult): string {
  const redactedResult = redactDeep(result);
  return JSON.stringify({
    ...redactedResult,
    schemaVersion: AGENT_CONTRACT_VERSION,
    type: 'result',
  } satisfies AgentResultNdjsonEvent);
}

export function shouldFailOnSeverity(
  severityCounts: Record<string, number> | undefined,
  thresholdSeverity: string | undefined,
): boolean {
  if (!severityCounts || !thresholdSeverity) return false;

  const threshold = REVIEW_SEVERITY_ORDER.indexOf(
    thresholdSeverity.toUpperCase() as typeof REVIEW_SEVERITY_ORDER[number],
  );
  if (threshold < 0) return false;

  return REVIEW_SEVERITY_ORDER.slice(threshold).some(
    (severity) => (severityCounts[severity] ?? 0) > 0,
  );
}

export function getAgentReviewExitCode(
  result: PipelineResult,
  options: AgentReviewExitOptions = {},
): AgentReviewExitCode {
  if (result.status !== 'success') return 3;

  if (options.failOnReject && result.summary?.decision === 'REJECT') {
    return 1;
  }

  if (shouldFailOnSeverity(result.summary?.severityCounts, options.failOnSeverity)) {
    return 1;
  }

  return 0;
}
