/**
 * L0 Model Intelligence Layer — Public API
 * Resolves auto reviewers into concrete AgentConfig via model selection.
 */

import type { AgentConfig, ReviewerEntry } from '../types/config.js';
import type { ModelRouterConfig, BanditArm } from '../types/l0.js';
import type { ReviewerInput } from '../l1/reviewer.js';
import { getAvailableModels, loadRegistry } from './model-registry.js';
import { HealthMonitor } from './health-monitor.js';
import { selectModels, createBanditState } from './model-selector.js';
import { BanditStore } from './bandit-store.js';

// ============================================================================
// Module State
// ============================================================================

let healthMonitor: HealthMonitor | null = null;
let banditStore: BanditStore | null = null;
let banditState: Map<string, BanditArm> = createBanditState();
let initialized = false;

// ============================================================================
// Initialization
// ============================================================================

export async function initL0(routerConfig?: ModelRouterConfig): Promise<void> {
  if (initialized) return;

  await loadRegistry();

  healthMonitor = new HealthMonitor({
    circuitBreaker: routerConfig?.circuitBreaker,
    dailyBudget: routerConfig?.dailyBudget,
  });

  // Load persisted bandit state
  banditStore = new BanditStore();
  await banditStore.load();
  banditState = banditStore.getAllArms();

  initialized = true;
}

/**
 * Reset L0 state (for testing).
 */
export function resetL0(): void {
  healthMonitor = null;
  banditStore = null;
  banditState = createBanditState();
  initialized = false;
}

/**
 * Get the active bandit store (for quality feedback persistence).
 */
export function getBanditStore(): BanditStore | null {
  return banditStore;
}

// ============================================================================
// Resolve Reviewers
// ============================================================================

export interface ResolveResult {
  reviewerInputs: ReviewerInput[];
  autoCount: number;
}

/**
 * Resolve reviewer entries into concrete ReviewerInputs.
 * Static reviewers pass through unchanged.
 * Auto reviewers are filled by L0 model selection.
 */
export async function resolveReviewers(
  reviewers: ReviewerEntry[],
  fileGroups: Array<{ name: string; diffContent: string; prSummary: string }>,
  routerConfig?: ModelRouterConfig
): Promise<ResolveResult> {
  const enabledReviewers = reviewers.filter((r) => r.enabled);

  // Separate static and auto reviewers
  const staticReviewers: AgentConfig[] = [];
  const autoSlots: Array<{ id: string; persona?: string }> = [];

  for (const entry of enabledReviewers) {
    if ('auto' in entry && entry.auto === true) {
      autoSlots.push({ id: entry.id, persona: entry.persona });
    } else {
      staticReviewers.push(entry as AgentConfig);
    }
  }

  // If no auto reviewers or router disabled, use static only
  if (autoSlots.length === 0 || !routerConfig?.enabled) {
    if (autoSlots.length > 0 && !routerConfig?.enabled) {
      throw new Error(
        'Auto reviewers require modelRouter.enabled = true in config'
      );
    }

    return {
      reviewerInputs: buildInputs(staticReviewers, fileGroups),
      autoCount: 0,
    };
  }

  // Initialize L0 if needed
  await initL0(routerConfig);

  // Get available models from enabled providers
  const providerNames = routerConfig.providers
    ? Object.entries(routerConfig.providers)
        .filter(([, v]) => (v as { enabled: boolean }).enabled)
        .map(([k]) => k)
    : ['groq', 'nim', 'openrouter'];

  const allModels = getAvailableModels(providerNames);

  // Filter by health (circuit breaker + RPD budget)
  const monitor = healthMonitor!;
  const healthyModels = allModels.filter((m) =>
    monitor.isAvailable(m.source, m.modelId)
  );

  // D-13: Filter by contextMin constraint if specified
  const contextMin = routerConfig.constraints?.contextMin;
  let candidateModels = contextMin
    ? healthyModels.filter((m) => parseContextK(m.context) >= parseContextK(contextMin))
    : healthyModels;

  // Filter out reasoning models when includeReasoning is false
  const includeReasoning = routerConfig.constraints?.includeReasoning ?? true;
  if (!includeReasoning) {
    candidateModels = candidateModels.filter((m) => !m.isReasoning);
  }

  // Select models for auto slots
  const selection = selectModels({
    count: autoSlots.length,
    availableModels: candidateModels,
    banditState,
    constraints: routerConfig.constraints,
    explorationRate: routerConfig.explorationRate,
  });

  // Build AgentConfigs for auto slots
  const autoConfigs: AgentConfig[] = selection.selections.map((sel, i) => ({
    id: autoSlots[i].id,
    model: sel.modelId,
    backend: 'api' as const,
    provider: sel.provider,
    persona: autoSlots[i].persona,
    timeout: 120,
    enabled: true,
  }));

  // Combine static + auto reviewers
  const allConfigs = [...staticReviewers, ...autoConfigs];

  // Build ReviewerInputs with selectionMeta for auto reviewers
  const inputs: ReviewerInput[] = [];
  for (let i = 0; i < allConfigs.length; i++) {
    const config = allConfigs[i];
    const group = fileGroups[i % fileGroups.length];

    const selectionEntry = selection.selections.find(
      (s) => s.modelId === config.model && s.provider === config.provider
    );

    inputs.push({
      config,
      groupName: group.name,
      diffContent: group.diffContent,
      prSummary: group.prSummary,
      ...(selectionEntry && {
        selectionMeta: {
          selectionReason: selectionEntry.selectionReason,
          family: selectionEntry.family,
          isReasoning: selectionEntry.isReasoning,
        },
      }),
    });
  }

  return { reviewerInputs: inputs, autoCount: autoSlots.length };
}

// ============================================================================
// Helpers
// ============================================================================

function buildInputs(
  configs: AgentConfig[],
  fileGroups: Array<{ name: string; diffContent: string; prSummary: string }>
): ReviewerInput[] {
  return configs.map((config, i) => {
    const group = fileGroups[i % fileGroups.length];
    return {
      config,
      groupName: group.name,
      diffContent: group.diffContent,
      prSummary: group.prSummary,
    };
  });
}

/**
 * Parse a context size string like "32k", "128k", "1m" into a token count.
 */
function parseContextK(size: string): number {
  const lower = size.toLowerCase().trim();
  const m = /^(\d+(?:\.\d+)?)\s*([km]?)$/.exec(lower);
  if (!m) return 0;
  const n = parseFloat(m[1]!);
  if (m[2] === 'k') return Math.round(n * 1_000);
  if (m[2] === 'm') return Math.round(n * 1_000_000);
  return Math.round(n);
}

// Re-export for convenience
export { HealthMonitor } from './health-monitor.js';
export { selectModels, createBanditState, updateBandit } from './model-selector.js';
export { loadRegistry, getAvailableModels, getAllModels } from './model-registry.js';
export { extractFamily, isReasoningModel } from './family-classifier.js';
export { BanditStore } from './bandit-store.js';
export { QualityTracker } from './quality-tracker.js';
export { scoreSpecificity, scoreReviewerSpecificity } from './specificity-scorer.js';
