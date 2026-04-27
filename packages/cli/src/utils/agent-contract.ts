/**
 * Stable machine-readable contract for CLI/MCP agent consumers.
 */

import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';
import type { ProgressEvent } from '@codeagora/core/pipeline/progress.js';

export const AGENT_CONTRACT_VERSION = 'codeagora.review.v1' as const;

export type AgentContractVersion = typeof AGENT_CONTRACT_VERSION;

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

export function withAgentContract(result: PipelineResult): AgentJsonResult {
  return {
    schemaVersion: AGENT_CONTRACT_VERSION,
    ...result,
  };
}

export function formatAgentJson(result: PipelineResult): string {
  return JSON.stringify(withAgentContract(result), null, 2);
}

export function formatProgressNdjsonEvent(event: ProgressEvent): string {
  return JSON.stringify({
    schemaVersion: AGENT_CONTRACT_VERSION,
    type: 'progress',
    ...event,
  } satisfies AgentProgressNdjsonEvent);
}

export function formatResultNdjsonEvent(result: PipelineResult): string {
  return JSON.stringify({
    type: 'result',
    ...withAgentContract(result),
  } satisfies AgentResultNdjsonEvent);
}
