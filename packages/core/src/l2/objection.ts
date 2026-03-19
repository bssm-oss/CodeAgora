/**
 * L2 Supporter Objection Protocol
 * Implements 이의제기권 for supporters
 */

import type { DiscussionRound } from '../types/core.js';
import type { SupporterConfig } from '../types/config.js';
import { executeBackend } from '../l1/backend.js';

export interface ObjectionResult {
  hasObjections: boolean;
  objections: Array<{
    supporterId: string;
    reasoning: string;
  }>;
}

/**
 * Check if supporters object to moderator's consensus declaration
 */
export async function checkForObjections(
  consensusDeclaration: string,
  supporterConfigs: SupporterConfig[],
  previousRounds: DiscussionRound[]
): Promise<ObjectionResult> {
  const objections: Array<{ supporterId: string; reasoning: string }> = [];

  const results = await Promise.allSettled(
    supporterConfigs.map((config) =>
      executeSupporterObjectionCheck(config, consensusDeclaration, previousRounds)
    )
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.hasObjection) {
      objections.push({
        supporterId: result.value.supporterId,
        reasoning: result.value.reasoning,
      });
    }
  }

  return {
    hasObjections: objections.length > 0,
    objections,
  };
}

async function executeSupporterObjectionCheck(
  config: SupporterConfig,
  consensusDeclaration: string,
  previousRounds: DiscussionRound[]
): Promise<{
  supporterId: string;
  hasObjection: boolean;
  reasoning: string;
}> {
  const prompt = buildObjectionPrompt(consensusDeclaration, previousRounds);

  const response = await executeBackend({
    backend: config.backend,
    model: config.model,
    prompt,
    timeout: 60,
  });

  const hasObjection = parseObjectionResponse(response);

  return {
    supporterId: config.id,
    hasObjection,
    reasoning: response.trim(),
  };
}

function buildObjectionPrompt(
  consensusDeclaration: string,
  previousRounds: DiscussionRound[]
): string {
  return `The moderator has declared consensus:

"${consensusDeclaration}"

Previous discussion rounds:
${previousRounds
  .map(
    (r, i) =>
      `Round ${i + 1}:\n${r.supporterResponses.map((s) => `- ${s.supporterId}: ${s.stance}`).join('\n')}`
  )
  .join('\n\n')}

As a supporter, do you OBJECT to this consensus?
- If you object, explain why (new evidence, flawed reasoning, etc.)
- If you agree, say "NO OBJECTION"

Your response:`;
}

const CONSENT_PATTERNS = [/no objection/i, /i accept/i, /i agree/i, /agree with/i, /concur/i, /support the/i];

function parseObjectionResponse(response: string): boolean {
  if (CONSENT_PATTERNS.some((p) => p.test(response))) return false;
  return !response.toLowerCase().includes("don't object");
}

/**
 * Handle objections by extending discussion
 */
export function handleObjections(objections: ObjectionResult): {
  shouldExtend: boolean;
  extensionReason: string;
} {
  if (!objections.hasObjections) {
    return {
      shouldExtend: false,
      extensionReason: '',
    };
  }

  const reasons = objections.objections.map((o) => `${o.supporterId}: ${o.reasoning}`);

  return {
    shouldExtend: true,
    extensionReason: `Objections raised by ${objections.objections.length} supporter(s):\n${reasons.join('\n')}`,
  };
}
