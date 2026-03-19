/**
 * Dry-Run Pipeline Mode
 * Shows pipeline execution plan and cost estimates without making real LLM calls.
 */

import type { Config } from '../types/config.js';
import { estimateCost, formatCost } from './cost-estimator.js';
import type { TokenUsage } from './telemetry.js';
import {
  getEnabledReviewerEntries,
  getEnabledSupporters,
  isDeclarativeReviewers,
  expandDeclarativeReviewers,
} from '../config/loader.js';
import { PROVIDER_ENV_VARS } from '@codeagora/shared/providers/env-vars.js';

export type { TokenUsage };

// ============================================================================
// Result Types
// ============================================================================

export interface DryRunResult {
  config: {
    reviewerCount: number;
    supporterCount: number;
    maxDiscussionRounds: number;
  };
  reviewers: Array<{
    id: string;
    provider: string;
    model: string;
    backend: string;
    isAuto: boolean;
  }>;
  estimation: {
    estimatedL1Tokens: number;
    estimatedL1Cost: string;
    estimatedL2Tokens: number;
    estimatedL2Cost: string;
    estimatedL3Tokens: number;
    estimatedL3Cost: string;
    totalEstimatedCost: string;
  };
  health: Array<{
    provider: string;
    status: 'available' | 'no-api-key' | 'unknown';
  }>;
  warnings: string[];
}

// PROVIDER_ENV_VARS imported from providers/env-vars.ts (single source of truth)

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count from diff content.
 * Heuristic: chars / 4 ≈ tokens (standard approximation).
 */
export function estimateTokensFromDiff(diffContent: string): number {
  if (!diffContent) return 0;
  return Math.ceil(diffContent.length / 4);
}

// ============================================================================
// Core dry-run logic
// ============================================================================

/**
 * Run a dry-run analysis: no file I/O, no LLM calls.
 * Returns execution plan and cost estimates based on config + diff size.
 */
export async function dryRun(config: Config, diffContent: string): Promise<DryRunResult> {
  const warnings: string[] = [];

  // ---- Resolve reviewer entries (handles both array and declarative formats) ----
  const reviewerEntries = isDeclarativeReviewers(config.reviewers)
    ? expandDeclarativeReviewers(config.reviewers).filter((r) => r.enabled)
    : getEnabledReviewerEntries(config);

  const enabledSupporters = getEnabledSupporters(config);
  const maxRounds = config.discussion.maxRounds;

  // ---- Build reviewer list ----
  const reviewers: DryRunResult['reviewers'] = reviewerEntries.map((entry) => {
    if ('auto' in entry && entry.auto === true) {
      return {
        id: entry.id,
        provider: 'auto',
        model: 'auto',
        backend: 'api',
        isAuto: true,
      };
    }
    const agent = entry as import('../types/config.js').AgentConfig;
    return {
      id: agent.id,
      provider: agent.provider ?? 'unknown',
      model: agent.model,
      backend: agent.backend,
      isAuto: false,
    };
  });

  // ---- Token estimation ----
  const diffTokens = estimateTokensFromDiff(diffContent);

  // L1: each reviewer gets the diff as input; output ≈ 1.5x input
  const l1InputTokens = diffTokens * reviewers.length;
  const l1OutputTokens = Math.ceil(l1InputTokens * 1.5);
  const estimatedL1Tokens = l1InputTokens + l1OutputTokens;

  // L2: discussion rounds × supporters × avg_tokens_per_turn
  // avg_tokens_per_turn heuristic: 512 input + 512 output per participant per round
  const AVG_DISCUSSION_TOKENS_PER_TURN = 1024;
  const discussionParticipants = enabledSupporters.length + 1; // supporters + moderator
  const estimatedL2Tokens =
    maxRounds * discussionParticipants * AVG_DISCUSSION_TOKENS_PER_TURN;

  // L3: verdict — summarise all reviews; input ≈ all L1 outputs, output ≈ 512
  const AVG_L3_OUTPUT_TOKENS = 512;
  const estimatedL3Tokens = l1OutputTokens + AVG_L3_OUTPUT_TOKENS;

  // ---- Cost estimation ----
  // Use a representative provider/model from static reviewers; fall back to groq/llama
  const staticReviewer = reviewers.find((r) => !r.isAuto);
  const reprProvider = staticReviewer?.provider ?? 'groq';
  const reprModel = staticReviewer?.model ?? 'llama-3.3-70b-versatile';

  // Moderator provider/model for L2/L3
  const modProvider = config.moderator.provider ?? 'groq';
  const modModel = config.moderator.model;

  const l1Usage: TokenUsage = {
    promptTokens: l1InputTokens,
    completionTokens: l1OutputTokens,
    totalTokens: estimatedL1Tokens,
  };
  const l2Usage: TokenUsage = {
    promptTokens: Math.ceil(estimatedL2Tokens / 2),
    completionTokens: Math.ceil(estimatedL2Tokens / 2),
    totalTokens: estimatedL2Tokens,
  };
  const l3Usage: TokenUsage = {
    promptTokens: l1OutputTokens,
    completionTokens: AVG_L3_OUTPUT_TOKENS,
    totalTokens: estimatedL3Tokens,
  };

  const l1Cost = await estimateCost(l1Usage, reprProvider, reprModel);
  const l2Cost = await estimateCost(l2Usage, modProvider, modModel);
  const l3Cost = await estimateCost(l3Usage, modProvider, modModel);

  // Total: sum valid costs only (skip -1 unknowns)
  const validCosts = [l1Cost, l2Cost, l3Cost].filter((c) => c.totalCost >= 0);
  const totalNumeric = validCosts.reduce((acc, c) => acc + c.totalCost, 0);
  const totalEstimatedCost =
    validCosts.length === 0 ? 'N/A' : `$${totalNumeric.toFixed(4)}`;

  // ---- Provider health check ----
  const seenProviders = new Set<string>();
  const health: DryRunResult['health'] = [];

  // Collect all unique non-auto providers from reviewers + moderator + supporters
  for (const r of reviewers) {
    if (!r.isAuto && r.provider !== 'unknown') seenProviders.add(r.provider);
  }
  seenProviders.add(modProvider);
  for (const s of enabledSupporters) {
    if (s.provider) seenProviders.add(s.provider);
  }

  for (const provider of seenProviders) {
    const envVar = PROVIDER_ENV_VARS[provider];
    if (!envVar) {
      health.push({ provider, status: 'unknown' });
    } else if (process.env[envVar]) {
      health.push({ provider, status: 'available' });
    } else {
      health.push({ provider, status: 'no-api-key' });
      warnings.push(`${envVar} not set — ${provider} reviewers may fail`);
    }
  }

  // Warn about auto reviewers
  const autoCount = reviewers.filter((r) => r.isAuto).length;
  if (autoCount > 0) {
    const missingKeys = health
      .filter((h) => h.status === 'no-api-key')
      .map((h) => `${PROVIDER_ENV_VARS[h.provider] ?? h.provider}`);
    if (missingKeys.length > 0) {
      warnings.push(
        `${autoCount} auto reviewer(s) assigned at runtime — missing keys: ${missingKeys.join(', ')}`
      );
    }
  }

  return {
    config: {
      reviewerCount: reviewers.length,
      supporterCount: enabledSupporters.length,
      maxDiscussionRounds: maxRounds,
    },
    reviewers,
    estimation: {
      estimatedL1Tokens,
      estimatedL1Cost: formatCost(l1Cost),
      estimatedL2Tokens,
      estimatedL2Cost: formatCost(l2Cost),
      estimatedL3Tokens,
      estimatedL3Cost: formatCost(l3Cost),
      totalEstimatedCost,
    },
    health,
    warnings,
  };
}

// ============================================================================
// Human-readable formatter
// ============================================================================

/**
 * Format a DryRunResult as human-readable text.
 */
export function formatDryRunText(result: DryRunResult): string {
  const lines: string[] = [];

  lines.push('Pipeline Dry Run Report');
  lines.push('========================');
  lines.push('');
  lines.push(
    `Config: ${result.config.reviewerCount} reviewers, ` +
      `${result.config.supporterCount} supporters, ` +
      `max ${result.config.maxDiscussionRounds} rounds`
  );
  lines.push('');

  lines.push('Reviewers:');
  for (const r of result.reviewers) {
    if (r.isAuto) {
      lines.push(`  - ${r.id} (auto) | model assigned at runtime`);
    } else {
      lines.push(`  - ${r.id} (static) | ${r.provider}/${r.model}`);
    }
  }
  lines.push('');

  lines.push('Cost Estimation:');
  lines.push(`  L1 (Review):     ~${result.estimation.estimatedL1Cost}`);
  lines.push(`  L2 (Discussion): ~${result.estimation.estimatedL2Cost}`);
  lines.push(`  L3 (Verdict):    ~${result.estimation.estimatedL3Cost}`);
  lines.push(`  Total:           ~${result.estimation.totalEstimatedCost}`);
  lines.push('');

  lines.push('Provider Health:');
  for (const h of result.health) {
    const envVar = PROVIDER_ENV_VARS[h.provider];
    if (h.status === 'available') {
      lines.push(`  ✓ ${h.provider} (${envVar} set)`);
    } else if (h.status === 'no-api-key') {
      lines.push(`  ✗ ${h.provider} (${envVar} missing)`);
    } else {
      lines.push(`  ? ${h.provider} (unknown provider)`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of result.warnings) {
      lines.push(`  ⚠ ${w}`);
    }
  }

  return lines.join('\n');
}
